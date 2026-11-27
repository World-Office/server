//! wo-ribbon-leptos — the World-Office ribbon UI in Rust → wasm, linked directly against the
//! engine crate (ADR-F1). One wasm module: ribbon, command router and document model.
mod ime;
mod ribbon;
mod types;

use leptos::prelude::*;
use ribbon::control::RibbonState;
use ribbon::engine::{pressed_from_formatting, Doc};
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
    let opened = Doc::open(BLANK_DOCX).and_then(|d| d.layout().map(|_| d));
    match opened {
        Ok(d) => {
            if let Ok(f) = d.run_formatting() {
                pressed.set(pressed_from_formatting(&f));
            }
            doc.set(Some(d.handle()));
            APP_HANDLE.with(|h| *h.borrow_mut() = d.handle());
            std::mem::forget(d); // the handle outlives this scope; released on page unload
            status.set("ready".to_string());
        }
        Err(e) => status.set(format!("engine: open failed — {e}")),
    }

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
            Ok(Some(_layout)) => {
                // ponytail: layout JSON is discarded — the canvas page view is the next slice.
                if let Ok(f) = d.run_formatting() {
                    pressed.set(pressed_from_formatting(&f));
                }
                status.set(format!("{} ok", c.command));
            }
            Ok(None) => status.set(format!("{} (not an engine op yet)", c.command)),
            Err(e) => status.set(format!("{} failed — {e}", c.command)),
        }
    });

    view! {
        <div id="toolbar">
            <TabBar tabs=visible_tabs active/>
            <section class="panel" role="tabpanel" data-tab=move || active.get()>
                <For each=move || groups.get() key=|g| g.id.to_string() children=move |g| view! { <RibbonGroup group=g st/> } />
            </section>
            <p id="status" role="status">{status}</p>
            // IME bridge: the hidden textarea composition events reach Rust through. Belongs to
            // the editor canvas slice; mounted now so it stays compiled and its gate keeps running.
            <ime::ImeProbe/>
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
            &"woSetEditMode".into(),
            &wasm_bindgen::closure::Closure::<dyn Fn(bool)>::new(woSetEditMode).into_js_value(),
        );
    }
    leptos::mount::mount_to_body(App);
}
