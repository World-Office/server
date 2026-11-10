# OO PPTXFormat → wo-slide / wo-x2t — presentation coverage map (ORM-07)

Task: map OnlyOffice's presentation-format C++ (`Euro-Office/core/OOXML/PPTXFormat`, CGC-indexed
447 unique classes / 3379 functions in this graph) onto World-Office's Rust presentation stack so a
1:1 slideshow read/write port can be planned against real gaps instead of vibes.

## Method

- Class inventory: `cgc query 'MATCH (c:Class) WHERE c.path CONTAINS "/PPTXFormat/" RETURN c.name, c.path'`
  → 447 unique classes over: root part headers (89), Logic (256), Theme (24), DrawingConverter (35),
  ViewProps (15), ShowPr (14), Presentation (10), Limit (4). The JSON collapses 447 classes into
  **134 coverage rows** (families of tiny element classes share one row; every row names its family).
- WO side read in this worktree (no sources edited):
  - `core/crates/wo-slide/src/` — `model.rs` (1276 L), `inheritance.rs` (493 L), `animation.rs` (412 L),
    `chart_embed.rs` (776 L), `geometry.rs` (1216 L), `ops.rs` (1492 L), total 5693 L
  - `core/crates/wo-ooxml/src/` — `parser.rs` `parse_pptx*` family, `serializer.rs` `serialize_pptx*`
    family, `model.rs` `PptxPresentation/Slide/SlideShape`
  - `core/crates/wo-x2t/src/` — `presentation_model.rs` (169 L, `WoPresentation` JSON bridge),
    `converters.rs` (`PptxToWoPresentationConverter`, `WoPresentationToPptxConverter`, extra-parts
    re-zip), `router.rs` (`pptx ↔ wo-presentation ↔ odp` pairs)
- Every verdict was checked against the actual code (grep/read), e.g. the bullet gap was verified by
  `grep buChar|buAutoNum wo-ooxml/src/parser.rs` → 0 hits; the group-shape gap by reading
  `parse_pptx_shapes` (direct-children iteration only).

## How to read the JSON

`plan/oo-port/ooxml-pptx.json` — 134 rows `{oo_class, oo_path, wo_coverage, wo_map, notes}`.

- `wo_coverage`: `full` (26) | `partial` (39) | `missing` (69)
- `wo_map` — where the concept lives (or should live) in WO:
  - `slide` (56) → `wo-slide` crate (model / inheritance / animation / geometry / ops)
  - `presentation_model` (1) → `wo-x2t::presentation_model` (WoPresentation JSON bridge)
  - `x2t` (10) → conversion/infrastructure duty in `wo-x2t` + `wo-ooxml` parse/serialize
  - `NONE` (67) → absent everywhere today

## Per-subdir map

### Root part headers (Slide.h / SlideLayout.h / SlideMaster.h / NotesSlide.h / ...)

| OO part | WO verdict |
| --- | --- |
| `Slide` | full — wo-slide `Slide` + wo-ooxml `Slide` carry shapes/notes/transition/animations/timing_raw/background |
| `SlideLayout`, `SlideMaster` | full — model + resolution live in `inheritance.rs` (see deep-dive below) |
| `CSld` | partial — spTree + bg mapped; `clrMapOvr` group and slide text defaults not carried |
| `ClrMapOvr` | missing — color-map override unread; theme-color resolution is approximate |
| `Transition` | partial — one 39-variant `TransitionEffect` enum + `{duration, advance_mode, advance_timing}`; per-effect params and sound dropped |
| `Timing` | partial — preserved verbatim as `Slide.timing_raw` XML string; no typed DAG |
| `TxStyles` | missing — master title/body/other text styles absent |
| `HF` | missing — dt/ftr/sldNum visibility flags unmodeled on all parts |
| `NotesSlide` | partial — plain-text `Slide.notes` only; notes shapes/inheritance/background lost |
| `NotesMaster`, `HandoutMaster` | missing |
| `Comment`/`CommentReply`/monikers/`CommentAuthor` | missing — modern threaded-comment model absent (bytes survive via x2t extra-parts) |
| `TableStyles` | missing — `tableStyles.xml` pipeline absent |
| `CVmlDrawing` | missing — legacy VML part unread |
| `FileContainer/FileMap/FileFactory/WrapperFile/Namespaces` | full (x2t) — intentional non-ports: zip crate + template serializers + `router.rs` cover the same duties |
| `App` | partial — `docProps/app.xml` (slide-title list) not regenerated; `core.xml` covered by `CoreProperties` |

### Presentation/ (presentation.xml children)

- `SldSz` full (wo-slide `SlideSize`, serializer round-trip); `NotesSz`, `Kinsoku`, `PhotoAlbum`,
  `SectionLst`, `CustShow/CustShowLst`, `EmbeddedFont/EmbeddedFontDataId` all **missing**.
- Consequence: no slide sections, no custom shows, no embedded fonts, no notes page size — a deck
  using any of these silently loses the feature on the model path (bytes only survive extra-parts).

### Theme/

- `ClrScheme` full; `FontScheme` partial (major/minor latin only); `ThemeElements` partial;
  `FmtScheme`, extra color schemes, and the whole Visio-theme compat layer **missing**.
- `FmtScheme` is the single biggest theme gap: it is the lookup table behind every `styleRef`
  (`fillRef/lnRef/effectRef/fontRef` with idx). Without it, themed shapes cannot be resolved at all —
  which is why the shape model stores only explicit fills.

### Logic/ (the 256-class core)

- Shapes: `SpTree`/`SpTreeElem` partial — `parse_pptx_shapes` walks **direct children** of `p:spTree`
  only (`sp`, `pic`, `tbl`, `cxnSp`); nested `p:grpSp` groups and `graphicFrame` chart/ole frames are
  silently dropped. `GrpSpPr` missing.
- Geometry: `PrstGeom` full — `geometry.rs::PresetShapeType` is a real port of the CPPTShape preset
  catalog (~187 presets, categories, adjust-guide formulas). `CustGeom` partial — the DSL
  (`Path`/`GuideFormula`/`PathCommand`) is modeled but the parser never populates it.
- Text: `TxBody` full (reuses the word model `TextBody`/`DocxParagraph`/`DocxRun`); `BodyPr`,
  bullets, `Fld`, `Br`, `Tab`, `TextFit`, `TextListStyle` missing/partial — parsed decks lose
  bullets, fields (slide numbers!) and autofit.
- Fills/colors: solid + gradient full; pattern/picture/group fills, `SchemeClr` resolution,
  `ColorModifier` transforms, `SysClr/PrstClr` missing.
- Effects: shadow/glow/reflection full (fixed 3-slot `EffectList`); the 21-class color-effect set
  (`Duotone/AlphaMod/TintEffect/...`) and the 3-D stack (`Scene3d/Sp3d/Bevel/Camera/LightRig`) missing.
- Table: `Table/TableRow/TableCol` full; `TableCell` partial (no margins/anchor/borders);
  `TcBdr`, `TableProperties`, `TableStyle/TablePartStyle/TableBgStyle` missing — tables render
  without rules, which is the most visible fidelity defect on parsed corporate decks.
- Media/SmartArt: `MediaFile/AudioCD/WavAudioFile` missing (no audio/video shapes);
  `SmartArt` partial (labels only, no dgm parts).
- Path2D family: full at the model level (`geometry.rs::PathCommand`), parser wiring pending.

### ShowPr/, ViewProps/, Limit/

- `ShowPr`, `PrintPr` missing — slideshow mode and print defaults don't exist in WO; the WO print
  path just renders slides.
- `ViewProps` missing — no persisted view state (scale/origin/guides/panes).
- `Limit` classes partial — they play out as plain enums per feature (`AnimationTrigger`,
  `ConnectorShapeType`, ...).

### DrawingConverter/ (35 classes)

See the dedicated section below — this subdir is the one OO subsystem with **no Rust counterpart
at all**, and it does not belong in wo-slide.

## Deep-dive: slide inheritance — `inheritance.rs` vs OO theme/master/layout resolution

`wo-slide/src/inheritance.rs` (493 L) implements the Slide → SlideLayout → SlideMaster chain:
`resolve_inheritance()` finds the layout via `slide.layout_id` (matched by id **or name**), falls
back slide.master_id → layout's master, collects placeholder types, and gathers inherited shapes
skipping ones the slide overrides by id. It is read-only (a `ResolvedInheritance` projection) and
F-301-tagged with tests. What it covers vs what OO resolution does:

| Resolution step | OO PPTXFormat | wo-slide `inheritance.rs` |
| --- | --- | --- |
| Layout lookup | rels-driven, by rId + `SlideLayoutMoniker` | `layout_id` string match against all masters' layouts |
| Master fallback | layout's master rel | implemented (`get_master`) |
| Placeholder inheritance | by `type` + `idx` from layout/master, per-placeholder geometry & text | `placeholder_types` list only; inherited **shapes** matched by id, idx not honored |
| Background | slide → layout → master chain, incl. blipFill/pattFill | hardcoded `None` — "neither layouts nor masters carry one in the current model" |
| Color scheme | master `ClrMap` + `ClrMapOvr` → `SchemeClr` → theme `ClrScheme` | not implemented; theme colors never resolved |
| Shape style | `styleRef` → `FmtScheme` tables + `ClrMap` | not implemented (FmtScheme missing) |
| Text defaults | master `TxStyles` + layout/master `TextListStyle` chain | not implemented (TxStyles missing) |
| Placeholder text | empty slide placeholder shows layout/master prompt text | not implemented |

Verdict: the *topology* of the chain is right (and tested), but the *payload* — backgrounds, color
maps, style refs, text styles, placeholder prompts — is not resolved. In practice a deck whose
design lives in the master (which is most corporate templates) renders with its colors, fills and
text defaults missing unless each slide carries explicit values.

## Ranked missing features (each blocks a real fidelity behavior)

1. **grpSp / group shapes** (`SpTree`, `GrpSpPr`) — grouped shapes are dropped at parse
   (direct-children scan). Diagrams built from grouped icons vanish. Highest-impact parse defect.
2. **Theme style resolution**: `FmtScheme` + `ClrMap`/`ClrMapOvr` + `SchemeClr` modifiers +
   `styleRef` — themed fills/lines/effects unresolved; `inheritance.rs` cannot provide them.
3. **Master background chain** — `inheritance.rs` returns `background: None` by construction;
   template backgrounds (often gradient/pattern) don't render.
4. **Slide text bullets** (`BuChar/BuAutoNum/...`) — CLOSED (P2B-P03):
   typed `TextBullet` on `SlideParagraph` via `parse_pptx_text_bodies`.
5. **Table borders/styles** (`TcBdr`, `tableStyles.xml`, `TableProperties`) —
   `tableStyles.xml` CLOSED (P2B-P03, `PptxTableStyles`); `TcBdr` inside
   table cells and `TableProperties` still unwired on `TableShape`.
6. **chart graphicFrame parsing** — `wo-slide::ChartRef` + x2t `WoShapeData.chart` exist as target
   models but `parse_pptx_shapes` never emits chart frames; charts on slides are lost on import
   (wo-x2t keeps chart part bytes via extra-parts, so round-trip survives, editing does not).
7. **Transitions detail** (`dir/orient/spokes` params, sounds) — effect *names* survive, direction
   parameters don't; every push/wipe plays the default direction.
8. **Typed animation timeline** (`Timing` DAG: `Par/Cond/BldP/AnimMotion/...`) — only flattened
   `AnimationData` + `animation.rs` single-sequence runtime; parallel/interactive/step builds lost.
   `timing_raw` keeps bytes for round-trip only.
9. **Notes system** (`NotesMaster`, notes shapes/inheritance, `NotesSz`) — notes are a plain string.
10. **Fields & body layout** (`Fld`, `BodyPr`, `TextFit`) — `BodyPr`/autofit
    CLOSED (P2B-P03, `SlideBodyProperties`/`SlideTextFit`); no slide-number
    fields (`Fld`) yet.
11. **Modern threaded comments** (`Comment*` + monikers) — unmodeled; bytes-only pass-through.
12. **Legacy .ppt binary** (`CBinaryFileReader/Writer`) — no .ppt import at all; x2t-class effort.
13. **Color effects / 3-D stack** — 21 effect classes + `Scene3d/Sp3d/Bevel/Camera/LightRig` absent.

## Where the DrawingConverter belongs in the Rust stack

OO's `CDrawingConverter` (35 classes: `CShape/CPPTShape`, `CXmlWriter`, `CImageManager2`,
`CCSS/CStylesCSS`, `CDocxSerializer`, the binary reader/writer) is not a format reader — it is a
**shape-conversion engine** (flowchart/vector → DrawingML, plus CSS/HTML export). Recommendation:

- Put a new `wo-drawing` crate next to `wo-slide`, owning: preset-shape conversion
  (re-export `wo-slide::geometry`), path/geometry transformation, image pipeline (dedupe/resize —
  today's `PptxExtraPart` byte-preservation stores duplicate media), and a shape→SVG/HTML surface
  (the `CCSS` analog).
- Keep slide-specific glue as `wo-slide::drawing` if a separate crate is premature; do **not**
  fold it into `wo-slide::geometry` — geometry is a static catalog, the converter is a pipeline.
- `CBinaryFileReader/CBinaryFileWriter` (legacy .ppt) is the only piece that genuinely belongs in
  the x2t layer (new `wo-x2t` ppt-binary module), because it is package-level, not shape-level.

## Recommended wo-slide additions (smallest set that closes the top gaps)

1. `inheritance.rs`: resolve background chain (slide → layout → master) and honor placeholder `idx`.
2. `model.rs`: add `GroupShape` variant + `SlideGroup` transform; teach `wo-ooxml` parser recursion
   (fixes gap #1 end-to-end).
3. `theme.rs` (new): `FmtScheme` tables + `ClrMap`/`ClrMapOvr` + `SchemeClr` → concrete color
   resolution, consumed by `inheritance.rs`.
4. Text: `SlideTextBody` with `BodyPr` (anchor/insets/autofit) and bullet properties
   (`BuChar/BuAutoNum`) on `DocxParagraphProperties` (shared word model).
5. Tables: `TableCellBorders` + `TableStyleId` (+ minimal `tableStyles.xml` reader in wo-ooxml).
6. `chart graphicFrame` → `ChartRef` at parse (ChartCollection already exists in `chart_embed.rs`).
7. Transitions: `params` map on `SlideTransition` (direction/orient/spokes) + optional sound ref.

## Round-trip safety net (what keeps fidelity today)

`wo-x2t::presentation_model::PptxExtraPart` preserves every non-regenerated ZIP part
(layouts, masters, notes masters, charts, media, comments, VML, customXml) through the
`WoPresentation` JSON, and `WoPresentationToPptxConverter` re-zips them
(`collect_pptx_extra_parts` + `rewrite_pptx_with_extra_parts`). This is why round-trip tests pass
even though 69/134 mapped concepts are unmodeled: fidelity is byte-level for untouched parts and
lossy only for the parts WO re-serializes from the model.

## Closed since the map was written

### P2B-P03 — slide text bodies (`a:bodyPr` + bullets) and the `tableStyles.xml` reader

Ranked gaps #4 (slide text bullets), #10 (BodyPr/body layout) and #5
(tableStyles.xml) are closed in `wo-ooxml` — as typed views next to, not
inside, the flat word-model `TextBody` (whose fields `wo-x2t/src/converters.rs`
constructs literally, so the shared struct cannot gain fields):

- `SlideTextBody` (`shape_id` + `SlideBodyProperties` from `a:bodyPr` +
  `SlideParagraph` = word-model paragraph + `TextBullet`) — read by
  `OoxmlParser::parse_pptx_text_bodies` (one entry per slide, depth-first
  document order, recursing into `p:grpSp` like `parse_pptx_groups`) and
  written by `OoxmlSerializer::build_slide_xml_with_text_bodies` (rich bodies
  matched to shapes by `p:cNvPr/@id`, unmatched shapes keep the flat body).
  Bullets model `a:buNone`/`a:buChar`/`a:buAutoNum` with the `a:buClr`/
  `a:buSzPct`/`a:buFont` helpers; bodyPr carries anchor/anchorCtr/wrap/vert/
  lIns/tIns/rIns/bIns/numCol/spcCol/rtlCol and the `noAutofit`/`normAutofit`
  (fontScale/lnSpcReduction)/`spAutoFit` choice (`SlideTextFit`).
- `PptxTableStyles` (`a:tblStyleLst`: root `def` + per-style `tblBg` and
  `wholeTbl`/`firstRow`/`firstCol`/`lastRow`/`lastCol`/`band1H`/`band1V`/
  `band2H`/`band2V` parts, each carrying `a:tcBdr` borders — edge, width,
  `prstDash`, srgb/scheme color — plus `a:fillRef`/`a:fontRef` style refs)
  read by `OoxmlParser::parse_pptx_table_styles` (missing part → empty
  default) and written by `OoxmlSerializer::serialize_pptx_table_styles`.
- Two parse-side fixes landed with it: slide shape ids now come from
  `p:cNvPr/@id` (they were read off the `p:sp` element and were always "0",
  which also blocked body→shape matching), and `a:r` run text no longer
  collects pretty-print indentation between run children (text comes only
  from `a:t`).

Still open on the text stack: `a:Fld` (slide numbers/fields), field-level
`TextFit`, master `TxStyles`/`TextListStyle` inheritance, `buSzPts` bullet
sizing, and table→styleId linking (`a:tableStyleId` on `p:tblPr` is still not
carried by the flat `TableShape`).

## Appendix: counts

- JSON rows: **134** — coverage: full 26 / partial 39 / missing 69; wo_map: slide 56 /
  NONE 67 / x2t 10 / presentation_model 1.
- OO class inventory: 447 unique classes / 3379 functions (CGC) collapsed into those rows.
- Sources read in this worktree: wo-slide 5693 L total (model 1276, ops 1492, geometry 1216,
  chart_embed 776, inheritance 493, animation 412, lib 28); wo-x2t presentation_model.rs 169 L;
  wo-ooxml parser/serializer PPTX paths.
