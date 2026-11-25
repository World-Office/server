# wo-ribbon-leptos — ribbon UI in Rust → wasm (PoC)

Proof-of-concept for **ADR-F1** (`docs/arc42/09-architectural-decisions.md`): the ONLYOFFICE-style
ribbon — today ~39k lines of React/TypeScript — rendered by Rust compiled to WebAssembly with
[Leptos 0.8](https://leptos.dev), calling into the existing Rust document engine
(`core/crates/wo-renderer-wasm`) unchanged. One tab (Home) is ported 1:1 from the TS ribbon spec
(`packages/editor-common/src/ribbon/specs/word-ribbon.ts`) and scored against the ONLYOFFICE golden
with the parity harness (`wo-test-harness/census/layout-diff.py`). Numbers: `MEASUREMENTS.md`.

**Standalone crate** — not a workspace member, never built by `cargo build --workspace` or CI.

```sh
trunk build --release                 # → dist/ (open dist/index.html via any static server)
bash gate/scaffold.sh                 # build + Playwright smoke test (uses server/tests/node_modules playwright)
cargo test                            # pure-data unit tests (spec port)
```

## Layout

| file | role |
|---|---|
| `src/types.rs` | data-only mirror of `editor-common/src/ribbon/types.ts` (+ `Size::{Large,Small}` = OO top/bottom row) |
| `src/ribbon/spec.rs` | `tabs()` — the tab list and the Home tab as data |
| `src/ribbon/tabbar.rs` | `TabBar` component (`role=tablist/tab`, `aria-selected`, arrow keys) |
| `src/ribbon/group.rs` | `RibbonGroup`: `.group[data-group] > .elset > .row-top/.row-bottom`, caption |
| `src/ribbon/control.rs` | `render_control` — button kind, delegates Select/ColorPicker |
| `src/ribbon/controls_extra.rs` | `render_extra` — Select and ColorPicker kinds |
| `src/ime.rs` | `ImeProbe` — hidden `<textarea>` the browser composes into; Rust tracks composition |
| `gate/` | `common.sh` (build + serve + probe) and one probe per task |

## Leptos 0.8 idioms this crate relies on (verified — 0.6-style code does not compile)

- `use leptos::prelude::*;` · `#[component] pub fn X(prop: T) -> impl IntoView` · `view! { <div class=.. on:click=move |_| ..> }` (no `cx`).
- State: `let s = RwSignal::new(v);` → `s.get()`, `s.set(v)`, `s.update(|x| ..)`; `Memo::new(move |prev: Option<&T>| ..)` (0.8: the closure takes the previous value). Signals are `Copy`.
- Reactive attributes: `class=("name", move || bool)`, `aria-selected=move || ..`, `data-x=move || ..`.
- `<For each=move || items.clone() key=|x| .. children=move |x| view!{ .. } />`.
- **A `<For>` inside another component's children must not `move` owned data into `each`** — the children closure
  must be `Fn`; moving a `Vec` into the inner closure makes it `FnOnce` (E0525). Own the data in a `Memo`/`RwSignal`.
- A `Vec<T>` captured by `move` in one closure is gone for the next one (E0382): clone it per owner
  (`let tabs_key = tabs.clone();`). A `<For>` inside `<Show>` children must not `move` its `Vec` into `each`
  (E0525): `let row = RwSignal::new(vec);` then `each=move || row.get()`.
- ARIA state is a `String`: `aria-selected=move || (active.get() == id).to_string()`, same for `aria-pressed` and
  `tabindex`. Keyboard: `on:keydown=move |ev| { match ev.key().as_str() { "ArrowRight" => .. } }`, `ev.prevent_default()`.
- Focus from Rust: `window().document().and_then(|d| d.get_element_by_id("tab-home"))` →
  `.dyn_into::<web_sys::HtmlElement>()` → `.focus()` (`use web_sys::wasm_bindgen::JsCast;`).
- `event_target_value(&ev)` for input values; `web_sys::CompositionEvent::data()` for IME (fires during composition,
  together with `input`, so a "committed" signal is non-empty mid-composition).
- Mount: `leptos::mount::mount_to_body(App)` (there is no `mount_body` in 0.8).
- trunk 0.22: `<link data-trunk rel="rust" data-bin-pkg="wo-ribbon-leptos">` — do **not** pass `data-type="cdylib"`.
