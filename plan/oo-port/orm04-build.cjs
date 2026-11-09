#!/usr/bin/env node
// ORM-04 artifact builder — merges cgc class/fn counts for Euro-Office
// core/DesktopEditor areas with a curated WO-coverage map.
const fs = require("fs");

const parse = (p) => {
  const s = fs.readFileSync(p, "utf8");
  return JSON.parse(s.slice(s.indexOf("[")));
};

const classes = parse("/tmp/orm04-class-areas.json"); // [{a1,a2,classes}]
const fns = parse("/tmp/orm04-fn-areas.json"); // [{a1,a2,fns}]

const key = (r) => r.a1 + (r.a2 ? "/" + r.a2 : "");
const clsMap = new Map(classes.map((r) => [key(r), r.classes]));
const fnMap = new Map(fns.map((r) => [key(r), r.fns]));
const keys = [...new Set([...clsMap.keys(), ...fnMap.keys()])].sort();

// --- curated WO-coverage map -------------------------------------------------
// wo_crate ∈ wo-renderer|wo-renderer-wasm|wo-fonts|wo-spell|wo-raster|wo-common|wo-ooxml|NONE
// gap_severity: 0=covered | 1=partial | 2=missing | 3=engine-critical-missing
const SPEC = {
  // ---------- agg-2.4 (Anti-Grain Geometry — OO's actual rasterizer) ----------
  "agg-2.4/include": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 3,
    "Agg core API: rasterizer_cells_aa + scanline AA, conv_stroke/conv_curve/vcgen_dash, span gradients, image resampling filters, pixfmt variants, blur. WO Canvas implements only a basic scanline filler/stroker with fixed 1-pass AA — no stroke join/dash generators, no image filters, no compound rasterizer."],
  "agg-2.4/src": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2,
    "Agg platform sources (pixel-format impls, font engine glue); mostly compiled-in implementation detail."],
  "agg-2.4/svg": ["NONE", "NONE", 3,
    "Agg SVG parser + renderer (agg_svg parser, path/adapters, gradients). WO has NO SVG rendering anywhere in the crates — SVG images and drawn shapes render blank."],
  "agg-2.4/gpc": ["NONE", "NONE", 3,
    "gpc.c general polygon clipper (union/intersect/difference/xor) behind Agg conv_gpc. WO has zero boolean path ops — shape merge/subtract editing cannot be reproduced."],
  "agg-2.4/examples": ["NONE", "NONE", 0,
    "Agg sample/demo programs; not linked into the OO engine — out of port scope."],
  "agg-2.4/font_freetype": ["wo-fonts", "core/crates/wo-fonts/src/cache.rs", 1,
    "Agg FreeType font-engine adapter + font_cache_manager (glyph raster cache keyed by glyph/size/transform). wo-fonts caches faces and metrics but has no glyph-raster cache."],
  "agg-2.4/font_win32_tt": ["NONE", "NONE", 0,
    "Win32 GDI font adapter; irrelevant on WO targets (web/server Linux)."],

  // ---------- raster (image + metafile engine) ----------
  "raster/Jp2": ["NONE", "NONE", 3,
    "OpenJPEG-based JPEG2000 codec (762 classes: tiles, MCT, wavelets, JP2 boxes). The `image` crate features (png/jpeg/tiff/gif/bmp) have no JP2 — embedded JP2 imagery renders as placeholders."],
  "raster/Metafile": ["NONE", "NONE", 3,
    "EMF/WMF/EMF+ parsers + CEmfInterpretator{Render,Svg,Xml} players + EMF+ object model (pens/brushes/paths/images). WO has no metafile support at all — vector clip-art and pasted Office drawings disappear."],
  "raster/JBig2": ["NONE", "NONE", 2,
    "JBIG2 arithmetic decoder + symbol/text-region decode (1466 fns). No WO counterpart; scanned imagery using JBIG2 fails to decode."],
  "raster/heif": ["NONE", "NONE", 2, "HEIF/AVIF container probe; no WO support."],
  "raster/PICT": ["NONE", "NONE", 2, "Mac PICT metafile reader; no WO support."],
  "raster/BgraFrame.h": ["wo-raster", "core/crates/wo-raster/src/model.rs", 0,
    "BGRA frame buffer (w*h*4, flip, blit); RasterImage::from_rgba_bytes/as_rgba_bytes is the same shape."],
  "raster/BgraFrame.cpp": ["wo-raster", "core/crates/wo-raster/src/model.rs", 0,
    "BGRA frame implementation; covered by RasterImage pixel model."],
  "raster/ImageFileFormatChecker.h": ["wo-raster", "core/crates/wo-raster/src/model.rs", 1,
    "Format-checker chain over many signatures; ImageFormat::from_magic covers common magics only."],
  "raster/ImageFileFormatChecker.cpp": ["wo-raster", "core/crates/wo-raster/src/model.rs", 1,
    "Format-checker dispatch; WO from_magic + image-crate guessing is a subset."],

  // ---------- graphics (AggPlus canvas — the OO graphics facade) ----------
  "graphics/commands": ["NONE", "NONE", 3,
    "IMetafileToRenderter + command records replaying metafiles into IRenderer. Depends on the missing raster/Metafile parsers; no WO counterpart."],
  "graphics/Image.h": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 3,
    "Canvas image blitting under transforms with alpha. WO Canvas has NO draw_image — wo-renderer-wasm/src/layout.rs literally skips DocxBlock::Image with a 'placeholder for DM-7' comment. Every picture in a document is unrendered."],
  "graphics/Image.cpp": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 3,
    "Image drawing implementation (DrawImage/stretch/alpha); missing on WO Canvas as above."],
  "graphics/BooleanOperations.cpp": ["NONE", "NONE", 3,
    "Shape boolean engine (union/subtract/intersect over paths used by OO drawing tools). WO has none; boolean shape editing cannot be reproduced."],
  "graphics/boolean_operations_math.h": ["NONE", "NONE", 3,
    "Math kernel for graphics/BooleanOperations (segment intersection/point classification). Missing with the engine above."],
  "graphics/MetafileToGraphicsRenderer.cpp": ["NONE", "NONE", 3,
    "Replays EMF/WMF records into AggPlus Graphics calls; blocked by missing metafile parsers."],
  "graphics/MetafileToGraphicsRenderer.h": ["NONE", "NONE", 3,
    "Metafile→Graphics replay interface; no WO counterpart."],
  "graphics/MetafileToRenderer.cpp": ["NONE", "NONE", 3,
    "Replays metafiles into IRenderer vector commands; no WO counterpart."],
  "graphics/MetafileToRenderer.h": ["NONE", "NONE", 3,
    "Metafile replay driver; no WO counterpart."],
  "graphics/MetafileToRendererReader.h": ["NONE", "NONE", 3,
    "Metafile reader interface (EMF/WMF/SVG readers); no WO counterpart."],
  "graphics/MetafileToRendererCheck.h": ["NONE", "NONE", 2,
    "Metafile-replay sanity checks; depends on the missing metafile stack."],
  "graphics/GraphicsRenderer.cpp": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2,
    "AggPlus Graphics state machine: pen/brush servers, clip save/restore, DrawString via string formatter. WO Canvas covers solid/gradient paint, clip path, transformed text — no pen dashboards, hatch/texture brushes, or image blitting."],
  "graphics/GraphicsRenderer.h": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2,
    "GraphicsRenderer class surface; see GraphicsRenderer.cpp note."],
  "graphics/Graphics.cpp": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2,
    "AggPlus Graphics methods; WO Canvas overlaps partially (fills/strokes/text/clip)."],
  "graphics/Graphics.h": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2,
    "Graphics class surface; see Graphics.cpp note."],
  "graphics/AlphaMask.h": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2,
    "8-bit alpha-mask layers composited over the rendering buffer; WO has global alpha + BlendMode only."],
  "graphics/AlphaMask_p.h": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2,
    "Alpha-mask internals; missing with the mask-layer feature."],
  "graphics/AlphaMask.cpp": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2,
    "Alpha-mask implementation; missing on WO."],
  "graphics/Clip.cpp": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 1,
    "Nested clip stack with intersect; WO Canvas::clip() keeps a single current clip path (save/restore snapshot only)."],
  "graphics/Clip.h": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 1,
    "Clip-stack classes; see Clip.cpp note."],
  "graphics/Matrix.cpp": ["wo-renderer", "core/crates/wo-renderer/src/transform.rs", 0,
    "Affine matrix ops; AffineTransform covers multiply/invert/rotate/transform-point."],
  "graphics/Matrix.h": ["wo-renderer", "core/crates/wo-renderer/src/transform.rs", 0, "Affine matrix API; covered by transform.rs."],
  "graphics/Matrix_private.h": ["wo-renderer", "core/crates/wo-renderer/src/transform.rs", 0, "Matrix internals; covered."],
  "graphics/Color.h": ["wo-renderer", "core/crates/wo-renderer/src/color.rs", 0, "RGBA color model; Color/Paint covers."],
  "graphics/Brush.cpp": ["wo-renderer", "core/crates/wo-renderer/src/gradient.rs", 1,
    "Brush family: solid, hatch, texture, linear/radial gradient. WO Paint covers solid + linear/radial gradient; hatch and texture fills absent."],
  "graphics/Brush.h": ["wo-renderer", "core/crates/wo-renderer/src/gradient.rs", 1, "Brush classes; see Brush.cpp note."],
  "graphics/GraphicsPath.cpp": ["wo-renderer", "core/crates/wo-renderer/src/path.rs", 1,
    "Path storage + flattening + winding ops; PathBuilder has curves/rect/ellipse/fill-rule but no flatten/dash/offset transforms."],
  "graphics/GraphicsPath.h": ["wo-renderer", "core/crates/wo-renderer/src/path.rs", 1, "GraphicsPath surface; see GraphicsPath.cpp note."],
  "graphics/GraphicsPath_private.h": ["wo-renderer", "core/crates/wo-renderer/src/path.rs", 1, "Path internals; see GraphicsPath.cpp note."],
  "graphics/IRenderer.h": ["wo-renderer", "core/crates/wo-renderer/src/lib.rs", 1,
    "Vector renderer interface (pages, commands); WO renders through the concrete Canvas with no trait split."],
  "graphics/shading_info.h": ["wo-renderer", "core/crates/wo-renderer/src/gradient.rs", 2,
    "Gradient shading descriptors incl. Coons/tensor patches and focal/conical variants; WO gradient.rs is Linear+Radial only."],
  "graphics/aggplustypes.h": ["wo-renderer", "core/crates/wo-renderer/src/model.rs", 1,
    "AggPlus enums (DashStyle, LineJoin, WrapMode, PenAlignment...); scattered across WO structs without full parity."],
  "graphics/structures.h": ["wo-renderer", "core/crates/wo-renderer/src/model.rs", 1, "AggPlus basic structs; partially mirrored in model.rs."],
  "graphics/ArrowHead.cpp": ["NONE", "NONE", 2, "Arrow-cap geometry for line ends; missing on WO strokes."],
  "graphics/ArrowHead.h": ["NONE", "NONE", 2, "Arrow-head types; missing on WO."],
  "graphics/ImageFilesCache.h": ["wo-raster", "core/crates/wo-raster/src/decoder.rs", 2,
    "id→decoded-frame cache for renderer reuse; WO re-decodes per paint (no cache)."],
  "graphics/BaseThread.cpp": ["NONE", "NONE", 2, "Render worker thread + job monitor; WO render path is single-threaded."],
  "graphics/BaseThread.h": ["NONE", "NONE", 2, "Render thread class; see BaseThread.cpp note."],
  "graphics/BaseThreadMonitor.h": ["NONE", "NONE", 2, "Thread job monitor; see BaseThread.cpp note."],
  "graphics/GraphicsLayer.cpp": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2,
    "Offscreen layer surfaces with blend groups; WO has a BlendMode enum but no layer surfaces."],
  "graphics/GraphicsLayer.h": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2, "Layer class surface; see GraphicsLayer.cpp note."],
  "graphics/GraphicsLayerBlend.h": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2, "Layer blend modes; partial via BlendMode."],
  "graphics/TemporaryCS.cpp": ["wo-renderer", "core/crates/wo-renderer/src/lib.rs", 0,
    "Critical-section RAII helper; Rust ownership/Mutex makes it moot."],
  "graphics/TemporaryCS.h": ["wo-renderer", "core/crates/wo-renderer/src/lib.rs", 0, "CS helper; moot in Rust."],
  "graphics/Timer.cpp": ["NONE", "NONE", 0, "UI animation timer; not part of the server render path."],
  "graphics/Timer.h": ["NONE", "NONE", 0, "UI timer; out of server-render scope."],
  "graphics/tests": ["wo-renderer", "core/crates/wo-renderer/tests", 0,
    "OO graphics unit tests; WO keeps equivalent tests in wo-renderer/tests and crate test modules."],
  "graphics/pro": ["wo-renderer-wasm", "core/crates/wo-renderer-wasm/src/canvas_bridge.rs", 2,
    "Pro-build internals: CMetaFile, CDIB, CApplicationFontsSymbols, CFontManagerWrapper, HTML-renderer text, JBIG2 contexts; canvas_bridge's bundled Liberation fonts cover only the font-symbol slice."],

  // ---------- fontengine ----------
  "fontengine/ApplicationFonts.h": ["wo-fonts", "core/crates/wo-fonts/src/cache.rs", 1,
    "CApplicationFonts/CFontList/CFontSelectFormat — family enumeration and best-match selection; FontCache+FontMatcher covers family/weight matching, lacks the fallback/symbol-coverage chain."],
  "fontengine/ApplicationFonts.cpp": ["wo-fonts", "core/crates/wo-fonts/src/cache.rs", 1, "See ApplicationFonts.h note."],
  "fontengine/ApplicationFontsWorker.h": ["wo-fonts", "core/crates/wo-fonts/src/loader.rs", 2,
    "Font-dir scanning, priorities (CFontPriority), thumbnails (CFontThumbnail), symbol coverage checkers; wo-fonts loads explicit byte blobs only — no system scan or cache warming."],
  "fontengine/ApplicationFontsWorker.cpp": ["wo-fonts", "core/crates/wo-fonts/src/loader.rs", 2, "See ApplicationFontsWorker.h note."],
  "fontengine/FontFile.h": ["wo-fonts", "core/crates/wo-fonts/src/loader.rs", 2,
    "CFontFile wraps a FreeType face: glyph metrics/raster/hinting via CVectorWorker + CCacheGlyphs. wo-fonts exposes ttf-parser metrics only — no glyph bitmap cache, no hinting."],
  "fontengine/FontFile.cpp": ["wo-fonts", "core/crates/wo-fonts/src/loader.rs", 2, "See FontFile.h note."],
  "fontengine/FontManager.h": ["wo-fonts", "core/crates/wo-fonts/src/cache.rs", 2,
    "CFontManager + CFontsCache + CApplicationFontStreams — cross-document LRU glyph cache and font-stream registry; WO caches faces but no glyphs."],
  "fontengine/FontManager.cpp": ["wo-fonts", "core/crates/wo-fonts/src/cache.rs", 2, "See FontManager.h note."],
  "fontengine/GlyphString.h": ["wo-renderer", "core/crates/wo-renderer/src/text.rs", 3,
    "CGlyphString: shaped, measured string (kerned/ligated glyph array, tab runs, Y positions). WO TextLayoutEngine measures with char_advance — no kerning, ligatures, or bidi — so line breaks and glyph positions diverge on complex text."],
  "fontengine/GlyphString.cpp": ["wo-renderer", "core/crates/wo-renderer/src/text.rs", 3, "See GlyphString.h note."],
  "fontengine/TextShaper.h": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 1,
    "HarfBuzz shaping interface. WO uses rustybuzz (an HB port) + swash inside Canvas::draw_text — but shaping is NOT wired into TextLayoutEngine or the wasm layout path."],
  "fontengine/TextShaper.cpp": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 1, "See TextShaper.h note."],
  "fontengine/TextShaper_p.h": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 1, "Shaper internals; see TextShaper.h note."],
  "fontengine/TextHyphen.h": ["wo-spell", "core/crates/wo-spell/src/hyphenate.rs", 0,
    "Hyphenation engine; wo-spell hyphenate.rs (Liang's algorithm) + spell_hyphenate wasm export cover it."],
  "fontengine/TextHyphen.cpp": ["wo-spell", "core/crates/wo-spell/src/hyphenate.rs", 0, "Hyphenation impl; covered by wo-spell."],
  "fontengine/FontPath.h": ["NONE", "NONE", 2,
    "CFontPath: glyph-outline→bezier-path cache; WO has no outline extraction to PathBuilder."],
  "fontengine/FontPath.cpp": ["NONE", "NONE", 2, "Outline-path cache impl; missing on WO."],
  "fontengine/fontconverter": ["NONE", "NONE", 2,
    "Font conversion utilities (woff/eot, AllFontsGen machinery, 216 fns); not ported."],
  "fontengine/js": ["NONE", "NONE", 2,
    "allfonts JS bridge (CFontBinary, font-list JSON); WO ships a fixed Liberation set via canvas_bridge::LIBERATION_FONTS."],
  "fontengine/FontsAssistant.h": ["NONE", "NONE", 2, "Font assistant dialog engine; unported."],
  "fontengine/MemoryStream.h": ["wo-common", "core/crates/wo-common/src/lib.rs", 1,
    "CMemoryStream; Vec<u8>/std::io::Cursor idioms replace it."],
  "fontengine/fontdictionaryworker.h": ["NONE", "NONE", 2, "Font dictionary worker; unported."],

  // ---------- freetype / freetype_names ----------
  "freetype-2.10.4/src": ["wo-fonts", "core/crates/wo-fonts/src/loader.rs", 1,
    "FreeType engines (truetype/cff/type1/pcf/bdf + bytecode hinting interpreter). ttf-parser parses and measures but executes NO bytecode hinting; subtle rasterization differences vs OO remain."],
  "freetype-2.10.4/builds": ["NONE", "NONE", 0, "Build scaffolding for FT; irrelevant to a Rust port."],
  "freetype-2.10.4/include": ["wo-fonts", "core/crates/wo-fonts/src/model.rs", 0, "Public FT headers; API replaced by ttf-parser/swash types."],
  "freetype-2.10.4/docs": ["NONE", "NONE", 0, "FT documentation and sample modules; not runtime code for parity."],
  "freetype_names/freetype-2.5.3": ["NONE", "NONE", 0,
    "Second FT copy used at build time to mine font names; not linked into the runtime engine."],
  "freetype_names/FontMaps": ["wo-fonts", "core/crates/wo-fonts/src/cache.rs", 1,
    "Generated family-name maps (ASC*FontMaps); WO relies on fontdb matching without the curated name tables."],

  // ---------- xml ----------
  "xml/libxml2": ["wo-ooxml", "core/crates/wo-ooxml/src/parser.rs", 2,
    "Full libxml2 (401 classes: SAX/DOM, XPath, XInclude, HTML parser, xmlIO, catalogs/DTD). WO uses roxmltree read-only DOM — no XPath, no streaming writer, no catalog/DTD resolution; conversion fidelity depends on hand-rolled traversal."],
  "xml/src": ["wo-ooxml", "core/crates/wo-ooxml/src/parser.rs", 1,
    "OO XML utility wrappers over libxml2 (186 fns); wo-ooxml hand-rolls equivalent traversal."],
  "xml/include": ["wo-ooxml", "core/crates/wo-ooxml/src/parser.rs", 1, "OO XML util headers; see xml/src note."],

  // ---------- xmlsec ----------
  "xmlsec/src": ["NONE", "NONE", 2,
    "xmlsec1: XML digital signatures (c14n, RSA/ECDSA, XAdES fragments, 2227 fns). WO NONE — signed documents lose signatures on round-trip."],
  "xmlsec/test": ["NONE", "NONE", 0, "xmlsec test suites; out of renderer scope."],

  // ---------- cximage ----------
  "cximage/CxImage": ["wo-raster", "core/crates/wo-raster/src/model.rs", 2,
    "CxImage core (35 classes/692 fns): crop/rotate/alpha-channel/selection ops; wo-raster has pixel access + decode + encode only."],
  "cximage/jpeg": ["wo-raster", "core/crates/wo-raster/src/decoder.rs", 0, "Baseline JPEG decode/encode covered by the `image` crate jpeg feature."],
  "cximage/png": ["wo-raster", "core/crates/wo-raster/src/decoder.rs", 0, "PNG decode/encode covered by the `image` crate png feature."],
  "cximage/tiff": ["wo-raster", "core/crates/wo-raster/src/decoder.rs", 1,
    "TIFF via `image` covers a subset — no multi-page, no CCITT G3/G4 fax decode."],
  "cximage/zlib": ["wo-raster", "core/crates/wo-raster/src/lib.rs", 0, "Inflate/deflate provided transitively by image/flate2 crates."],
  "cximage/raw": ["NONE", "NONE", 2, "Camera-RAW formats (73 classes); no WO support."],
  "cximage/jbig": ["NONE", "NONE", 2, "JBIG decoding; no WO support."],
  "cximage/mng": ["NONE", "NONE", 2, "MNG/JNG formats (866 fns); no WO support."],
  "cximage/jasper": ["NONE", "NONE", 3,
    "Jasper JPEG2000 codec (608 fns) — OO's second JP2 path; same blocker as raster/Jp2."],
  "cximage/libpsd": ["NONE", "NONE", 2, "Photoshop PSD reader (383 fns); no WO support."],

  // ---------- doctrenderer ----------
  "doctrenderer/js_internal": ["NONE", "NONE", 3,
    "V8/JavaScriptCore embedding layer (CJSContext, CJSObjectV8/JSC, CV8Worker, inspector, WebSocketServer). WO has NO server-side JS host — docbuilder formulas and macro scripts cannot execute inside wo-x2t; in-browser WO leans on the JS runtime, server-side conversion does not."],
  "doctrenderer/embed": ["NONE", "NONE", 2,
    "C++ classes exposed into the JS builder scope; WO's browser JS host could consume wasm exports instead — design pending."],
  "doctrenderer/json": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "OO JSON wrappers; serde_json covers the shapes."],
  "doctrenderer/docbuilder.h": ["NONE", "NONE", 2,
    "DocBuilder API (open/create/execute/close); WO's conversion pipeline is a fixed route without a scriptable builder."],
  "doctrenderer/docbuilder_p.h": ["NONE", "NONE", 2, "DocBuilder internals; see docbuilder.h note."],
  "doctrenderer/docbuilder_p.cpp": ["NONE", "NONE", 2, "DocBuilder internals; see docbuilder.h note."],
  "doctrenderer/docbuilder.cpp": ["NONE", "NONE", 2, "DocBuilder entry; see docbuilder.h note."],
  "doctrenderer/docbuilder.java": ["NONE", "NONE", 0, "Java builder bindings; external-language glue, out of renderer scope."],
  "doctrenderer/docbuilder.python": ["NONE", "NONE", 0, "Python builder bindings; external-language glue, out of scope."],
  "doctrenderer/docbuilder.com": ["NONE", "NONE", 0, "COM builder bindings; external-language glue, out of scope."],
  "doctrenderer/docbuilder.net": ["NONE", "NONE", 0, ".NET builder bindings; external-language glue, out of scope."],
  "doctrenderer/nativecontrol.h": ["NONE", "NONE", 2, "Native control host for builder rendering; unported."],
  "doctrenderer/nativecontrol.cpp": ["NONE", "NONE", 2, "Native control impl; unported."],
  "doctrenderer/graphics.h": ["wo-renderer-wasm", "core/crates/wo-renderer-wasm/src/lib.rs", 2,
    "Builder drawing bridge over IRenderer; wasm crate renders through canvas handles, not this API."],
  "doctrenderer/graphics.cpp": ["wo-renderer-wasm", "core/crates/wo-renderer-wasm/src/lib.rs", 2, "Builder drawing bridge impl; see graphics.h note."],
  "doctrenderer/doctrenderer.h": ["NONE", "NONE", 2, "JS-in-C++ document renderer core; unported."],
  "doctrenderer/doctrenderer.cpp": ["NONE", "NONE", 2, "Document renderer core impl; unported."],
  "doctrenderer/editors.cpp": ["NONE", "NONE", 2, "Editor-class registrations for builder; unported."],
  "doctrenderer/test": ["NONE", "NONE", 0, "doctrenderer test scaffolding; out of renderer scope."],
  "doctrenderer/config.h": ["wo-common", "core/crates/wo-common/src/format.rs", 1, "Builder config flags; partial analog in format registry."],
  "doctrenderer/drawingfile.h": ["NONE", "NONE", 2, "Drawing-file abstraction for builder; unported."],
  "doctrenderer/hash.h": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "String hash helpers; std hash covers."],
  "doctrenderer/server.h": ["NONE", "NONE", 2, "Builder server harness; unported."],
  "doctrenderer/addon": ["NONE", "NONE", 2, "Node addon wrapper; superseded by wasm exports in wo-renderer-wasm."],
  "doctrenderer/app_builder": ["NONE", "NONE", 2, "Builder app entry; unported."],
  "doctrenderer/app_builder_lib": ["NONE", "NONE", 2, "Builder app lib; unported."],

  // ---------- common ----------
  "common/StringBuilder.h": ["wo-common", "core/crates/wo-common/src/lib.rs", 0, "Byte/String builder; Rust String + format! + Vec<u8> replace."],
  "common/StringBuilder.cpp": ["wo-common", "core/crates/wo-common/src/lib.rs", 0, "Builder impl; covered by Rust idioms."],
  "common/StringExt.h": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "CStringExt helpers (split/join/format); std covers most, OO sprintf-style helpers spread across WO crates."],
  "common/StringExt.cpp": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "See StringExt.h note."],
  "common/MathUtils.h": ["wo-common", "core/crates/wo-common/src/units.rs", 1,
    "Fast trig/rounding/matrix utils (53 fns); WO units.rs covers unit conversion, transform.rs affine math — the fixed-point/deltize helpers are unported."],
  "common/File.h": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "Cross-platform file IO; std::fs covers."],
  "common/File.cpp": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "File IO impl; std::fs covers."],
  "common/Directory.cpp": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "Directory walking; std::fs::read_dir covers."],
  "common/Path.cpp": ["wo-common", "core/crates/wo-common/src/path.rs", 1,
    "FS path joins; std::path covers. (wo-common path.rs is doc-tree addressing, not FS.)"],
  "common/ProcessEnv.cpp": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "Process/env helpers; std::env covers."],
  "common/SystemUtils.cpp": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "System utilities; std + crates cover."],
  "common/Base64.cpp": ["NONE", "NONE", 2, "Base64 codec; absent from wo-common encoding.rs — small module to add."],
  "common/CalculatorCRC32.h": ["NONE", "NONE", 2, "CRC32 table calculator; needed by metafile/zip paths — unported."],
  "common/BigInteger.h": ["NONE", "NONE", 2, "Arbitrary-precision integer math (14 fns); none in WO crates."],
  "common/ByteBuilder.h": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "LE/BE byte writer; per-crate Vec<u8> writers in WO."],
  "common/ByteBuilder.cpp": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "Byte writer impl; see ByteBuilder.h note."],
  "common/StringUTF32.h": ["wo-common", "core/crates/wo-common/src/lib.rs", 0, "UTF-32 string class; Rust String (UTF-8) + char iteration replaces."],
  "common/StringUTF32.cpp": ["wo-common", "core/crates/wo-common/src/lib.rs", 0, "UTF-32 impl; replaced by Rust strings."],
  "common/StreamWriter.h": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "Stream writer; std::io::Write trait replaces."],
  "common/StreamWriter.cpp": ["wo-common", "core/crates/wo-common/src/lib.rs", 1, "Stream writer impl; std::io covers."],
  "common/IGrObject.h": ["wo-common", "core/crates/wo-common/src/lib.rs", 0, "Intrusive refcount interface; Arc/Rc replaces."],
  "common/ShapeAspects.h": ["NONE", "NONE", 2, "Shape-aspect geometry helpers; unported."],
  "common/ASCVariant.h": ["wo-common", "core/crates/wo-common/src/lib.rs", 0, "Variant type; serde_json::Value replaces."],
  "common/Mac": ["NONE", "NONE", 0, "Mac-only shim; out of WO target scope."],

  // ---------- misc ----------
  "pluginsmanager/main.cpp": ["NONE", "NONE", 2,
    "Plugin install/manifest handling (49 fns); WO NONE — plugin ecosystem unported."],
  "pluginsmanager/help.h": ["NONE", "NONE", 2, "Plugin manager helpers; unported."],
  "vboxtester/main.cpp": ["NONE", "NONE", 0,
    "VirtualBox test-automation tool; not part of the editor engine — out of port scope."],
  "allthemesgen/main.cpp": ["NONE", "NONE", 2,
    "Theme-thumbnail generator tool; replicate as a build-time task if theme previews are needed."],
  "AllFontsGen/main.cpp": ["NONE", "NONE", 2,
    "Font-list generator tool; WO ships a fixed Liberation set (canvas_bridge::LIBERATION_FONTS) instead."],
};

// defaults per top-level area (for keys without a SPEC entry)
const DEFAULTS = {
  "agg-2.4": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2,
    "Agg subsystem; WO Canvas implements a small scanline subset of Agg's rasterization pipeline."],
  "raster": ["wo-raster", "core/crates/wo-raster/src/decoder.rs", 2,
    "Raster engine area; WO wo-raster covers common formats via the `image` crate."],
  "cximage": ["wo-raster", "core/crates/wo-raster/src/decoder.rs", 2,
    "CxImage format codec family; WO relies on the `image` crate (png/jpeg/tiff/gif/bmp)."],
  "xml": ["wo-ooxml", "core/crates/wo-ooxml/src/parser.rs", 2,
    "XML stack; WO uses roxmltree (read-only DOM) — no XPath/XSLT/streaming writer."],
  "doctrenderer": ["NONE", "NONE", 2,
    "JS-builder/preview engine; no server-side JS host exists in WO."],
  "graphics": ["wo-renderer", "core/crates/wo-renderer/src/canvas.rs", 2,
    "AggPlus graphics area; WO Canvas covers fills/strokes/transforms/text/clip, diverging on the specifics noted per-row."],
  "freetype-2.10.4": ["wo-fonts", "core/crates/wo-fonts/src/loader.rs", 1,
    "FreeType engine area; ttf-parser covers parsing/metrics, not hinting."],
  "freetype_names": ["wo-fonts", "core/crates/wo-fonts/src/cache.rs", 1,
    "Font-name mining area; WO uses fontdb matching."],
  "fontengine": ["wo-fonts", "core/crates/wo-fonts/src/loader.rs", 2,
    "Font engine area; wo-fonts is a face/metrics loader without the glyph cache/hinting pipeline."],
  "xmlsec": ["NONE", "NONE", 2, "Security stack; no WO counterpart."],
  "common": ["wo-common", "core/crates/wo-common/src/lib.rs", 1,
    "Platform utility area; mostly replaced by Rust std idioms, gaps noted per-row."],
  "pluginsmanager": ["NONE", "NONE", 2, "Plugin ecosystem; unported."],
  "vboxtester": ["NONE", "NONE", 0, "Test-automation tool; out of port scope."],
  "allthemesgen": ["NONE", "NONE", 2, "Theme generation tool; unported."],
  "AllFontsGen": ["NONE", "NONE", 2, "Font-list generation tool; unported."],
};

const entries = [];
for (const k of keys) {
  const a1 = k.split("/")[0];
  const spec = SPEC[k] || DEFAULTS[a1];
  if (!spec) {
    console.error("NO SPEC for", k);
    continue;
  }
  entries.push({
    oo_area: k,
    oo_class_estimate: clsMap.get(k) || 0,
    oo_fn_estimate: fnMap.get(k) || 0,
    wo_crate: spec[0],
    wo_file: spec[1],
    gap_severity: spec[2],
    notes: spec[3] + ` (source: DesktopEditor/${k})`,
  });
}

// sort: by top-level family then name
entries.sort((a, b) => {
  const A = a.oo_area.split("/")[0], B = b.oo_area.split("/")[0];
  return A === B ? a.oo_area.localeCompare(b.oo_area) : A.localeCompare(B);
});

fs.writeFileSync("plan/oo-port/engine-internals.json", JSON.stringify(entries, null, 1) + "\n");

// stats
const sev = [0, 0, 0, 0];
for (const e of entries) sev[e.gap_severity]++;
const fams = {};
for (const e of entries) {
  const f = e.oo_area.split("/")[0];
  fams[f] = fams[f] || { n: 0, cls: 0, fn: 0, s3: 0 };
  fams[f].n++;
  fams[f].cls += e.oo_class_estimate;
  fams[f].fn += e.oo_fn_estimate;
  if (e.gap_severity === 3) fams[f].s3++;
}
console.log("entries:", entries.length, "severity 0/1/2/3:", sev.join("/"));
for (const [f, v] of Object.entries(fams)) {
  console.log(`${f}: rows=${v.n} classes=${v.cls} fns=${v.fn} sev3=${v.s3}`);
}
console.log("--- severity-3 rows:");
for (const e of entries.filter((x) => x.gap_severity === 3)) console.log("  ", e.oo_area, "->", e.wo_crate);
