//! STUB — replaced by task L1-04 (real group: .group[data-group] > .elset > .row-top/.row-bottom + caption).
use crate::ribbon::control::render_control;
use crate::types::Group;
use leptos::prelude::*;

#[component]
pub fn RibbonGroup(group: Group, pressed: RwSignal<&'static str>) -> impl IntoView {
    view! {
        <div class="group">
            <For each=move || group.controls.clone() key=|c| c.id.to_string() children=move |c| {
                let p = pressed;
                view! { {render_control(c, p)} }
            } />
        </div>
    }
}
