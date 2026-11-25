//! STUB — replaced by task L1-06 (IME bridge: compositionstart/update/end → Rust signals, exposed on #ime-out).
use leptos::prelude::*;

#[component]
pub fn ImeProbe() -> impl IntoView {
    view! { <textarea id="ime-bridge"></textarea> }
}
