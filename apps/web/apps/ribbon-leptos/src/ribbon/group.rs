//! RibbonGroup: renders a group with .elset > .row-top/.row-bottom + .group-label
use crate::ribbon::control::render_control;
use crate::types::{Group, Size};
use leptos::prelude::*;

#[component]
pub fn RibbonGroup(group: Group, pressed: RwSignal<&'static str>) -> impl IntoView {
    // Partition controls into small and large
    let (small, large): (Vec<_>, Vec<_>) = group.controls.iter().cloned().partition(|c| c.size == Size::Small);
    let large = RwSignal::new(large);
    let small = RwSignal::new(small);
    
    view! {
        <div class="group" data-group=group.id>
            <div class="elset">
                <Show when=move || !large.get().is_empty()>
                    <div class="row row-top">
                        <For each=move || large.get() key=|c| c.id.to_string() children=move |c| {
                            let p = pressed;
                            view! { {render_control(c, p)} }
                        } />
                    </div>
                </Show>
                <Show when=move || !small.get().is_empty()>
                    <div class="row row-bottom">
                        <For each=move || small.get() key=|c| c.id.to_string() children=move |c| {
                            let p = pressed;
                            view! { {render_control(c, p)} }
                        } />
                    </div>
                </Show>
            </div>
            <span class="group-label">{group.label}</span>
        </div>
    }
}
