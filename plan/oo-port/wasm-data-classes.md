# ORM-03 — OO `asc_C*` data-transfer classes → Rust serde types for the wasm boundary

Companion artifact: `wasm-data-classes.json` (87 entries). This report explains how the
`asc_C*` classes cluster, what this worktree's Rust crates already carry, what is
missing, and the serde JSON contract `wo-renderer-wasm` should expose.

## 1. Method — how the catalog was extracted (exact commands)

Source bundles were copied out of the running OnlyOffice rig:

```sh
docker cp oo-rig:/var/www/onlyoffice/documentserver/sdkjs/word/sdk-all.js     /tmp/sdk-word.js     # 852,249 lines
docker cp oo-rig:/var/www/onlyoffice/documentserver/sdkjs/word/sdk-all-min.js /tmp/sdk-word-min.js
```

The 87 candidate names come from `/tmp/oo-asc-api.txt` filtered with
`/^asc_C[A-Za-z0-9_]*$/` (the same 87 the ORM campaign inventoried). For each name a
`/usr/bin/node` script (`extract-c-classes.js`) then:

1. Searched both bundles for `function <asc_CName>(` and brace-matched the constructor
   body to collect `this.<prop> =` assignments (cap 20, JSON field `properties`).
2. If the class is exported under an internal name
   (`window["Asc"]["asc_CBullet"] = ... = CBullet`), resolved the ident from the export
   line in `sdk-all.js` and re-searched.
3. Collected `asc_getX`/`asc_putX`/`asc_setX` prototype accessors as additional property
   names when the constructor yielded fewer than 10.
4. Counted UI usage of each name across `/tmp/oo-src/documenteditor/main/app/**` (89 js
   files: controller/, view/, model/) → `ui_uses` / `ui_files` fields.

Result: 79 of 87 names have a constructor definition found in a bundle (word sdk-all-min.js
carries the word/editor classes, sdk-all.js the spreadsheet classes); the remaining 8 are
**method/event symbols** (`asc_CanRemovePages`, `asc_ChangeCropState`, `asc_CheckCopy`,
`asc_CheckForseSet`, `asc_CheckNewBookmarkName`, `asc_CloseSolver`) or
spreadsheet-only definitions not present in the word bundle (`asc_CCommentCoords`,
`asc_CSolverParams`) — flagged honestly in `sdk_def` / `purpose`.

## 2. Property families (16 distinct `purpose` values)

| family           | count | members (examples) |
|------------------|-------|--------------------|
| spreadsheet      | 19    | asc_CCellInfo, asc_CellXfs, asc_CDefName, asc_CAutoFilterInfo, asc_CFormatTableInfo, asc_CSheetViewSettings, asc_CHeaderFooterEditor |
| form-field       | 14    | asc_CBaseFieldProperty, asc_CButtonFieldProperty, asc_CCheckboxFieldProperty, asc_CFieldValidateProperty, all 6 `CField*FormatProperty` |
| shape-graphics   | 13    | asc_CShapeProperty, asc_CShapeFill, asc_CFillGrad, asc_CStroke, asc_CShadowProperty, asc_CImgProperty, asc_CRect, asc_CPaddings |
| chart            | 6     | asc_ChartSettings, asc_CChartSeria, asc_CSeriesSettings, asc_CatAxisSettings, asc_CAxNumFmt, asc_CChartBinary |
| pdf-annotation   | 6     | asc_CAnnotProperty, asc_CFreeTextAnnotProperty, asc_CLineAnnotProperty, asc_CPolyLineAnnotProperty, asc_CClosedAnnotProperty, asc_CPdfPageProperty |
| paragraph        | 4     | asc_CParagraphProperty, asc_CParagraphSpacing, asc_CParagraphShd, asc_CParagraphFrame |
| border           | 3     | asc_CTextBorder, asc_CBorder, asc_CBorders |
| list-bullet      | 3     | asc_CBullet, asc_CListType, asc_CCustomListType |
| page-setup       | 3     | asc_CPageMargins, asc_CPageSetup, asc_CPageOptions |
| method-symbol    | 6     | asc_CanRemovePages, asc_ChangeCropState, asc_CheckCopy, asc_CloseSolver, … |
| comment          | 2     | asc_CCommentDataWord, asc_CCommentData |
| collab           | 2     | asc_CUserInfo, asc_CVersionHistory |
| color            | 1     | asc_CColor |
| style            | 1     | asc_CStyle |
| run-format       | 1     | asc_CTextFontFamily |
| internal-registry| 1     | asc_CHandlersList |

Every entry in the JSON carries `name, purpose, properties, wo_struct_name, wo_missing`
plus three honest extras: `wo_coverage` (full | partial | adapted | missing), `sdk_def`
(where the constructor was found), and `note` (what does / does not map).

## 3. What WO already carries (the `wo_missing=false` side, 41/87)

Verified by reading this worktree, not guessed:

* `wo-ooxml/src/model.rs` — `DocxParagraphProperties` (alignment, indents, spacing
  before/after/line + `LineSpacingRule`, keep_lines/keep_next/page_break_before,
  tabs, num_id/ilvl, bidi, shading, borders), `DocxRun` (bold/italic/underline/
  strikethrough/font/font_size/color/highlight/small_caps/all_caps + comment anchors),
  `DocxBorder`/`DocxParagraphBorders`/`DocxTableBorders`, `TabStop`/`TabStopKind`,
  `SectionProperties` + `HeaderFooter`, `Comment` (id/author/date/text/resolved),
  `XlsxCellXf`/`XlsxFont`/`XlsxFill`/`XlsxBorder`/`XlsxAlignment`/`XlsxProtection`/
  `XlsxDefinedName`, `GradientFill`/`GradientStop`/`Fill`, `ShadowEffect`, `DocxImage`.
* `wo-renderer/src/color.rs` — `Color { r, g, b, a: f32 }` (serde) — the `asc_CColor`
  counterpart, plus `paint::StrokeStyle` and `gradient::{Gradient, GradientStop}`.
* `wo-sheet/src/` — `Cell`, `CellStyle`, `DefinedName`, `CalcMode`, `SheetProtection`,
  `DataValidation`, `PivotTableConfig`.
* `wo-chart/src/` — `Chart`, `Series`, `DataPoint`, `Axis`, `AxisScale`, `Legend`,
  `ChartTitle`, `ChartDataLabel`.
* `wo-slide/src/` — `Rect`, `Point`, `Shape` enum, `TextBoxShape`, `PictureShape`,
  `ConnectorShape`, `TableShape`, `PresetGeometry`.
* `wo-pdf/src/model.rs` — `PdfAnnotation` (subtype, rect, contents, author, color,
  opacity, quad_points, border).
* `wo-renderer-wasm/src/lib.rs` — today only `PdfLayoutOpts` derives
  `serde::Deserialize`; no asc_C* shape crosses the boundary yet. That is the gap this
  catalog prices in.

Coverage is mostly **partial** rather than **full**: the WO structs model the *format*
subset needed for rendering/round-trip, while the OO classes also carry editing-state
flags (CanAddTable, CanAddDropCap, Locked, selection booleans) that belong on the wasm
request envelope, not in the document model.

## 4. Missing families ranked by UI usage

Aggregate `ui_uses` (occurrences in documenteditor app sources) per missing family:

1. **shape-graphics — 51 uses** (`asc_CShapeProperty` 31, `asc_CPaddings` 16, `asc_CFillHatch` 4). CShapeProperty maps to nothing: 51 constructor props
   (crop, flips, aspect lock, geometry guides, effects) have no WO struct. Blocks the
   image/shape settings dialogs of a wasm editor.
2. **form-field — 0 direct uses in the documenteditor app but 14 classes**: the
   entire `asc_C*FieldProperty` + `CField*FormatProperty` family has no counterpart
   anywhere in WO (no content-control / forms model). Largest *class-count* gap;
   FormsTab.js drives it via `api.asc_*` calls, so the wasm boundary needs a serde
   form-property envelope before forms editing can port.
3. **border — 47 uses**: not missing as structs (`DocxBorder` exists) but the top-UI
   class `asc_CTextBorder` only maps partially (`forSelectedCells`, separators).
4. **list-bullet — 3 classes, 0 UI uses here (spreadsheet-driven)**: numbering
   definitions (`this.Text`, `this.Font`, `this.Type`, char/bullet data) unmodeled;
   `DocxParagraphProperties` carries only `num_id`/`ilvl`.
5. **chart extras**: `asc_CAxNumFmt` (axis number format), `asc_CChartBinary`
   (binary chart part re-emission) — charts currently survive only as raw XML.
6. **spreadsheet view state**: `asc_CSheetViewSettings`, `asc_CPane`, `asc_CSheetPr`,
   `asc_CAutoFilterInfo`, `asc_CFormatTableInfo` — frozen panes / filter / sheet tab
   props all missing on the `wo-sheet` side.
7. **collab**: `asc_CUserInfo`, `asc_CVersionHistory` — no collaborator identity or
   revision list model.
8. **comment coords** (`asc_CCommentCoords`) — anchor rectangles unmodeled.

Ranking rationale: items are ordered by how often the OO UI actually constructs the
classes (`ui_uses` in the JSON) and by how many classes a family spans (build effort).

## 5. Recommended serde JSON shapes (3 most important classes)

The wasm boundary should pass these as `JsValue`/`serde_json::Value` with
`#[derive(Serialize, Deserialize)]` structs in `wo-renderer-wasm` (or reuse the
`wo-ooxml` model types directly, which already derive both). Naming: kebab-case JSON
keys via `#[serde(rename_all = "camelCase")]` to match the OO accessors the JS UI
already speaks.

### 5.1 `asc_CColor` → `WasmColor` (22 UI uses; used by everything)

```rust
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmColor {
    /// "srgb" | "auto" | "scheme" — OO asc_CColor.type
    pub kind: WasmColorKind,
    /// #RRGGBB when kind = srgb (OO value + r/g/b collapsed)
    pub hex: Option<String>,
    /// OO r/g/b/a 0–255 (decimal 0–100 optional); None when kind != srgb
    pub rgba: Option<[u8; 4]>,
    /// scheme accent index when kind = scheme
    pub scheme_id: Option<String>,
    /// tint/shade modifiers (OO Mods)
    pub mods: Vec<WasmColorMod>,
}
```

Round-trips into `wo_renderer::color::Color { r: f32, g: f32, b: f32, a: f32 }` and the
`DocxRun.color: Option<String>` hex form.

### 5.2 `asc_CParagraphProperty` → `WasmParagraphProperty` (26 UI uses)

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmParagraphProperty {
    pub alignment: Option<WasmTextAlignment>,   // asc_getJc  -> TextAlignment
    pub ind_left: Option<i32>,                  // asc_getIndLeft (twips)
    pub ind_right: Option<i32>,
    pub ind_first_line: Option<i32>,
    pub spacing_before: Option<i32>,
    pub spacing_after: Option<i32>,
    pub spacing_line: Option<i32>,
    pub spacing_line_rule: Option<WasmLineSpacingRule>,
    pub keep_lines: Option<bool>,
    pub keep_next: Option<bool>,
    pub widow_control: Option<bool>,            // NEW: absent from DocxParagraphProperties
    pub contextual_spacing: Option<bool>,       // NEW: absent from DocxParagraphProperties
    pub page_break_before: Option<bool>,
    pub bidi: Option<bool>,
    pub outline_level: Option<u32>,
    pub tabs: Vec<WasmTabStop>,                 // -> TabStop/TabStopKind
    pub shd: Option<WasmParagraphShd>,          // -> shading
    pub borders: Option<WasmTextBorders>,       // -> DocxParagraphBorders
    pub frame: Option<WasmParagraphFrame>,      // NEW family (missing today)
    // editing-state flags ride along, mirroring the OO constructor
    pub can_add_table: Option<bool>,
    pub can_add_drop_cap: Option<bool>,
    pub locked: Option<bool>,
}
```

A wasm export `asc_put_paragraph_properties(props: WasmParagraphProperty)` can then
patch `EditablePptxPresentation`/`EditableXlsxWorkbook`-style editables or the stub
model, exactly like `PdfLayoutOpts` already does with `serde::Deserialize`.

### 5.3 `asc_CTextBorder` → `WasmBorder` (47 UI uses — highest-frequency class)

```rust
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmBorder {
    /// w:val — "none" | "single" | "double" | "dashed" | …
    pub style: WasmBorderStyle,
    /// eighths of a point (OO Size)
    pub size: u32,
    /// points (OO Space)
    pub space: u32,
    /// #RRGGBB or "auto"
    pub color: String,
}
```

Composes into `WasmTextBorders { left, top, right, bottom, between, bar }` and deserializes
straight into `wo_ooxml::model::DocxBorder`.

## 6. Recommendation summary

1. Add a `wo-renderer-wasm::props` module hosting the ~25 `Wasm*` serde structs needed
   by the top-usage classes (paragraph, color, border, stroke, fills, image), reusing
   `wo-ooxml` model types where the field sets already match (full/partial rows).
2. Treat `wo_missing=true` families as port work items, in this order: form-field
   envelope (14 classes, zero coverage) → numbering/bullet definitions (3) → shape
   property struct (13 props deep, 31 UI uses) → spreadsheet view state (5) →
   collab identity (2).
3. Keep `properties` in `wasm-data-classes.json` as the field-level checklist when
   writing each Rust struct: the getter/setter surface (`asc_getX`/`asc_putX`) is the
   de-facto wire schema OO's JS UI is written against; serde JSON with camelCase keys
   reproduces it 1:1 without a translation layer.
