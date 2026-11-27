//! Ribbon commands beyond the engine's formatting/structure ops (`engine::Doc::exec`). One module
//! per ribbon area; each owns a DISJOINT set of command names and answers `None` for anything
//! else, so modules can be built in parallel without touching shared files. `lib.rs` asks here
//! only after the engine said `Ok(None)`.
//!
//! Module contract — exactly two items per module:
//! * `pub fn exec(cmd: &Cmd, ui: &Ui) -> Option<Result<String, String>>` — `Some` means the
//!   module owns the command; the string is the human `#status` text. `Ok` must be TRUE (the
//!   engine call really happened / the view really changed); what the engine cannot do is
//!   reported as `Err("… engine has no … op")`, never as a fake success.
//! * `#[component] pub fn Panel(ui: Ui) -> impl IntoView` — the module's DOM (may be empty).
//!
//! Gates judge pixels and the engine (`window.woProbe`), not the status text.
pub mod clipboard;
pub mod find_replace;
pub mod font;
pub mod paragraph;
pub mod review;
pub mod tools;
pub mod view;

use crate::editor::PageView;
use crate::ribbon::control::{Cmd, Pressed};
use crate::ribbon::engine::Doc;
use leptos::prelude::*;

/// Everything a module may touch. `Copy`; all fields are signals or handles.
// Fields/methods go unused until their owning module is built; drop this allow afterwards.
#[allow(dead_code)]
#[derive(Clone, Copy)]
pub struct Ui {
    /// Engine document handle (`Doc::from_handle`).
    pub doc: u32,
    pub view: PageView,
    /// ids of toggled ribbon buttons, as reported by the engine.
    pub pressed: Pressed,
    /// The command bus — a module re-dispatches here (e.g. a picked color → `textColor`).
    pub cmd: RwSignal<Option<Cmd>>,
    pub status: RwSignal<String>,
}

#[allow(dead_code)]
impl Ui {
    pub fn doc(&self) -> Doc {
        Doc::from_handle(self.doc)
    }
    /// Apply what every mutating engine call returns (the new layout JSON), sync the ribbon and
    /// put the keyboard back in the editor. The one way a module lands a document change.
    pub fn refresh(&self, layout: &str) {
        self.view.refresh(&self.pressed, &self.doc(), layout);
        crate::editor::focus_input();
    }
}

/// First module that owns the command wins. Command names are disjoint by contract.
pub fn exec(cmd: &Cmd, ui: &Ui) -> Option<Result<String, String>> {
    clipboard::exec(cmd, ui)
        .or_else(|| find_replace::exec(cmd, ui))
        .or_else(|| font::exec(cmd, ui))
        .or_else(|| paragraph::exec(cmd, ui))
        .or_else(|| review::exec(cmd, ui))
        .or_else(|| tools::exec(cmd, ui))
        .or_else(|| view::exec(cmd, ui))
}

/// Every module's DOM, mounted once by `App`. A module's panel is its own business.
#[component]
pub fn Panels(ui: Ui) -> impl IntoView {
    view! {
        <clipboard::Panel ui/>
        <find_replace::Panel ui/>
        <font::Panel ui/>
        <paragraph::Panel ui/>
        <review::Panel ui/>
        <tools::Panel ui/>
        <view::Panel ui/>
    }
}
