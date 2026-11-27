//! RibbonGroup: `.group > .elset > .row-top/.row-bottom + .group-label`, filtered by `when`.
use crate::ribbon::control::{render_control, RibbonState};
use crate::types::{Group, Kind};
use leptos::prelude::*;

/// Controls ONLYOFFICE places on the ribbon's top row (Home tab). Verified against the golden
/// census; layout-diff.py fails if any of these renders on the bottom row.
const TOP_ROW_COMMANDS: &[&str] = &[
    "bulletList",
    "orderedList",
    "multilevelList",
    "changeCase",
    "indent",
    "outdent",
    "increaseFontSize",
    "decreaseFontSize",
    "lineSpacing",
    "setTextDirection",
    "replace",
];

#[component]
pub fn RibbonGroup(group: Group, st: RibbonState) -> impl IntoView {
    // Two rows like OO. The spec has no size/placement field, so OO's convention is explicit data
    // here: pickers, menus and steppers go on TOP, plain toggle/action buttons BELOW. The set
    // below is read off the ONLYOFFICE golden (census-oo-deep.json, Home top row) and is exactly
    // what layout-diff.py's "first content row" check enforces.
    let (top, bottom): (Vec<_>, Vec<_>) = group
        .controls
        .into_iter()
        .filter(|c| c.when.is_none_or(|w| w.eval(&st.ctx.get())))
        .partition(|c| match &c.kind {
            Kind::Button { command, .. } => TOP_ROW_COMMANDS.contains(command),
            // Color pickers sit BELOW with the toggles in ONLYOffice (B I U S x₂ x² A ▾ ▾).
            Kind::ColorPicker { .. } | Kind::Separator => false,
            _ => true,
        });
    let top = RwSignal::new(top);
    let bottom = RwSignal::new(bottom);
    let label = group.label;
    let gid = group.id;
    view! {
        <div class="group" data-group=gid>
            <div class="elset">
                <Show when=move || !top.with(|v| v.is_empty())>
                    <div class="row row-top">
                        <For each=move || top.get() key=|c| c.id.to_string() children=move |c| view! { {render_control(c, st)} } />
                    </div>
                </Show>
                <Show when=move || !bottom.with(|v| v.is_empty())>
                    <div class="row row-bottom">
                        <For each=move || bottom.get() key=|c| c.id.to_string() children=move |c| view! { {render_control(c, st)} } />
                    </div>
                </Show>
            </div>
            <span class="group-label">{label}</span>
        </div>
    }
}
