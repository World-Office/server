# wo-ribbon-leptos — the World-Office ribbon UI in Rust → wasm

Implementation of **ADR-F1** (`docs/arc42/09-architectural-decisions.md`): the ONLYOFFICE-style
ribbon — previously ~39k lines of React/TypeScript — rendered by Rust compiled to WebAssembly with
[Leptos 0.8](https://leptos.dev), **linked directly against the document engine**
(`core/crates/wo-renderer-wasm`) as a plain Rust dependency. One wasm module: ribbon, command
router and document model. No JS glue, no dynamic import, no `getWasmApi()`.

The full ribbon spec is derived from the TypeScript source of truth by a generator, not
hand-ported; the command router is a Rust port of the React app's `word-commands.ts`.

```sh
node tools/gen-ribbon-spec.mjs         # regenerate src/ribbon/spec.rs from word-ribbon.ts
node tools/gen-ribbon-spec.mjs --check # CI gate: fail if the generated file is stale
trunk build --release                  # → dist/ (serve dist/ on any static server)
cargo test --lib                       # 16 unit tests incl. a real-engine round-trip, no browser
for g in port editor ime group tabbar measure; do bash gate/$g.sh; done   # build + browser gates (Playwright)
# Known gaps print `XFAIL`; WO_RUN_XFAILS=1 promotes them to failures so a fixed gap gets noticed.
```

## What is proven where

| Claim | Proven by |
|---|---|
| Generated spec == `word-ribbon.ts` (11 tabs, 52 groups, 196 controls) | `spec::tests::matches_ts_source_of_truth`, `gen-ribbon-spec.mjs --check` |
| Command → format JSON identical to the React app | `commands::tests::format_ops_emit_the_same_json_the_react_app_emitted` |
| bold toggles through the REAL engine (host, no browser) | `engine::engine_roundtrip_tests::bold_toggles_through_the_real_engine` |
| Click → engine → `aria-pressed` reflects the document, toggle round-trip | `gate/port.cjs` |
| `ctx.isEditMode` predicates are live (11 tabs → 8 leaving edit mode) | `gate/port.cjs` |
| Non-engine commands are reported honestly, never as fake success | `gate/port.cjs` |
| IME composition reaches Rust via the hidden textarea | `gate/ime.cjs` |
| Typing, `insertText` (no keydown), paste, IME commit and deletes all land in the document; caret blinks, selection rects, focus kept after ribbon clicks | `gate/editor.cjs` (pixel counts + `#status`) |
| Bold/italic RENDER with the real bold face under wasm (engine: edit-path layout, raster canvas and weight-aware face query) | `gate/editor.cjs` "bold face rendered", `wo-renderer fonts::tests` |
| Two-row groups match the ONLYOffice golden (top row from `census-oo-deep.json`), uniform 24×24 buttons, native selects | `gate/group.cjs` |
| 11 tabs in spec order, roving tabindex, arrow wrap, Home/End | `gate/tabbar.cjs` |
| wasm/JS size budget | `gate/measure.sh` → `MEASUREMENTS.md` |

## Layout

| file | role |
|---|---|
| `src/types.rs` | data-only mirror of `editor-common/src/ribbon/types.ts`: `Kind`, `Control`, `Group`, `Tab`, `Cond`, `RibbonContext` |
| `src/ribbon/spec.rs` | **GENERATED** `tabs()` — the whole spec as data (`tools/gen-ribbon-spec.mjs`) |
| `src/ribbon/commands.rs` | `command_to_format`, `structure_op_for_command`, `step_font_size` — ported from `word-commands.ts` |
| `src/ribbon/engine.rs` | `Doc` (engine handle) → `exec(Cmd)`: apply_formatting / apply_structure_op / undo / redo; `pressed_from_formatting` |
| `src/ribbon/control.rs` | `render_control` for all kinds; `Cmd`, `RibbonState`, `Pressed` |
| `src/ribbon/group.rs` | `RibbonGroup`: `.group[data-group] > .elset > .row-top/.row-bottom`, caption, `when` filtering |
| `src/ribbon/tabbar.rs` | `TabBar` (`role=tablist/tab`, `aria-selected`, arrow keys) |
| `src/ime.rs` | `ImeProbe` — hidden `<textarea>` the browser composes into; Rust tracks composition |
| `gate/` | `common.sh` (build + serve + probe) and one probe per concern |

## How the TS closures became data

`word-ribbon.ts` has 13 predicates like `visible: (ctx) => ctx.isEditMode` and
`checked: (ctx) => ctx.rulerVisible ?? true`. They all have the shape `ctx.<field> ?? <default>`,
so the generator lowers the whole family to `Cond::Ctx { field, default }`, evaluated at render
time against the live `RibbonContext`. A predicate outside that shape fails generation loudly.

## Not yet (honest list)

- **Icons are text** (`<span class="icon" data-icon="Bold">Bold</span>`): a real Lucide SVG renderer is the next slice; `data-icon` is the hydration hook.
- **Layout JSON is discarded** after each command: the canvas page view (the editor itself) is the next slice.
- **Store / panel / router commands** (cut, paste, dialogs, view toggles, plugins, ai) are reported as "not an engine op yet" — ~155 of 196 controls. `tools/ribbon-coverage.mjs` `WIRING.word` is the authoritative target map for wiring them.
- Canvas selection → `pressed` is read from the engine only after a command, not on selection change.

## Leptos 0.8 idioms this crate relies on (verified — 0.6-style code does not compile)

- `use leptos::prelude::*;` · `#[component] pub fn X(prop: T) -> impl IntoView` · `view! { <div class=.. on:click=move |_| ..> }` (no `cx`).
- State: `let s = RwSignal::new(v);` → `s.get()`, `s.set(v)`, `s.update(|x| ..)`; `Memo::new(move |prev: Option<&T>| ..)` (0.8: the closure takes the previous value). Signals are `Copy`.
- **An `Effect` that reads signal A and writes signal B must not read B tracked** — it re-runs on its own write. With a stale trigger this loops forever → stack overflow → the tab **crashes with no panic message**. Consume the trigger first (`cmd.set(None)` right after reading it) and read other signals with `try_with` (untracked). `cargo test` on the host cannot catch this; a browser gate is mandatory for signal wiring.
- `RwSignal<Option<T>>` needs `T: Copy + Send + Sync + 'static` for `try_get` — keep engine handles (`u32`) in signals, not the engine wrapper.
- A `Vec<T>` captured by `move` in one closure is gone for the next one (E0382): call `spec::tabs()` inside each closure (the data is `&'static str`).
- `<For each=move || memo.get() key=|x| .. children=move |x| view!{ .. } />`; a component prop typed `Memo<Vec<T>>` stays reactive where `Vec<T>` would freeze.
- ARIA state is a `String`: `aria-selected=move || (active.get() == id).to_string()`, same for `aria-pressed`.
- `#[wasm_bindgen] pub fn`s are module exports, NOT `window` properties — the trunk loader is an inline module a probe cannot `import()`. Attach gate/host hooks with `js_sys::Reflect::set(&window, "name", Closure::new(f).into_js_value())`.
- Raw strings containing `"#` (e.g. `"#ff0000"`) need `r##"…"##`.
- Mount: `leptos::mount::mount_to_body(App)`.
- trunk 0.22: `<link data-trunk rel="rust" data-bin-pkg="wo-ribbon-leptos">` — do **not** pass `data-type="cdylib"`.

## Build profile

`opt-level = 3, lto = "thin"` — the workspace's wasm release settings. The ribbon-only PoC used
`opt-level = "z"` for size; with the engine linked in its needs dominate. `panic = "abort"` is NOT
set: the engine relies on unwinding.
