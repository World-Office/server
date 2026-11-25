//! STUB — replaced by task L1-03 (real tab strip: role=tablist/tab, aria-selected, arrow-key nav).
use crate::types::Tab;
use leptos::prelude::*;

#[component]
pub fn TabBar(tabs: Vec<Tab>, active: RwSignal<&'static str>) -> impl IntoView {
    view! {
        <div id="ribbon-tabs">
            <For each=move || tabs.clone() key=|t| t.id.to_string() children=move |t| {
                let id = t.id;
                view! { <button class="tab" on:click=move |_| active.set(id)>{t.label}</button> }
            } />
        </div>
    }
}
