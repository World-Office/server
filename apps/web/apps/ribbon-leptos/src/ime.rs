//! IME bridge proof for ADR-F1: composition events can reach Rust/wasm ONLY through a real
//! editable DOM element. A hidden `<textarea>` is the bridge that receives real IME composition
//! events (compositionstart, compositionupdate, compositionend) and input events. The canvas-based
//! editor cannot receive these events directly, so the bridge must be a permanent component of
//! any Rust/wasm editor that needs CJK/IME text input.

use leptos::prelude::*;
use wasm_bindgen::JsCast;

/// Helper to extract the value from an input event's target.
fn event_target_value(ev: &web_sys::Event) -> String {
    let event_target = ev.target().unwrap_or_else(|| ev.current_target().unwrap());
    let target: web_sys::HtmlTextAreaElement = event_target
        .dyn_into()
        .unwrap_or_else(|_| panic!("event target is not a textarea"));
    target.value()
}

#[component]
pub fn ImeProbe() -> impl IntoView {
    let composed = RwSignal::new(String::new());
    let committed = RwSignal::new(String::new());

    view! {
        <textarea
            id="ime-bridge"
            aria-label="IME bridge"
            style="position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01"
            on:compositionstart=move |e| composed.set(e.data().unwrap_or_default())
            on:compositionupdate=move |e| composed.set(e.data().unwrap_or_default())
            on:compositionend=move |e| {
                let d = e.data().unwrap_or_default();
                composed.set(String::new());
                committed.set(d)
            }
            on:input=move |e| committed.set(event_target_value(&e))
        >
        </textarea>
        <output id="ime-out" data-composed=move || composed.get() data-committed=move || committed.get()>
        </output>
    }
}
