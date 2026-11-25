//! Extra control kinds: Select (caption + caret), ColorPicker (icon + color-bar)
use crate::types::*;
use leptos::prelude::*;

pub fn render_extra(c: Control) -> impl IntoView {
    let id = c.id;
    let kind = c.kind;
    let size = c.size;
    let icon = c.icon;
    let label = c.label;
    let command = c.command;

    let size_str = match size {
        Size::Large => "large",
        Size::Small => "small",
    };

    match kind {
        ControlKind::Select => view! {
                <button 
                    id=id
                    class="btn"
                    data-kind="select"
                    data-command=command
                    data-size=size_str
                    aria-label=label
                    title=label
                >
                    <span class="caption" style="pointer-events: none">{label}</span>
                    <span class="caret" style="pointer-events: none">"▾"</span>
                </button>
            }
            .into_any(),
        ControlKind::ColorPicker => view! {
                <button 
                    id=id
                    class="btn"
                    data-kind="color-picker"
                    data-command=command
                    data-size=size_str
                    aria-label=label
                    title=label
                >
                    <span class="icon" style="pointer-events: none">{icon}</span>
                    <span class="color-bar" style="background:#000; pointer-events: none"></span>
                </button>
            }
            .into_any(),
        _ => view! { <button id=id class="btn">{label}</button> }.into_any(),
    }
}
