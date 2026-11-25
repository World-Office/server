//! Render control: button kind with aria-label, title, data-command, data-kind, data-size, aria-pressed for toggles
use crate::ribbon::controls_extra::render_extra;
use crate::types::*;
use leptos::prelude::*;

pub fn render_control(c: Control, pressed: RwSignal<&'static str>) -> impl IntoView {
    // Bind the fields we need to avoid moving `c` into multiple closures
    let id = c.id;
    let kind = c.kind;
    let size = c.size;
    let icon = c.icon;
    let label = c.label;
    let command = c.command;
    let shortcut = c.shortcut;
    let toggleable = c.toggleable;

    match kind {
        ControlKind::Button => {
            let size_str = match size {
                Size::Large => "large",
                Size::Small => "small",
            };

            // Build title with shortcut if present
            let title = move || {
                shortcut
                    .map(|s| format!("{label} ({s})"))
                    .unwrap_or_else(|| label.to_string())
            };

            if toggleable {
                view! {
                    <button 
                        id=id
                        class="btn"
                        data-kind="button"
                        data-command=command
                        data-size=size_str
                        aria-label=label
                        title=title
                        aria-pressed=move || (pressed.get() == id).to_string()
                        on:click=move |_| {
                            pressed.update(|p| *p = if *p == id { "" } else { id });
                        }
                    >
                        <span class="icon" style="pointer-events: none">{icon}</span>
                    </button>
                }
                .into_any()
            } else {
                view! {
                    <button 
                        id=id
                        class="btn"
                        data-kind="button"
                        data-command=command
                        data-size=size_str
                        aria-label=label
                        title=title
                        on:click=move |_| {}
                    >
                        <span class="icon" style="pointer-events: none">{icon}</span>
                    </button>
                }
                .into_any()
            }
        }
        _ => render_extra(c).into_any(),
    }
}
