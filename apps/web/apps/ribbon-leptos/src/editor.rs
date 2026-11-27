//! The canvas host: pages rasterized by the engine, the text-input path (keyboard, IME,
//! clipboard), and the caret/selection overlay. Same flow as the React `CanvasEditor.tsx`:
//! click → engine hit-test → caret; edit → layout JSON → repaint. Differences are deliberate:
//! typed text goes through `insert_text` (UTF-8 safe), the overlay is positioned DOM nodes (a
//! caret move never re-uploads page pixels), and the clipboard uses native copy/cut/paste events.

use leptos::ev::InputEvent;
use leptos::prelude::*;
use wasm_bindgen::closure::Closure;
use wasm_bindgen::JsCast;
use web_sys::{
    ClipboardEvent, HtmlCanvasElement, HtmlElement, HtmlTextAreaElement, KeyboardEvent, MouseEvent,
};

use crate::ribbon::control::Pressed;
use crate::ribbon::engine::{pages_of, pressed_from_formatting, Doc, Rect};

/// Everything the page view needs. `rev` bumps ONLY when page pixels change (→ repaint); the
/// overlay moves many times per second and must not cost a 3.5 MB `putImageData` each time.
#[derive(Clone, Copy)]
pub struct PageView {
    pub pages: RwSignal<Vec<(u32, u32)>>,
    pub rev: RwSignal<u32>,
    pub overlay: RwSignal<Overlay>,
}

/// Cheap overlay state, drawn as absolutely-positioned `<div>`s on top of the page canvases.
#[derive(Clone, Default, PartialEq)]
pub struct Overlay {
    /// `(page, x, y)` in canvas px. `page` is the page of the last click — see `Doc::caret_xy`.
    pub caret: Option<(usize, f32, f32)>,
    pub selection: Vec<Vec<Rect>>,
}

impl PageView {
    pub fn new() -> Self {
        Self {
            pages: RwSignal::new(vec![]),
            rev: RwSignal::new(0),
            overlay: RwSignal::new(Overlay::default()),
        }
    }

    /// Apply what every mutating engine call returns (the new layout) and sync the ribbon's
    /// toggled buttons to the formatting at the caret. The ONE place document changes land.
    pub fn refresh(&self, pressed: &Pressed, d: &Doc, layout: &str) {
        // Only a page layout (top-level array) can change pixels. `{}` (engine no-op), a cursor
        // JSON or `""` just move the caret/selection — never a putImageData.
        let pages = pages_of(layout);
        if !pages.is_empty() {
            self.pages.set(pages);
            self.rev.update(|r| *r += 1);
        }
        self.sync_overlay(pressed, d);
    }

    /// Caret + selection from the engine, ribbon toggles from the formatting at the caret.
    /// For moves that change no pixels (click, drag-select): the overlay is DOM, the canvas stays.
    pub fn sync_overlay(&self, pressed: &Pressed, d: &Doc) {
        let page = self
            .overlay
            .try_with(|o| o.caret.map_or(0, |c| c.0))
            .unwrap_or(0);
        let selection = d.selection_rects();
        let selecting = selection.iter().flatten().next().is_some();
        self.overlay.set(Overlay {
            // OnlyOffice hides the caret while a selection is shown.
            caret: if selecting {
                None
            } else {
                d.caret_xy().map(|(x, y)| (page, x, y))
            },
            selection,
        });
        if let Ok(f) = d.run_formatting() {
            pressed.set(pressed_from_formatting(&f));
        }
    }
}

/// Keys the engine handles itself (the rest are plain text or left to the browser). Only these
/// get `prevent_default` — Tab, F-keys and Alt combos must keep their browser behaviour.
const ENGINE_KEYS: [&str; 9] = [
    "Enter",
    "Backspace",
    "Delete",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
];

/// Ctrl/⌘ combos `handle_key_event` implements (lib.rs ctrl branch). Everything else — Ctrl+S,
/// Ctrl+F, Ctrl+P… — stays with the browser rather than becoming an engine no-op.
const ENGINE_CTRL: [&str; 6] = ["a", "z", "y", "b", "i", "u"];

fn input_el() -> Option<HtmlTextAreaElement> {
    window()
        .document()?
        .get_element_by_id("ime-bridge")?
        .dyn_into()
        .ok()
}

/// Everything an input handler needs, by copy (all signals + the `u32` document handle).
#[derive(Clone, Copy)]
struct Host {
    doc: u32,
    view: PageView,
    pressed: Pressed,
    status: RwSignal<String>,
    blink: RwSignal<bool>,
    /// Text inserted into the document through this input element (IME commits, typed text,
    /// `input`-event text, paste) — the IME gate reads these (`#ime-out`).
    composed: RwSignal<String>,
    committed: RwSignal<String>,
}

impl Host {
    /// A document change ended: new layout in, or the failure reported loudly.
    fn apply(self, r: Result<String, String>, what: &str) {
        match r {
            Ok(l) => {
                self.view
                    .refresh(&self.pressed, &Doc::from_handle(self.doc), &l);
                self.blink.set(true); // caret visible immediately after every edit
                self.status.set(format!("{what} ok"));
            }
            Err(e) => self.status.set(format!("{what} failed — {e}")),
        }
    }

    /// Keydown: navigation/edit keys and engine Ctrl combos only. Printable characters are NOT
    /// handled here — the browser types them into the textarea and `input` delivers them, which
    /// is also the only signal mobile keyboards, dictation and emoji pickers send (no keydown).
    fn key(self, e: KeyboardEvent) {
        if e.is_composing() || e.alt_key() {
            return; // IME in flight: `compositionend` commits; Alt belongs to the browser
        }
        let key = e.key();
        let ctrl = e.ctrl_key() || e.meta_key();
        // Clipboard keys stay native so the textarea fires copy/cut/paste — no permission prompt.
        if ctrl && matches!(key.as_str(), "c" | "C" | "x" | "X" | "v" | "V") {
            return;
        }
        let ours = if ctrl {
            key.len() == 1 && ENGINE_CTRL.contains(&key.to_ascii_lowercase().as_str())
        } else {
            ENGINE_KEYS.contains(&key.as_str())
        };
        if !ours {
            return;
        }
        e.prevent_default();
        let d = Doc::from_handle(self.doc);
        self.apply(d.key(&key, ctrl, e.shift_key()), &format!("key {key}"));
    }

    /// Text the browser put into the textarea: typed characters, mobile keyboards, dictation,
    /// emoji pickers, CDP `insertText`. Composition text is skipped — `compositionend` commits
    /// it once (Safari re-delivers it afterwards as `insertFromComposition`).
    fn input(self, e: InputEvent) {
        let kind = e.input_type();
        if !self.composed.get().is_empty() || e.is_composing() || kind.ends_with("Composition") {
            return;
        }
        if let Some(text) = e.data().filter(|t| !t.is_empty()) {
            self.insert(&text, "insert");
        }
    }

    /// Soft keyboards delete via `beforeinput` (often without a keydown the engine could see).
    fn beforeinput(self, e: InputEvent) {
        let d = Doc::from_handle(self.doc);
        match e.input_type().as_str() {
            "deleteContentBackward" | "deleteWordBackward" => {
                e.prevent_default();
                self.apply(d.key("Backspace", false, false), "key Backspace");
            }
            "deleteContentForward" | "deleteWordForward" => {
                e.prevent_default();
                self.apply(d.key("Delete", false, false), "key Delete");
            }
            _ => {}
        }
    }

    /// Text from the input channel: drain the textarea (the document holds the text), record it
    /// for the IME gate, insert through the engine.
    fn insert(self, text: &str, what: &str) {
        if let Some(t) = input_el() {
            t.set_value("");
        }
        self.committed.update(|c| c.push_str(text));
        self.apply(Doc::from_handle(self.doc).insert_text(text), what);
    }

    /// `(x, y)` in canvas px: CSS px corrected for any CSS scaling of the canvas.
    fn page_xy(e: &MouseEvent, c: &HtmlCanvasElement) -> (f32, f32) {
        let r = c.get_bounding_client_rect();
        (
            ((e.client_x() as f32 - r.left() as f32) * c.width() as f32 / r.width() as f32)
                .max(0.0),
            ((e.client_y() as f32 - r.top() as f32) * c.height() as f32 / r.height() as f32)
                .max(0.0),
        )
    }

    fn click(self, page: usize, e: &MouseEvent, c: &HtmlCanvasElement) {
        let (x, y) = Self::page_xy(e, c);
        let d = Doc::from_handle(self.doc);
        match d.click(page as u32, x, y) {
            Ok(c) if c.found => {
                self.view
                    .overlay
                    .update(|o| o.caret = Some((page, c.x, c.y)));
                self.view.sync_overlay(&self.pressed, &d);
                self.status.set("click ok".to_string());
            }
            Ok(_) => self.status.set("click missed the text".to_string()),
            Err(err) => self.status.set(format!("click failed — {err}")),
        }
    }

    fn drag(self, page: usize, e: &MouseEvent, c: &HtmlCanvasElement) {
        if e.buttons() & 1 == 0 {
            return;
        }
        let (x, y) = Self::page_xy(e, c);
        let d = Doc::from_handle(self.doc);
        match d.drag(page as u32, x, y) {
            Ok(()) => {
                self.view.sync_overlay(&self.pressed, &d);
                self.status.set("select ok".to_string());
            }
            Err(err) => self.status.set(format!("select failed — {err}")),
        }
    }

    fn copy(self, e: &ClipboardEvent) {
        let text = Doc::from_handle(self.doc).selected_text();
        if !text.is_empty() {
            if let Some(dt) = e.clipboard_data() {
                let _ = dt.set_data("text/plain", &text);
            }
            e.prevent_default();
        }
    }
}

/// Upload one page's RGBA bytes into its `<canvas>`.
fn paint(c: &HtmlCanvasElement, doc: u32, page: u32, w: u32, h: u32) -> Result<(), String> {
    let ctx = c
        .get_context("2d")
        .map_err(|e| format!("2d context: {e:?}"))?
        .ok_or("no 2d context")?
        .dyn_into::<web_sys::CanvasRenderingContext2d>()
        .map_err(|_| "not a 2d context".to_string())?;
    let px = Doc::from_handle(doc).page_rgba(page, w, h)?;
    // `ImageData(data, sw)`: the height follows from the byte length (w×h×4).
    let img =
        web_sys::ImageData::new_with_u8_clamped_array(wasm_bindgen::Clamped(px.as_slice()), w)
            .map_err(|e| format!("ImageData {w}×{h}: {e:?}"))?;
    ctx.put_image_data(&img, 0.0, 0.0)
        .map_err(|e| format!("putImageData {w}×{h}: {e:?}"))
}

/// Focus the input textarea (the editor's keyboard/IME target) by its fixed id. Also called
/// after every ribbon command: ribbon buttons take focus on click, the document must keep it.
pub(crate) fn focus_input() {
    let _ = web_sys::window()
        .and_then(|w| w.document())
        .and_then(|d| d.get_element_by_id("ime-bridge"))
        .map(|e| e.dyn_into::<HtmlElement>().map(|t| t.focus()));
}

fn px(v: f32) -> String {
    format!("{}px", (v * 100.0).round() / 100.0)
}

fn rect_style(r: Rect) -> String {
    format!(
        "left:{};top:{};width:{};height:{}",
        px(r.x),
        px(r.y),
        px(r.w),
        px(r.h)
    )
}

/// One page: the raster plus its selection rects and caret. Repaints when `view.rev` moves.
#[component]
fn PageCanvas(page: usize, w: u32, h: u32, host: Host) -> impl IntoView {
    let canvas: NodeRef<leptos::html::Canvas> = NodeRef::new();
    Effect::new(move |_| {
        host.view.rev.track();
        if let Some(c) = canvas.get() {
            if let Err(e) = paint(&c, host.doc, page as u32, w, h) {
                host.status
                    .set(format!("paint page {} failed — {e}", page + 1));
            }
        }
    });
    view! {
        // ponytail: w/h are fixed at mount — page setup (orientation, paper size) is not wired.
        <div class="page" style=format!("width:{}px;height:{}px", w, h)
            on:mousedown=move |e: MouseEvent| {
                e.prevent_default();
                focus_input();
                host.click(page, &e, &canvas.get().expect("page canvas"));
            }
            on:mousemove=move |e: MouseEvent| {
                host.drag(page, &e, &canvas.get().expect("page canvas"))
            }
        >
            <canvas node_ref=canvas width=w height=h></canvas>
            <For
                each=move || {
                    host.view.overlay.with(|o| o.selection.get(page).cloned().unwrap_or_default())
                        .into_iter()
                        .enumerate()
                        .collect::<Vec<_>>()
                }
                key=|(i, _)| *i
                children=move |(_, r)| view! {
                    <div class="sel" style=rect_style(r)></div>
                }
            />
            <Show when=move || host.view.overlay.with(|o| o.caret.is_some_and(|c| c.0 == page))>
                <div class="caret" class:off=move || !host.blink.get()
                    style=move || host.view.overlay.with(|o| match o.caret {
                        Some((_, x, y)) => format!("left:{};top:{}", px(x), px(y)),
                        None => String::new(),
                    })
                ></div>
            </Show>
        </div>
    }
}

/// Caret blink. Leptos 0.8 ships no interval helper, so this is the platform's. The closure
/// outlives the call (`forget`): the editor lives as long as the page.
fn blink_every(blink: RwSignal<bool>, ms: i32) {
    let cb = Closure::<dyn FnMut()>::wrap(Box::new(move || blink.update(|b| *b = !*b)));
    if let Some(w) = web_sys::window() {
        let _ = w.set_interval_with_callback_and_timeout_and_arguments_0(
            cb.as_ref().unchecked_ref(),
            ms,
        );
    }
    cb.forget();
}

/// The document area: a hidden textarea as the focus target (keyboard + IME + clipboard events)
/// and one `<canvas>` per page.
#[component]
pub fn Editor(
    doc: u32,
    view: PageView,
    pressed: Pressed,
    status: RwSignal<String>,
) -> impl IntoView {
    let host = Host {
        doc,
        view,
        pressed,
        status,
        blink: RwSignal::new(true),
        composed: RwSignal::new(String::new()),
        committed: RwSignal::new(String::new()),
    };
    // Caret blink at the React host's cadence.
    blink_every(host.blink, 530);

    view! {
        <div class="pages" role="region" aria-label="Document">
            <textarea
                id="ime-bridge"
                aria-label="Document text input"
                style="position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;outline:none"
                on:keydown=move |e: KeyboardEvent| host.key(e)
                on:input=move |e: web_sys::Event| host.input(e.unchecked_into())
                on:beforeinput=move |e: InputEvent| host.beforeinput(e)
                on:compositionstart=move |e| host.composed.set(e.data().unwrap_or_default())
                on:compositionupdate=move |e| host.composed.set(e.data().unwrap_or_default())
                on:compositionend=move |e| {
                    host.composed.set(String::new());
                    let text = e.data().unwrap_or_default();
                    if !text.is_empty() {
                        host.insert(&text, "ime commit");
                    }
                }
                // Native clipboard events: no permission prompt, unlike navigator.clipboard.
                on:copy=move |e: ClipboardEvent| host.copy(&e)
                on:cut=move |e: ClipboardEvent| {
                    host.copy(&e);
                    host.apply(Doc::from_handle(doc).delete_selection(), "cut");
                }
                on:paste=move |e: ClipboardEvent| {
                    let text = e.clipboard_data().and_then(|dt| dt.get_data("text/plain").ok())
                        .unwrap_or_default();
                    if !text.is_empty() {
                        e.prevent_default();
                        host.committed.update(|c| c.push_str(&text));
                        host.apply(Doc::from_handle(doc).insert_text(&text), "paste");
                    }
                }
            ></textarea>
            <output id="ime-out" data-composed=move || host.composed.get() data-committed=move || host.committed.get()></output>
            <For
                each=move || { host.view.pages.get().into_iter().enumerate().collect::<Vec<_>>() }
                key=|(i, _)| *i
                children=move |(i, (w, h))| view! { <PageCanvas page=i w h host/> }
            />
        </div>
    }
}
