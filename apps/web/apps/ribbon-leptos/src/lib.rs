//! wo-ribbon-leptos — PoC ribbon UI in Rust → wasm. Mounted by trunk's generated loader.
mod ribbon;
mod types;
mod ime;

use leptos::prelude::*;
use ribbon::group::RibbonGroup;
use ribbon::spec;
use ribbon::tabbar::TabBar;

#[component]
pub fn App() -> impl IntoView {
    let tabs = spec::tabs();
    let active = RwSignal::new("home");
    let pressed = RwSignal::new("");
    // Reactive groups of the active tab. Created ONCE here in App — a <For> nested inside another
    // component's children must not `move` owned data into `each`, or the children closure becomes
    // FnOnce (E0525). Signals/Memos are Copy, so the inner move only copies the handle.
    let groups = Memo::new(move |_prev: Option<&Vec<crate::types::Group>>| { // 0.8: the Memo closure takes the previous value
        tabs.iter().find(|t| t.id == active.get()).map(|t| t.groups.clone()).unwrap_or_default()
    });
    let tabs = spec::tabs();
    view! {
        <div id="toolbar">
            <TabBar tabs active/>
            <section class="panel" role="tabpanel" data-tab=move || active.get()>
                <For each=move || groups.get() key=|g| g.id.to_string() children=move |g| view! { <RibbonGroup group=g pressed/> } />
            </section>
            <ime::ImeProbe/>
        </div>
    }
}

#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    leptos::mount::mount_to_body(App);
}
