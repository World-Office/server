# OO core engine (DesktopEditor) → WO renderer crates — engine internals gap list

Task ORM-04 of the oo-rust-map campaign. This report maps OnlyOffice's
native editing-engine internals — the C++ tree under `core/DesktopEditor/` in
the Euro-Office reference checkout — onto World-Office's Rust renderer stack,
and produces the **gap list** a 1:1 wasm port must close for
canvas-accurate editing/rendering parity.

Artifacts:

- `plan/oo-port/engine-internals.json` — one row per DesktopEditor area
  (path segment under `DesktopEditor/`), with cgc class/function counts and
  the WO verdict.
- this report.

Severity scale used in both artifacts:

| sev | meaning |
|-----|---------|
| 0 | covered — a WO crate already implements the equivalent functionality |
| 1 | partial — WO implements a subset; fidelity/perf gaps remain |
| 2 | missing — no WO counterpart; needed for parity but not canvas-blocking |
| 3 | engine-critical-missing — blocks canvas-accurate editing/rendering parity |

## 1. Method (reproducible)

Counts were produced live from the local code graph with the `cgc` CLI
(CodeGraphContext, neo4j backend) over the Euro-Office core checkout at
`/home/weiss/git/Euro-Office/core` (3227 classes / 38208 functions under
`DesktopEditor/` — matches the campaign's CGC-indexed baseline).

Class counts per two-level area:

```cypher
MATCH (c:Class) WHERE c.path CONTAINS "/DesktopEditor/"
WITH split(split(c.path, "/DesktopEditor/")[1], "/")[0] AS a1,
     split(split(c.path, "/DesktopEditor/")[1], "/")[1] AS a2,
     count(c) AS classes ORDER BY a1 DESC, classes DESC
RETURN a1, a2, classes
```

Function counts per two-level area: same query over `(f:Function)`.
The JSON union of both result sets is **167 areas**.

WO-side verdicts were made by reading this worktree's crates, not guessed:

| crate | lines | what it actually implements (read for this report) |
|-------|-------|-----------------------------------------------------|
| wo-renderer | 3865 | `Canvas` (save/restore, transforms, solid/gradient paint, blend modes, single clip path, scanline fill/stroke, `draw_text` via **rustybuzz** shaping + **swash** glyph raster), `TextLayoutEngine` (`char_advance`-based, **no shaping**), `FontLibrary` (fontdb) |
| wo-renderer-wasm | 8829 | `init`, `render_page`, `create_document`, `layout_document`, `render_laid_out_page`, mouse/key editing, selection, undo/redo, formatting ops, `spell_*` exports incl. hyphenation; `layout.rs` lays out `DocxBlock::Image` as a **no-op placeholder**; `canvas_bridge.rs` bundles Liberation fonts and bridges `Canvas` to web canvas |
| wo-fonts | 1155 | ttf-parser face loader, `FontCache`/`FontMatcher` (family/weight), `FontMetrics` (ascent/descent/underline/strike) — **no glyph raster cache, no hinting, no system font scan** |
| wo-spell | 2784 | hunspell-style aff/dic, suggestions, **Liang hyphenation** (`hyphenate.rs`) |
| wo-raster | 667 | `ImageDecoder`/`ImageEncoder` over the `image` crate (png/jpeg/tiff/gif/bmp), `RasterImage` RGBA model, format magic sniffing |
| wo-common | 2254 | document/format registry, doc-tree path addressing, units (EMU matrix), encoding — **no base64, no CRC32** |
| wo-ooxml | 12385 | OOXML model/parser/serializer over **roxmltree** (read-only DOM) |

Workspace deps confirm the shaping/raster situation: `rustybuzz = 0.20`,
`swash = 0.2`, `fontdb = 0.16`, `ttf-parser = 0.25`,
`image = { 0.25, features = [png, jpeg, tiff, gif, bmp] }`, `roxmltree = 0.20`.

## 2. Totals

Severity histogram over 167 areas: **36 covered / 40 partial / 72 missing / 19 engine-critical-missing**.

| family | areas | classes | fns | sev0 | sev1 | sev2 | sev3 |
|--------|------:|--------:|----:|-----:|-----:|-----:|-----:|
| agg-2.4 | 7 | 547 | 4911 | 2 | 1 | 1 | 3 |
| AllFontsGen | 1 | 0 | 3 | 0 | 0 | 1 | 0 |
| allthemesgen | 1 | 0 | 8 | 0 | 0 | 1 | 0 |
| common | 24 | 26 | 387 | 7 | 13 | 4 | 0 |
| cximage | 10 | 527 | 5382 | 3 | 1 | 5 | 1 |
| doctrenderer | 27 | 169 | 1660 | 5 | 3 | 18 | 1 |
| fontengine | 24 | 53 | 702 | 2 | 6 | 14 | 2 |
| freetype_names | 2 | 134 | 2346 | 1 | 1 | 0 | 0 |
| freetype-2.10.4 | 4 | 124 | 3007 | 3 | 1 | 0 | 0 |
| graphics | 50 | 167 | 1798 | 9 | 10 | 21 | 10 |
| pluginsmanager | 2 | 3 | 49 | 0 | 0 | 2 | 0 |
| raster | 9 | 1018 | 9726 | 2 | 2 | 3 | 2 |
| vboxtester | 1 | 2 | 44 | 1 | 0 | 0 | 0 |
| xml | 3 | 412 | 5934 | 0 | 2 | 1 | 0 |
| xmlsec | 2 | 45 | 2251 | 1 | 0 | 1 | 0 |
| **total** | **167** | **3227** | **38208** | **36** | **40** | **72** | **19** |

Read of the totals:

- `raster` is the biggest family (1018 classes / 9726 fns) and the worst
  asymmetry: WO's 667-line wo-raster handles the common bitmap formats only.
- `agg-2.4` + `graphics` together are OO's rasterization brain (714 classes /
  6709 fns); WO's Canvas covers the easy 20% of it.
- `xml` (412/5934) is mostly vendored libxml2; roxmltree replaces parsing but
  nothing replaces XPath/XInclude.
- `freetype-2.10.4`/`freetype_names` are largely *replaced*, not ported:
  ttf-parser/fontdb/swash cover parsing, metrics and glyph rasterization
  (minus bytecode hinting).
- `fontengine` is where text parity lives (53 classes, all load-bearing).

## 3. Area table

All 167 areas (full detail incl. per-area notes is in
`engine-internals.json`). sevw = WO crate the area maps to (NONE = nothing).

| oo_area | classes | fns | wo_crate | sev |
|---------|--------:|----:|----------|----:|
| agg-2.4/examples | 109 | 847 | NONE | 0 |
| agg-2.4/font_freetype | 3 | 43 | wo-fonts | 1 |
| agg-2.4/font_win32_tt | 3 | 51 | NONE | 0 |
| agg-2.4/gpc | 21 | 29 | NONE | 3 |
| agg-2.4/include | 340 | 2675 | wo-renderer | 3 |
| agg-2.4/src | 10 | 521 | wo-renderer | 2 |
| agg-2.4/svg | 61 | 745 | NONE | 3 |
| AllFontsGen/main.cpp | 0 | 3 | NONE | 2 |
| allthemesgen/main.cpp | 0 | 8 | NONE | 2 |
| common/ASCVariant.h | 0 | 1 | wo-common | 0 |
| common/Base64.cpp | 0 | 18 | NONE | 2 |
| common/BigInteger.h | 1 | 14 | NONE | 2 |
| common/ByteBuilder.cpp | 0 | 18 | wo-common | 1 |
| common/ByteBuilder.h | 2 | 0 | wo-common | 1 |
| common/CalculatorCRC32.h | 1 | 3 | NONE | 2 |
| common/Directory.cpp | 0 | 16 | wo-common | 1 |
| common/File.cpp | 0 | 78 | wo-common | 1 |
| common/File.h | 4 | 1 | wo-common | 1 |
| common/IGrObject.h | 1 | 5 | wo-common | 0 |
| common/Mac | 0 | 1 | NONE | 0 |
| common/MathUtils.h | 7 | 53 | wo-common | 1 |
| common/Path.cpp | 0 | 7 | wo-common | 1 |
| common/ProcessEnv.cpp | 1 | 21 | wo-common | 1 |
| common/ShapeAspects.h | 1 | 2 | NONE | 2 |
| common/StreamWriter.cpp | 0 | 4 | wo-common | 1 |
| common/StreamWriter.h | 1 | 0 | wo-common | 1 |
| common/StringBuilder.cpp | 0 | 97 | wo-common | 0 |
| common/StringBuilder.h | 2 | 0 | wo-common | 0 |
| common/StringExt.cpp | 1 | 14 | wo-common | 1 |
| common/StringExt.h | 3 | 14 | wo-common | 1 |
| common/StringUTF32.cpp | 0 | 14 | wo-common | 0 |
| common/StringUTF32.h | 1 | 0 | wo-common | 0 |
| common/SystemUtils.cpp | 0 | 6 | wo-common | 1 |
| cximage/CxImage | 35 | 692 | wo-raster | 2 |
| cximage/jasper | 15 | 608 | NONE | 3 |
| cximage/jbig | 64 | 43 | NONE | 2 |
| cximage/jpeg | 114 | 658 | wo-raster | 0 |
| cximage/libpsd | 30 | 383 | NONE | 2 |
| cximage/mng | 0 | 866 | NONE | 2 |
| cximage/png | 103 | 985 | wo-raster | 0 |
| cximage/raw | 73 | 329 | NONE | 2 |
| cximage/tiff | 37 | 666 | wo-raster | 1 |
| cximage/zlib | 56 | 152 | wo-raster | 0 |
| doctrenderer/addon | 1 | 3 | NONE | 2 |
| doctrenderer/app_builder | 0 | 3 | NONE | 2 |
| doctrenderer/app_builder_lib | 0 | 5 | NONE | 2 |
| doctrenderer/config.h | 3 | 8 | wo-common | 1 |
| doctrenderer/docbuilder_p.cpp | 0 | 101 | NONE | 2 |
| doctrenderer/docbuilder_p.h | 10 | 45 | NONE | 2 |
| doctrenderer/docbuilder.com | 9 | 7 | NONE | 0 |
| doctrenderer/docbuilder.cpp | 0 | 6 | NONE | 2 |
| doctrenderer/docbuilder.h | 10 | 0 | NONE | 2 |
| doctrenderer/docbuilder.java | 12 | 247 | NONE | 0 |
| doctrenderer/docbuilder.net | 1 | 49 | NONE | 0 |
| doctrenderer/docbuilder.python | 9 | 112 | NONE | 0 |
| doctrenderer/doctrenderer.cpp | 2 | 21 | NONE | 2 |
| doctrenderer/doctrenderer.h | 2 | 0 | NONE | 2 |
| doctrenderer/drawingfile.h | 1 | 28 | NONE | 2 |
| doctrenderer/editors.cpp | 0 | 9 | NONE | 2 |
| doctrenderer/embed | 27 | 300 | NONE | 2 |
| doctrenderer/graphics.cpp | 0 | 82 | wo-renderer-wasm | 2 |
| doctrenderer/graphics.h | 1 | 17 | wo-renderer-wasm | 2 |
| doctrenderer/hash.cpp | 0 | 5 | NONE | 2 |
| doctrenderer/hash.h | 1 | 0 | wo-common | 1 |
| doctrenderer/js_internal | 51 | 226 | NONE | 3 |
| doctrenderer/json | 16 | 122 | wo-common | 1 |
| doctrenderer/nativecontrol.cpp | 0 | 3 | NONE | 2 |
| doctrenderer/nativecontrol.h | 6 | 47 | NONE | 2 |
| doctrenderer/server.h | 1 | 6 | NONE | 2 |
| doctrenderer/test | 6 | 208 | NONE | 0 |
| fontengine/ApplicationFonts.cpp | 2 | 63 | wo-fonts | 1 |
| fontengine/ApplicationFonts.h | 6 | 6 | wo-fonts | 1 |
| fontengine/ApplicationFontsWorker.cpp | 6 | 33 | wo-fonts | 2 |
| fontengine/ApplicationFontsWorker.h | 3 | 1 | wo-fonts | 2 |
| fontengine/fontconverter | 12 | 216 | NONE | 2 |
| fontengine/FontConverter.h | 1 | 0 | wo-fonts | 2 |
| fontengine/fontdictionaryworker.h | 0 | 1 | NONE | 2 |
| fontengine/FontFile.cpp | 0 | 60 | wo-fonts | 2 |
| fontengine/FontFile.h | 7 | 3 | wo-fonts | 2 |
| fontengine/FontManager.cpp | 0 | 52 | wo-fonts | 2 |
| fontengine/FontManager.h | 5 | 8 | wo-fonts | 2 |
| fontengine/FontPath.cpp | 0 | 15 | NONE | 2 |
| fontengine/FontPath.h | 1 | 5 | NONE | 2 |
| fontengine/FontsAssistant.cpp | 0 | 6 | wo-fonts | 2 |
| fontengine/FontsAssistant.h | 1 | 0 | NONE | 2 |
| fontengine/GlyphString.cpp | 0 | 23 | wo-renderer | 3 |
| fontengine/GlyphString.h | 3 | 0 | wo-renderer | 3 |
| fontengine/js | 1 | 138 | NONE | 2 |
| fontengine/MemoryStream.h | 1 | 22 | wo-common | 1 |
| fontengine/TextHyphen.cpp | 1 | 12 | wo-spell | 0 |
| fontengine/TextHyphen.h | 2 | 0 | wo-spell | 0 |
| fontengine/TextShaper_p.h | 0 | 2 | wo-renderer | 1 |
| fontengine/TextShaper.cpp | 0 | 36 | wo-renderer | 1 |
| fontengine/TextShaper.h | 1 | 0 | wo-renderer | 1 |
| freetype_names/FontMaps | 1 | 3 | wo-fonts | 1 |
| freetype_names/freetype-2.5.3 | 133 | 2343 | NONE | 0 |
| freetype-2.10.4/builds | 19 | 106 | NONE | 0 |
| freetype-2.10.4/docs | 0 | 613 | NONE | 0 |
| freetype-2.10.4/include | 0 | 26 | wo-fonts | 0 |
| freetype-2.10.4/src | 105 | 2262 | wo-fonts | 1 |
| graphics/aggplustypes.h | 5 | 47 | wo-renderer | 1 |
| graphics/AlphaMask_p.h | 4 | 12 | wo-renderer | 2 |
| graphics/AlphaMask.cpp | 0 | 13 | wo-renderer | 2 |
| graphics/AlphaMask.h | 3 | 0 | wo-renderer | 2 |
| graphics/ArrowHead.cpp | 0 | 14 | NONE | 2 |
| graphics/ArrowHead.h | 1 | 0 | NONE | 2 |
| graphics/BaseThread.cpp | 3 | 22 | NONE | 2 |
| graphics/BaseThread.h | 2 | 0 | NONE | 2 |
| graphics/BaseThreadMonitor.cpp | 0 | 8 | wo-renderer | 2 |
| graphics/BaseThreadMonitor.h | 2 | 0 | NONE | 2 |
| graphics/boolean_operations_math.h | 0 | 23 | NONE | 3 |
| graphics/BooleanOperations.cpp | 0 | 88 | NONE | 3 |
| graphics/BooleanOperations.h | 1 | 1 | wo-renderer | 2 |
| graphics/Brush.cpp | 0 | 49 | wo-renderer | 1 |
| graphics/Brush.h | 5 | 1 | wo-renderer | 1 |
| graphics/Clip.cpp | 0 | 27 | wo-renderer | 1 |
| graphics/Clip.h | 3 | 0 | wo-renderer | 1 |
| graphics/Color.h | 1 | 21 | wo-renderer | 0 |
| graphics/commands | 39 | 272 | NONE | 3 |
| graphics/Graphics.cpp | 0 | 88 | wo-renderer | 2 |
| graphics/Graphics.h | 4 | 10 | wo-renderer | 2 |
| graphics/GraphicsLayer.cpp | 0 | 8 | wo-renderer | 2 |
| graphics/GraphicsLayer.h | 1 | 0 | wo-renderer | 2 |
| graphics/GraphicsLayerBlend.h | 0 | 3 | wo-renderer | 2 |
| graphics/GraphicsPath_private.h | 2 | 2 | wo-renderer | 1 |
| graphics/GraphicsPath.cpp | 0 | 92 | wo-renderer | 1 |
| graphics/GraphicsPath.h | 4 | 0 | wo-renderer | 1 |
| graphics/GraphicsRenderer.cpp | 1 | 134 | wo-renderer | 2 |
| graphics/GraphicsRenderer.h | 2 | 23 | wo-renderer | 2 |
| graphics/Image.cpp | 0 | 17 | wo-renderer | 3 |
| graphics/Image.h | 3 | 0 | wo-renderer | 3 |
| graphics/ImageFilesCache.h | 2 | 7 | wo-raster | 2 |
| graphics/IRenderer.h | 4 | 20 | wo-renderer | 1 |
| graphics/Matrix_private.h | 1 | 1 | wo-renderer | 0 |
| graphics/Matrix.cpp | 0 | 34 | wo-renderer | 0 |
| graphics/Matrix.h | 2 | 0 | wo-renderer | 0 |
| graphics/MetafileToGraphicsRenderer.cpp | 1 | 18 | NONE | 3 |
| graphics/MetafileToGraphicsRenderer.h | 2 | 0 | NONE | 3 |
| graphics/MetafileToRenderer.cpp | 1 | 23 | NONE | 3 |
| graphics/MetafileToRenderer.h | 1 | 0 | NONE | 3 |
| graphics/MetafileToRendererCheck.h | 2 | 1 | NONE | 2 |
| graphics/MetafileToRendererReader.h | 2 | 18 | NONE | 3 |
| graphics/pro | 42 | 537 | wo-renderer-wasm | 2 |
| graphics/shading_info.h | 2 | 47 | wo-renderer | 2 |
| graphics/structures.h | 6 | 35 | wo-renderer | 1 |
| graphics/TemporaryCS.cpp | 3 | 23 | wo-renderer | 0 |
| graphics/TemporaryCS.h | 4 | 0 | wo-renderer | 0 |
| graphics/tests | 5 | 52 | wo-renderer | 0 |
| graphics/Timer.cpp | 0 | 6 | NONE | 0 |
| graphics/Timer.h | 1 | 1 | NONE | 0 |
| pluginsmanager/help.h | 0 | 2 | NONE | 2 |
| pluginsmanager/main.cpp | 3 | 47 | NONE | 2 |
| raster/BgraFrame.cpp | 0 | 27 | wo-raster | 0 |
| raster/BgraFrame.h | 1 | 0 | wo-raster | 0 |
| raster/heif | 2 | 8 | NONE | 2 |
| raster/ImageFileFormatChecker.cpp | 0 | 39 | wo-raster | 1 |
| raster/ImageFileFormatChecker.h | 1 | 0 | wo-raster | 1 |
| raster/JBig2 | 5 | 1466 | NONE | 2 |
| raster/Jp2 | 762 | 5074 | NONE | 3 |
| raster/Metafile | 246 | 3083 | NONE | 3 |
| raster/PICT | 1 | 29 | NONE | 2 |
| vboxtester/main.cpp | 2 | 44 | NONE | 0 |
| xml/include | 7 | 1 | wo-ooxml | 1 |
| xml/libxml2 | 401 | 5747 | wo-ooxml | 2 |
| xml/src | 4 | 186 | wo-ooxml | 1 |
| xmlsec/src | 39 | 2227 | NONE | 2 |
| xmlsec/test | 6 | 24 | NONE | 0 |

## 4. Severity-3 areas — engine-critical gaps (full list)

These block canvas-accurate editing/rendering parity; each needs a designed
Rust counterpart before a 1:1 wasm port can claim parity. One-line rationale
each (fuller notes per row in the JSON):

1. **agg-2.4/gpc** (21 cl / 29 fns → NONE) — gpc.c general polygon clipper (union/intersect/difference/xor) behind Agg conv_gpc. WO has zero boolean path ops — shape merge/subtract editing cannot be reproduced.
2. **agg-2.4/include** (340 cl / 2675 fns → wo-renderer) — Agg core API: rasterizer_cells_aa + scanline AA, conv_stroke/conv_curve/vcgen_dash, span gradients, image resampling filters, pixfmt variants, blur. WO Canvas implements only a basic scanline filler/stroker with fixed 1-pass AA — no stroke join/dash generators, no image filters, no compound rasterizer.
3. **agg-2.4/svg** (61 cl / 745 fns → NONE) — Agg SVG parser + renderer (agg_svg parser, path/adapters, gradients). WO has NO SVG rendering anywhere in the crates — SVG images and drawn shapes render blank.
4. **cximage/jasper** (15 cl / 608 fns → NONE) — Jasper JPEG2000 codec (608 fns) — OO's second JP2 path; same blocker as raster/Jp2.
5. **doctrenderer/js_internal** (51 cl / 226 fns → NONE) — V8/JavaScriptCore embedding layer (CJSContext, CJSObjectV8/JSC, CV8Worker, inspector, WebSocketServer). WO has NO server-side JS host — docbuilder formulas and macro scripts cannot execute inside wo-x2t; in-browser WO leans on the JS runtime, server-side conversion does not.
6. **fontengine/GlyphString.cpp** (0 cl / 23 fns → wo-renderer) — See GlyphString.h note.
7. **fontengine/GlyphString.h** (3 cl / 0 fns → wo-renderer) — CGlyphString: shaped, measured string (kerned/ligated glyph array, tab runs, Y positions). WO TextLayoutEngine measures with char_advance — no kerning, ligatures, or bidi — so line breaks and glyph positions diverge on complex text.
8. **graphics/boolean_operations_math.h** (0 cl / 23 fns → NONE) — Math kernel for graphics/BooleanOperations (segment intersection/point classification). Missing with the engine above.
9. **graphics/BooleanOperations.cpp** (0 cl / 88 fns → NONE) — Shape boolean engine (union/subtract/intersect over paths used by OO drawing tools). WO has none; boolean shape editing cannot be reproduced.
10. **graphics/commands** (39 cl / 272 fns → NONE) — IMetafileToRenderter + command records replaying metafiles into IRenderer. Depends on the missing raster/Metafile parsers; no WO counterpart.
11. **graphics/Image.cpp** (0 cl / 17 fns → wo-renderer) — Image drawing implementation (DrawImage/stretch/alpha); missing on WO Canvas as above.
12. **graphics/Image.h** (3 cl / 0 fns → wo-renderer) — Canvas image blitting under transforms with alpha. WO Canvas has NO draw_image — wo-renderer-wasm/src/layout.rs literally skips DocxBlock::Image with a 'placeholder for DM-7' comment. Every picture in a document is unrendered.
13. **graphics/MetafileToGraphicsRenderer.cpp** (1 cl / 18 fns → NONE) — Replays EMF/WMF records into AggPlus Graphics calls; blocked by missing metafile parsers.
14. **graphics/MetafileToGraphicsRenderer.h** (2 cl / 0 fns → NONE) — Metafile→Graphics replay interface; no WO counterpart.
15. **graphics/MetafileToRenderer.cpp** (1 cl / 23 fns → NONE) — Replays metafiles into IRenderer vector commands; no WO counterpart.
16. **graphics/MetafileToRenderer.h** (1 cl / 0 fns → NONE) — Metafile replay driver; no WO counterpart.
17. **graphics/MetafileToRendererReader.h** (2 cl / 18 fns → NONE) — Metafile reader interface (EMF/WMF/SVG readers); no WO counterpart.
18. **raster/Jp2** (762 cl / 5074 fns → NONE) — OpenJPEG-based JPEG2000 codec (762 classes: tiles, MCT, wavelets, JP2 boxes). The `image` crate features (png/jpeg/tiff/gif/bmp) have no JP2 — embedded JP2 imagery renders as placeholders.
19. **raster/Metafile** (246 cl / 3083 fns → NONE) — EMF/WMF/EMF+ parsers + CEmfInterpretator{Render,Svg,Xml} players + EMF+ object model (pens/brushes/paths/images). WO has no metafile support at all — vector clip-art and pasted Office drawings disappear.

Grouped, the 19 severity-3 rows are really **six** engine capabilities:

1. **Image blitting on the canvas** (`graphics/Image.*`) — a document without
   pictures is not a document; today every image is skipped in `layout.rs`.
2. **Vector metafiles** (`raster/Metafile`, `graphics/commands`,
   `graphics/MetafileTo*`) — EMF/WMF/EMF+ parse + replay-to-renderer.
3. **Boolean path ops** (`agg-2.4/gpc`, `graphics/BooleanOperations.*`) —
   merge/subtract/intersect for shape editing.
4. **High-grade rasterization** (`agg-2.4/include`) — Agg-quality AA,
   stroke joins/dashes, image resampling filters, compound rasterizer.
5. **Text layout with shaping** (`fontengine/GlyphString.*`) — kerned,
   ligated, bidi-aware measurement feeding line breaking; rustybuzz exists
   but only on the `Canvas::draw_text` path, not in `TextLayoutEngine`.
6. **Format codecs & host**: JPEG2000 (`raster/Jp2`, `cximage/jasper`), SVG
   (`agg-2.4/svg`), server-side JS host (`doctrenderer/js_internal`).

## 5. Recommended new Rust modules

New modules/crates, in priority order (name → absorbs which severity-3 rows):

| new module | absorbs | note |
|------------|---------|------|
| `wo-renderer::textlayout` | fontengine/GlyphString.*, wasm layout.rs line breaking | real line breaker consuming shaped runs; tab stops, alignment, baseline grid; the current `TextLayoutEngine` stays as the fallback |
| `wo-renderer::shaping` | fontengine/TextShaper.* (currently sev-1) | promote rustybuzz+swash from `Canvas::draw_text` internals into a first-class `Shaper` API: `shape(text, font, size, script, dir) -> GlyphRun`, consumed by `textlayout`; adds bidi segmentation (wo-unicode has the tables) |
| `wo-renderer::draw_image` (Canvas method) | graphics/Image.*, ImageFilesCache | `draw_image(&RasterImage, dst_rect, src_rect, transform, alpha)` + resampling (bilinear first, Agg-style filters later) + an id→frame cache |
| `wo-renderer::boolops` | graphics/BooleanOperations.*, agg-2.4/gpc | polygon boolean ops (union/intersect/diff) over `PathBuilder`; port gpc.c or adopt `pathfinding`-style clipper crate |
| `wo-renderer::stroke` | agg-2.4/include (stroke slice) | proper stroke generator: joins (miter/round/bevel), caps, dash arrays — the Agg `vcgen_stroke`/`math_stroke` equivalents |
| `wo-metafile` (new crate) | raster/Metafile, graphics/commands, graphics/MetafileTo* | EMF/WMF/EMF+ record parser + an `interpret(renderer)` replay trait; render target = wo-renderer Canvas |
| `wo-raster::jp2` | raster/Jp2, cximage/jasper | JPEG2000 decode (bind or port OpenJPEG-lite); starts with JP2 container + code-stream decode to RGBA |
| `wo-raster::svg` or `wo-svg` | agg-2.4/svg | SVG → PathBuilder/Gradient/Canvas pipeline (parse via roxmltree already in-tree) |
| `wo-fonts::glyphcache` | fontengine/FontFile.*, FontManager.*, agg-2.4/font_freetype | LRU glyph raster cache keyed by (face, gid, size, transform), hinting on/off; feeds both canvas and textlayout |
| `wo-common::base64` + `wo-common::crc32` | common/Base64.cpp, CalculatorCRC32.h | trivial, needed by metafile/zip/signature paths |
| `wo-script` (decision needed) | doctrenderer/js_internal | server-side JS host for formulas/macros in wo-x2t; options: embed quickjs/rusty-v8, or declare browser-only and drop from server parity scope |

Not recommended to port: `agg-2.4/examples`, `freetype-2.10.4/builds`,
`vboxtester`, the docbuilder language bindings (java/python/com/net) — dead
weight for a Rust/wasm port (all sev-0 in the JSON with that rationale).

## 6. How wo-renderer-wasm grows to absorb the gaps

The wasm crate already has the right *shape* for this: model-in
(`create_document`/`create_model`) → layout (`layout.rs`, `layout_document`)
→ render (`render_page`, `render_laid_out_page`, `layout_and_render`) →
edit (mouse/key/insert/apply_formatting/undo/redo) → out
(`serialize_document`, `get_selection_rects`, `get_cursor_position`), plus
`canvas_bridge.rs` for web-canvas output and `spell_*` exports for
wo-spell. The gaps land in it as follows:

1. **Phase A — images (unblocks the loudest parity bug).** Add
   `Canvas::draw_image` in wo-renderer, then stop skipping
   `DocxBlock::Image` in `wo-renderer-wasm/src/layout.rs` (currently a
   literal `=> {}` with the "DM-7" placeholder comment). Needs a wasm
   export to feed decoded image bytes/handles; `canvas_bridge.rs` gains an
   `ImageData` blit path.
2. **Phase B — textlayout/shaping.** Extract a `Shaper` from
   `canvas.rs::draw_text`, wire it into `TextLayoutEngine`, and replace the
   `char_advance` line breaking used by `layout.rs` with shaped-run line
   breaking. This changes no wasm signatures — `layout_document` output
   just becomes correct for kerned/complex text.
3. **Phase C — rasterization quality.** Swap the hand-rolled scanline
   filler for an Agg-grade rasterizer behind the same `Canvas` API
   (stroke joins/dashes + AA cells + clip stack); canvas_bridge keeps
   working because the API surface is unchanged.
4. **Phase D — metafile/svg/jp2 decode.** New crates expose `decode →
   RasterImage | command list`; the wasm crate routes `DocxBlock::Image`
   payloads through them exactly like PNG/JPEG today.
5. **Phase E — boolean ops + JS host** for shape editing and server-side
   formulas; the wasm boundary needs new exports (`apply_structure_op`
   already exists as the shape-op hook point; a `formula_eval` export
   would hang off the Phase-E JS host decision).

## 7. Follow-ups

- Severity-3 is **19 rows / 6 capabilities** — Phase A (images) is the
  smallest diff with the largest visual payoff and should be filed first
  (it is already named as DM-7 in the wasm crate).
- `fontengine/TextShaper` is only sev-1 *because* rustybuzz exists; the
  gap is wiring, not capability. textlayout+shaping are the two new
  wo-renderer modules to land for Phase B.
- wo-unicode (1039 lines, not part of the campaign's crate list) already
  carries bidi-related tables that Phase B shaping will consume.
- A same-method re-run of the two cypher queries in §1 regenerates the
  counts; the JSON was produced by merging them with a curated verdict
  table (`orm04-build.cjs`, kept next to the artifacts for reproducibility).

