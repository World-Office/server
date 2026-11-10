# plan/oo-port — oo-rust-map campaign index

Nine OO→WO coverage maps (ORM-01 … ORM-09) plus one consolidated port plan
(ORM-10). Each map pairs a human report (`.md`, method + verdicts) with a
machine-readable companion (`.json`, one row per measured unit). Everything
was measured against the Euro-Office core checkout (cgc-indexed) and read
side-by-side with this worktree's crates; the per-map `Method` sections quote
the exact commands.

| task | deliverables | question it answers | headline verdict |
|---|---|---|---|
| ORM-01 | `wasm-api.md` / `wasm-api.json` | Which `asc_*` methods must the wasm boundary expose? | 970 unique names; only 3 of 35 WO exports cover a row (`insert_text`→`asc_enterText`, `spell_check_word`→`asc_IsSpellCheckCurrentWord`, `serialize_document`→`asc_Save`); event channel first (R0) |
| ORM-02 | `wasm-events.md` / `wasm-events.json` | How do engine→UI events reach editor.js? | 386 events; UI registers 191 names at 459 `asc_registerCallback` sites; `WsEvent` push enum, 15 Phase-1 frames ≈ 85% of UI value, `Other { name }` preserves the tail |
| ORM-03 | `wasm-data-classes.md` / `wasm-data-classes.json` | What payloads cross the boundary? | 87 `asc_C*` classes, 16 families; ~25 serde structs in a `wo-renderer-wasm::props` module; camelCase serde = OO's `asc_getX`/`asc_putX` wire schema |
| ORM-04 | `engine-internals.md` / `engine-internals.json` | Which DesktopEditor internals are missing in WO? | 167 areas: 36 covered / 40 partial / 72 missing / 19 engine-critical; the 19 collapse into 6 capabilities (images, shaping, text layout, rasterizer, metafile decode, boolean ops/JS host) |
| ORM-05 | `ooxml-docx.md` / `ooxml-docx.json` | Can WO read/write DOCX like OO? | 193 rows: 32 full / 46 partial / 115 missing (P2-05 moved CNumbering/CAbstractNum/CLvl/CNum to full — data-driven numbering); verbatim escape hatches carry fidelity; fields and settings engines are the ranked additions |
| ORM-06 | `ooxml-xlsx.md` / `ooxml-xlsx.json` | Can WO read/write XLSX like OO? | 118 families: 2 full / 42 partial / 74 missing; 9 core parts regenerated, the rest rides `extra_parts` passthrough; additive `wo-sheet::*` module plan |
| ORM-07 | `ooxml-pptx.md` / `ooxml-pptx.json` | Can WO read/write PPTX like OO? | 134 rows: 26 full / 39 partial / 69 missing; inheritance chain, theme, group shapes, text body, tables, transitions; `PptxExtraPart` keeps untouched parts byte-identical |
| ORM-08 | `legacy-binary.md` / `legacy-binary.json` | What about legacy `.doc`/`.xls`/`.ppt`? | 53 rows: 5 full / 9 partial / 1 stub / 38 missing; read-only policy, never-build writers; `.doc` is the honest gap (DocFile: 287 files / 330 classes, zero WO coverage) |
| ORM-09 | `ui-webapp.md` / `ui-webapp.json` | Can editor.js host the OO UI surface? | 217 rows: 60 full / 91 partial / 51 missing / 15 merged-into-editor.js; data-driven dialog engine + 3 widget ports landed (P3-U01 `wo-dialogs.js`), five consumer dialog specs hosted from it (P3-U02/U03); dialog order is wasm-contract-first |
| ORM-10 | `PORT-PLAN.md` (+ this index) | How do the nine maps become one plan? | architecture decision — WO's own boundary (push events, property blobs, typed ops) with `asc_*` served as a compatibility layer, not a 1:1 port; four phases; ten named risks |

## Reading order

1. **`PORT-PLAN.md`** (ORM-10) — the decision, the consolidated scoreboard,
   the four phases, the risks. Start here.
2. **ORM-01** — the keystone: what the wasm boundary must grow to cover, and
   why the boundary is currently a renderer boundary, not an editing-engine
   boundary.
3. **ORM-02 / ORM-03** — the two halves of the boundary contract (events out,
   property payloads in) that Phase 1 implements.
4. **ORM-04** — the engine gap list behind the boundary (Phase 2 items 1–3).
5. **ORM-05 / ORM-06 / ORM-07 / ORM-08** — the format layer, per app and for
   legacy binaries (Phase 2 items 4–6, Phase 4).
6. **ORM-09** — the UI layer that consumes everything above (Phase 3).

## Conventions

- Coverage vocabularies are per-map and declared inside each report
  (`wo_missing` for ORM-01/02/03; `sev` 0–3 for ORM-04; `full|partial|missing`
  for ORM-05/06/07/08; `full|partial|missing|merged-into-editor.js` for
  ORM-09). Do not compare ratios across maps — row units differ (method,
  event, class, area, family, component).
- Every verdict cites WO source read in this worktree (crate/line where
  useful); OO figures come from the cgc graph over the Euro-Office checkout
  or regex passes over the `sdkjs` bundles pulled from the `oo-rig` container.
- The JSON files are the ledgers of record: as phases land, update
  `wo_export_name`/`wo_missing` (ORM-01/02/03), `sev` (ORM-04), and the
  coverage fields (ORM-05…09) rather than rewriting the reports' history.
