//! Control renderer for the full `Kind` set. Purely presentational: every control dispatches
//! through the shared `cmd` signal and reads toggle state from `pressed`. No local state —
//! a Bold button must show the DOCUMENT's bold state, not its own click count.
use crate::types::*;
use leptos::prelude::*;

/// A dispatched ribbon command: the control id, the command string, and an optional value
/// (select option, color, checkbox state).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Cmd {
    pub id: &'static str,
    pub command: &'static str,
    pub value: Option<String>,
}

/// Shared ribbon state handed to every control.
#[derive(Clone, Copy, Debug)]
pub struct RibbonState {
    pub cmd: RwSignal<Option<Cmd>>,
    /// ids of controls currently toggled on, as reported by the engine.
    pub pressed: Pressed,
    pub ctx: Memo<RibbonContext>,
}

/// ids of controls currently toggled on, as reported by the engine. Writable by the engine layer
/// (`set`), readable in views (`with`) — one signal, no Memo/setter pair.
#[derive(Clone, Copy, Debug)]
pub struct Pressed(RwSignal<Vec<&'static str>>);

impl Default for Pressed {
    fn default() -> Self {
        Self(RwSignal::new(Vec::new()))
    }
}

impl Pressed {
    pub fn new(v: Vec<&'static str>) -> Self {
        Self(RwSignal::new(v))
    }
    pub fn set(&self, v: Vec<&'static str>) {
        self.0.set(v)
    }
    pub fn with<R>(&self, f: impl FnOnce(&Vec<&'static str>) -> R) -> R {
        self.0.with(f)
    }
    /// UNTRACKED read (for code that also writes the signal — see App's dispatch effect).
    pub fn try_with<R>(&self, f: impl FnOnce(&Vec<&'static str>) -> R) -> Option<R> {
        self.0.try_with(f)
    }
}

fn is_pressed(st: RibbonState, id: &'static str) -> impl Fn() -> bool + use<> {
    move || st.pressed.with(|p| p.contains(&id))
}

fn title_of(c: &Control) -> String {
    let label = c.label.or(c.tooltip).unwrap_or(c.id);
    match &c.kind {
        Kind::Button {
            shortcut: Some(s), ..
        } => format!("{label} ({s})"),
        _ => label.to_string(),
    }
}

/// Icon slot: text for now (PoC), `data-icon` lets a later icon layer hydrate real SVGs in place.
fn icon(name: &'static str) -> impl IntoView {
    view! { <span class="icon" data-icon=name style="pointer-events: none">{name}</span> }
}

pub fn render_control(c: Control, st: RibbonState) -> AnyView {
    let id = c.id;
    let title = title_of(&c);
    let label = c.label.unwrap_or(id);
    match c.kind {
        Kind::Button { command, icon: ic, value, toggleable, .. } => {
            let v = value;
            view! {
                <button id=id class="btn" data-kind="button" data-command=command
                    aria-label=label title=title
                    aria-pressed=move || toggleable.then(|| is_pressed(st, id)().to_string())
                    on:click=move |_| st.cmd.set(Some(Cmd { id, command, value: v.map(str::to_string) }))>
                    {icon(ic)}
                </button>
            }
            .into_any()
        }
        Kind::Checkbox { command, checked_when } => {
            // A checkbox keeps its own state: it starts from the predicate (a document-context
            // default) and then follows the clicks, sending the new value with every command.
            let on = RwSignal::new(checked_when.eval(&st.ctx.get()));
            view! {
                <button id=id class="btn" data-kind="checkbox" data-command=command.unwrap_or(id)
                    aria-label=label title=title
                    aria-pressed=move || on.get().to_string()
                    on:click=move |_| {
                        let now = !on.get();
                        on.set(now);
                        st.cmd.set(Some(Cmd { id, command: command.unwrap_or(id), value: Some(now.to_string()) }))
                    }>
                    <span class="box" style="pointer-events: none">{move || if checked_when.eval(&st.ctx.get()) { "☑" } else { "☐" }}</span>
                    <span class="caption" style="pointer-events: none">{label}</span>
                </button>
            }
            .into_any()
        }
        Kind::Select { options, command, .. } => {
            let value = c.label.unwrap_or(id);
            view! {
                <select id=id class="btn" data-kind="select" data-command=command.unwrap_or(id)
                    aria-label=label title=title
                    on:change=move |ev| {
                        let v = event_target_value(&ev);
                        st.cmd.set(Some(Cmd { id, command: command.unwrap_or(id), value: Some(v) }))
                    }>
                    <For each=move || options.clone() key=|o| o.value.to_string() children=move |o| {
                        view! { <option value=o.value selected=o.value == value>{o.label}</option> }
                    } />
                </select>
            }
            .into_any()
        }
        Kind::ColorPicker { color, command } => view! {
            <button id=id class="btn" data-kind="color-picker" data-command=command aria-label=label title=title
                on:click=move |_| st.cmd.set(Some(Cmd { id, command, value: Some(color.to_string()) }))>
                <span class="icon" style="pointer-events: none">"A"</span>
                <span class="color-bar" style=format!("background:{color}; pointer-events: none")></span>
            </button>
        }
        .into_any(),
        Kind::Dropdown { icon: ic, items } => view! {
            <button id=id class="btn" data-kind="dropdown" aria-label=label title=title
                on:click=move |_| {
                    if let Some(cmd) = items.iter().find_map(|i| i.command) {
                        st.cmd.set(Some(Cmd { id, command: cmd, value: None }))
                    }
                }>
                {ic.map(icon)}
                <span class="caret" style="pointer-events: none">"▾"</span>
            </button>
        }
        .into_any(),
        Kind::Separator => view! { <span class="sep" data-kind="separator" aria-hidden="true"></span> }.into_any(),
        Kind::Spacer => view! { <span class="spacer" data-kind="spacer"></span> }.into_any(),
    }
}
