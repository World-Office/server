//! Not wired yet: owns no command (see `ops::mod` for the contract).
use super::Ui;
use crate::ribbon::control::Cmd;
use leptos::prelude::*;

pub fn exec(_cmd: &Cmd, _ui: &Ui) -> Option<Result<String, String>> {
    None
}

#[component]
pub fn Panel(ui: Ui) -> impl IntoView {
    let _ = &ui; // used once the module is built
                 // The module's root node (stable hook for its gate); empty until the module is built.
    view! { <div class="ops-panel" id="ops-font"></div> }
}
