//! Real tab strip implementation following WAI-ARIA tabs pattern.
//! Features: role=tablist/tab, aria-selected, roving tabindex, arrow-key navigation.
use crate::types::Tab;
use leptos::prelude::*;
use web_sys::wasm_bindgen::JsCast;

#[component]
pub fn TabBar(tabs: Memo<Vec<Tab>>, active: RwSignal<&'static str>) -> impl IntoView {
    // Keyboard navigation reads the current tab list through the memo.
    let tabs_key = tabs;

    // Keyboard navigation handler
    let on_key = move |ev: leptos::ev::KeyboardEvent| {
        let tabs_key = tabs_key.get();
        let idx = tabs_key
            .iter()
            .position(|t| t.id == active.get())
            .unwrap_or(0);
        let n = tabs_key.len();
        let next = match ev.key().as_str() {
            "ArrowRight" => Some((idx + 1) % n),
            "ArrowLeft" => Some((idx + n - 1) % n),
            "Home" => Some(0),
            "End" => Some(n - 1),
            _ => None,
        };
        if let Some(i) = next {
            ev.prevent_default();
            let id = tabs_key[i].id;
            active.set(id);
            if let Some(el) = window()
                .document()
                .and_then(|d| d.get_element_by_id(&format!("tab-{id}")))
            {
                if let Ok(h) = el.dyn_into::<web_sys::HtmlElement>() {
                    let _ = h.focus();
                }
            }
        }
    };

    view! {
        <div id="ribbon-tabs" role="tablist" on:keydown=on_key>
            <For each=move || tabs.get() key=|t| t.id.to_string() children=move |t| {
                let id = t.id;
                view! {
                    <button
                        id=format!("tab-{id}")
                        role="tab"
                        class="tab"
                        class=("active", move || active.get() == id)
                        aria-selected=move || (active.get() == id).to_string()
                        tabindex=move || if active.get() == id { "0".to_string() } else { "-1".to_string() }
                        on:click=move |_| active.set(id)
                    >
                        {t.label}
                    </button>
                }
            } />
        </div>
    }
}
