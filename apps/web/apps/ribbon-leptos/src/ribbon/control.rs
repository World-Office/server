//! STUB — replaced by task L1-04 (button kind: aria-label, title "Label (Shortcut)", data-command,
//! data-kind, data-size, aria-pressed for toggles; delegates Select/ColorPicker to controls_extra).
use crate::ribbon::controls_extra::render_extra;
use crate::types::*;
use leptos::prelude::*;

pub fn render_control(c: Control, pressed: RwSignal<&'static str>) -> impl IntoView {
    match c.kind {
        ControlKind::Button => view! { <button id=c.id class="btn">{c.icon}</button> }.into_any(),
        _ => render_extra(c).into_any(),
    }
}
