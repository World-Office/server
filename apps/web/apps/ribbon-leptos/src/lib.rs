//! wo-ribbon-leptos — the World-Office ribbon UI in Rust → wasm, linked directly against the
//! engine crate (ADR-F1). One wasm module: ribbon, command router and document model.
mod editor;
mod ribbon;
mod types;

use editor::Editor;
use leptos::prelude::*;
use ribbon::control::RibbonState;
use ribbon::engine::Doc;
use ribbon::group::RibbonGroup;
use ribbon::{spec, tabbar::TabBar};
use types::RibbonContext;

/// Blank document, same template the editors open for "New" (assets/templates/new/en-US).
/// Embedded: no fetch, no server round-trip, a 7.7 KB cost inside the module.
pub(crate) const BLANK_DOCX: &[u8] =
    include_bytes!("../../../../../assets/templates/new/en-US/new.docx");

/// Gate hook: run bold through the engine. With `use_app_doc` it exercises the APP's document
/// handle (the one the ribbon's click handler uses) instead of a fresh one — separates
/// "the engine call crashes" from "the app's document handle is bad".
/// camelCase on purpose: it is a JS-facing name (the gate calls `window.woProbeBold`).
#[allow(non_snake_case)]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn woProbeBold(use_app_doc: bool) -> String {
    let d = if use_app_doc {
        APP_HANDLE.with(|h| Doc::from_handle(*h.borrow()))
    } else {
        match Doc::open(BLANK_DOCX).and_then(|d| d.layout().map(|_| d)) {
            Ok(d) => d,
            Err(e) => return format!("open: {e}"),
        }
    };
    let cmd = ribbon::control::Cmd {
        id: "bold",
        command: "bold",
        value: None,
    };
    let pressed = ribbon::control::Pressed::default();
    match d.exec(&cmd, &pressed) {
        Ok(Some(l)) => format!("ok layout {} bytes", l.len()),
        Ok(None) => "none".into(),
        Err(e) => format!("exec: {e}"),
    }
}

thread_local! {
    static APP_HANDLE: std::cell::RefCell<u32> = const { std::cell::RefCell::new(0) };
}

/// Gate hook: inspect the APP's document through the engine — `runfmt` (formatting at the caret,
/// as the engine reports it), `selected` (selection text), `dark` (ink on page 0). What the
/// pixels and the ribbon claim can then be checked against the engine's own state.
/// camelCase on purpose: JS-facing name (gates call `window.woProbe`).
#[allow(non_snake_case)]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn woProbe(what: String) -> String {
    let d = APP_HANDLE.with(|h| Doc::from_handle(*h.borrow()));
    match what.as_str() {
        "runfmt" => d
            .run_formatting()
            .map(|f| f.to_string())
            .unwrap_or_else(|e| e),
        "selected" => d.selected_text(),
        "dark" => d
            .page_rgba(0, 793, 1123)
            .map(|px| px.chunks(4).filter(|p| p[0] < 128).count().to_string())
            .unwrap_or_else(|e| e),
        _ => format!("unknown probe {what}"),
    }
}

#[component]
pub fn App() -> impl IntoView {
    let ctx = RwSignal::new(RibbonContext {
        is_edit_mode: true,
        ..Default::default()
    });
    CTX.with(|c| *c.borrow_mut() = Some(ctx));
    let cmd = RwSignal::new(None);
    let pressed = ribbon::control::Pressed::default();
    let st = RibbonState {
        cmd,
        pressed,
        ctx: Memo::new(move |_| ctx.get()),
    };
    let active = RwSignal::new("home");

    // Tabs whose `when` is false right now are hidden (Insert/Draw need edit mode).
    let visible_tabs: Memo<Vec<types::Tab>> = Memo::new(move |_| {
        let c = ctx.get();
        spec::tabs()
            .into_iter()
            .filter(|t| t.when.is_none_or(|w| w.eval(&c)))
            .collect()
    });
    let groups: Memo<Vec<types::Group>> = Memo::new(move |_| {
        let c = ctx.get();
        spec::tabs()
            .into_iter()
            .find(|t| t.id == active.get())
            .map(|t| {
                t.groups
                    .into_iter()
                    .filter(|g| g.when.is_none_or(|w| w.eval(&c)))
                    .collect()
            })
            .unwrap_or_default()
    });

    // The document. Created once; every ribbon command routes through it. A failed open leaves
    // `doc` at None and the status line says so — loud, not a silent dead ribbon.
    // The signal holds the engine's handle (a u32 is Copy); the engine owns the document.
    let doc = RwSignal::new(None::<u32>);
    let status = RwSignal::new("opening document…".to_string());
    // The page view. Fed by the ribbon's Effect below and by the editor's own input handlers.
    let view = editor::PageView::new();
    let opened = Doc::open(BLANK_DOCX).and_then(|d| d.layout().map(|l| (d, l)));
    match opened {
        Ok((d, l)) => {
            view.refresh(&pressed, &d, &l);
            APP_HANDLE.with(|h| *h.borrow_mut() = d.handle());
            doc.set(Some(d.handle()));
            std::mem::forget(d); // the handle outlives this scope; released on page unload
            status.set("ready".to_string());
        }
        Err(e) => status.set(format!("engine: open failed — {e}")),
    }
    // What the non-engine command modules (`ribbon::ops`) may touch.
    let ui = ribbon::ops::Ui {
        doc: doc.try_get().flatten().unwrap_or(0),
        view,
        pressed,
        cmd,
        status,
    };

    // cmd signal → engine → toggled-button state. Runs once per dispatched command.
    //
    // The command is CONSUMED here (cmd.set(None) before anything else). A signal an effect
    // reads AND writes re-triggers that effect; with a stale `Some(cmd)` still in the signal the
    // effect would re-dispatch the same command forever on every `pressed.set` → stack overflow
    // → tab crash. Consuming first makes exactly one dispatch per click, by construction.
    Effect::new(move |_| {
        let Some(c) = cmd.try_get().flatten() else {
            return;
        };
        cmd.set(None);
        let Some(h) = doc.try_get().flatten() else {
            return;
        };
        let pressed_ro =
            ribbon::control::Pressed::new(pressed.try_with(|p| p.clone()).unwrap_or_default());
        let d = Doc::from_handle(h);
        match d.exec(&c, &pressed_ro) {
            Ok(Some(l)) => {
                view.refresh(&pressed, &d, &l);
                editor::focus_input(); // ribbon buttons steal focus on click
                status.set(format!("{} ok", c.command));
            }
            // Not an engine op: ask the command modules (clipboard, view, …) — same honesty rule.
            Ok(None) => match ribbon::ops::exec(&c, &ui) {
                Some(Ok(s)) => status.set(s),
                Some(Err(e)) => status.set(format!("{} failed — {e}", c.command)),
                None => status.set(format!("{} (not an engine op yet)", c.command)),
            },
            Err(e) => status.set(format!("{} failed — {e}", c.command)),
        }
    });

    view! {
        <div class="app">
        <div id="toolbar">
            <TabBar tabs=visible_tabs active/>
            <section class="panel" role="tabpanel" data-tab=move || active.get()>
                <For each=move || groups.get() key=|g| g.id.to_string() children=move |g| view! { <RibbonGroup group=g st/> } />
            </section>
            <p id="status" role="status">{status}</p>
        </div>
        <ribbon::ops::Panels ui/>
        // The canvas host, mounted once the document exists. Its hidden textarea is also the
        // IME bridge (`#ime-bridge` / `#ime-out` — the IME gate's contract).
        <Show when=move || doc.with(|d| d.is_some())>
            {move || view! { <Editor doc=doc.try_get().flatten().unwrap_or(0) view pressed status/> }}
        </Show>
        </div>
    }
}

thread_local! {
    /// The live ribbon context, so the host page (and the gate) can flip edit mode without
    /// re-mounting. ponytail: one global — fine for a single-document editor.
    static CTX: std::cell::RefCell<Option<RwSignal<RibbonContext>>> = const { std::cell::RefCell::new(None) };
}

/// Host hook: flip edit mode. Hides the Insert/Draw/Chart tabs (their `when: ctx.isEditMode`).
#[allow(non_snake_case)]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn woSetEditMode(on: bool) {
    CTX.with(|c| {
        if let Some(ctx) = c.borrow().as_ref() {
            ctx.update(|c| c.is_edit_mode = on);
        }
    });
}

#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    // Gate hook on window (the trunk loader is an inline module, not importable from a probe).
    // Gate hooks on window: the trunk loader is an inline module a probe cannot import.
    if let Some(w) = web_sys::window() {
        let _ = js_sys::Reflect::set(
            &w,
            &"woProbeBold".into(),
            &wasm_bindgen::closure::Closure::<dyn Fn(bool) -> String>::new(woProbeBold)
                .into_js_value(),
        );
        let _ = js_sys::Reflect::set(
            &w,
            &"woProbe".into(),
            &wasm_bindgen::closure::Closure::<dyn Fn(String) -> String>::new(woProbe)
                .into_js_value(),
        );
        let _ = js_sys::Reflect::set(
            &w,
            &"woSetEditMode".into(),
            &wasm_bindgen::closure::Closure::<dyn Fn(bool)>::new(woSetEditMode).into_js_value(),
        );
    }
    leptos::mount::mount_to_body(App);
}
