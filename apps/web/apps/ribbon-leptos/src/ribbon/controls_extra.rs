//! STUB — replaced by task L1-05 (Select = top-row combo with visible value + caret;
//! ColorPicker = icon + colored bar + caret).
use crate::types::Control;
use leptos::prelude::*;

pub fn render_extra(c: Control) -> impl IntoView {
    view! { <button id=c.id class="btn">{c.label}</button> }
}
