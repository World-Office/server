# Slides Editor MVP — Design Document

> **Status:** Design approved, ready for implementation planning
> **Sprint:** Begins 2026-06-04

## Overview

Build a working slides editor (presentation editor) for World-Office, capable of creating, editing, and exporting PowerPoint presentations (PPTX). Follows the same architecture pattern as the existing document editor: Rust core format crate (`wo-ooxml` extended) + React/MobX frontend (`presentationeditor-react`).

## MVP Scope

**In scope:**
- Slide manager — add, reorder, delete, duplicate slides with thumbnail previews
- Content editing — text boxes (title, subtitle, body), images on slides, drag/resize
- Text formatting — bold, italic, underline, font, size via toolbar
- PPTX export — generate valid PPTX from the editor model
- PPTX import — open existing PPTX files for editing
- Speaker notes per slide
- Basic slide layouts (title, title+content, blank)

**Out of scope (future sprints):**
- Shapes, charts, tables
- Animations & transitions
- Themes & master slides (beyond basic layout selection)
- Presenter view
- Realtime coauthoring
- Full OOXML schema coverage (V1 targets a useful subset)

## Architecture

### Data Flow

```
PPTX file → wo-ooxml parser (extended) → PptxPresentation → MobX PresentationStore
                                                                        ↓
PPTX file ← wo-ooxml serializer (extended) ← PptxPresentation ← (save)
                                                                        ↓
                                                              HTML/CSS Canvas Renderer
```

### Technology

| Layer | Technology | Location |
|-------|-----------|----------|
| Format crate | Rust (wo-ooxml extension) | `core/crates/wo-ooxml/` |
| Editor frontend | React + MobX + TypeScript | `apps/web/apps/presentationeditor-react/` |
| Canvas | HTML/CSS (absolutely positioned divs) | Built in React components |
| State management | MobX PresentationStore | Existing, extended |
| Build | pnpm + Turbo | Workspace-level |

## PPTX Data Model (wo-ooxml Extension)

### New Rust Types

```rust
pub struct PptxPresentation {
    pub slide_size: SlideSize,
    pub slides: Vec<Slide>,
    pub slide_layouts: Vec<SlideLayout>,
    pub theme: Option<PptxTheme>,
}

pub struct Slide {
    pub id: u32,
    pub name: String,
    pub layout_id: String,
    pub shapes: Vec<SlideShape>,
    pub notes: Option<String>,
    pub background: Option<SlideBackground>,
}

pub enum SlideShape {
    TextBox(TextBoxShape),
    Picture(PictureShape),
    Placeholder(PlaceholderShape),
}

pub struct TextBoxShape {
    pub id: String,
    pub bounds: Bounds,
    pub text_body: TextBody,
    pub formatting: Option<ShapeFormatting>,
}

pub struct PictureShape {
    pub id: String,
    pub bounds: Bounds,
    pub image_data: Vec<u8>,
    pub content_type: String,
}

pub struct Bounds {
    pub x: i64,   // EMU (1/914400 inch)
    pub y: i64,
    pub cx: i64,
    pub cy: i64,
}

pub struct TextBody {
    pub paragraphs: Vec<DocxParagraph>,  // Reuses existing wo-ooxml types
}

pub struct SlideSize {
    pub cx: i64,
    pub cy: i64,
}
```

### Reuses Existing Infrastructure

- **DocxParagraph / DocxRun** — text formatting (bold, italic, font, size, color)
- **Zip archive handling** — `zip` crate, already used by wo-ooxml
- **Content type detection** — PPTX format already detected
- **Relationship parsing** — `_rels/.rels` already handled
- **FormatRoundtrip trait** — from `wo-common`

### Parser Extensions

New parsing methods in `OoxmlParser`:
- `parse_pptx_presentation()` — reads `ppt/presentation.xml` for slide list, slide size
- `parse_slide()` — reads `ppt/slides/slideN.xml` for shapes
- `parse_slide_layout()` — reads `ppt/slideLayouts/layoutN.xml`
- `parse_theme()` — reads `ppt/theme/themeN.xml` (minimal)
- `parse_shape()` — dispatches to shape-type-specific parsers
- `extract_image()` — reads `ppt/media/imageN.png` from ZIP

### Serializer Extensions

New serialization methods in `OoxmlSerializer`:
- `serialize_pptx()` — creates complete PPTX ZIP
- `serialize_presentation_xml()` — writes `ppt/presentation.xml`
- `serialize_slide()` — writes `ppt/slides/slideN.xml`
- `serialize_shape()` — writes shape XML (p:sp, p:pic, p:ph)
- `serialize_notes()` — writes `ppt/notesSlides/notesSlideN.xml`
- `write_media()` — embeds images into `ppt/media/`

## Frontend Architecture

### Component Tree

```
App
├── Toolbar
│   ├── FileMenu — New, Open, Save As PPTX
│   ├── HomeToolbar — Text format (B/I/U, font, size), Insert Text Box, Insert Picture
│   └── (Insert, Design menus as placeholders for future)
├── MainArea
│   ├── SlideThumbnails (left panel, ~200px)
│   ├── SlideCanvas (center, WYSIWYG)
│   └── PropertiesPanel (right panel, ~250px)
└── StatusBar
    ├── Slide counter ("Slide 3 of 12")
    ├── Zoom control
    └── Layout indicator
```

### Key Frontend Files

| File | Status | Purpose |
|------|--------|---------|
| `types/slides.ts` | Existing | Full type system (slides, animations, transitions) |
| `stores/PresentationStore.ts` | Extend | Add shape CRUD, undo, PPTX bridge |
| `components/SlideThumbnails.tsx` | New | Slide list with drag reorder |
| `components/SlideCanvas.tsx` | New | Main editing canvas |
| `components/ShapeRenderer.tsx` | New | Renders shapes on HTML/CSS canvas |
| `components/PropertiesPanel.tsx` | New | Selected shape position/size/text props |
| `components/InsertMenu.tsx` | New | Text box / image insert |
| `components/Toolbar.tsx` | Modify | Add formatting actions |
| `App.tsx` | Modify | Wire new components |

### Canvas Rendering Strategy: HTML/CSS

Each shape is an absolutely positioned `<div>` inside the slide container:
- Position/size from `Bounds` (converted from EMU to CSS pixels: 1 EMU = 1/914400 inch, at 96 DPI: 1 px = 9525 EMU — conversion factor: px = EMU / 9525)
- Text editing via `contentEditable` divs
- Drag/resize via pointer events (onPointerDown/onPointerMove/onPointerUp)
- Image shapes via `<img>` tags with base64 data URLs
- Zoom via CSS `transform: scale()`

### JSON Temporary Format (SS1)

Before the PPTX backend is available, slides are saved as a JSON file containing `PptxPresentation` (serialized via serde). The existing `DocxParagraph`/`DocxRun` types already derive `Serialize`/`Deserialize`, so the temporary JSON format uses the same model that the PPTX backend will later consume. This ensures a seamless migration — the frontend code never changes its data model, only the load/save endpoints swap from file I/O to the wo-ooxml crate.

### Data Flow (Editing)

```
1. User drags shape → pointer events → PresentationStore.updateShapeBounds(id, newBounds)
2. User edits text → contentEditable onChange → PresentationStore.updateShapeText(id, newTextBody)
3. User clicks "Save" → PresentationStore.toPptxPresentation() → wo-ooxml serializer → download
4. User opens PPTX → wo-ooxml parser → PptxPresentation → PresentationStore.fromPptxPresentation()
```

## Implementation Plan (3 Sub-Sprints)

### Sub-Sprint 1: Slide Manager (~1 week)

Frontend-only. JSON-native for storage. Establishes the UI scaffolding.

**Deliverables:**
- Slide thumbnails panel — list, select, add, delete, duplicate slides
- Slide navigation — previous/next, jump to N of M
- Basic canvas — renders slide background, shows slide number
- JSON save/load — temporary storage format
- Left/right menu buttons integrated (follows documenteditor pattern)
- Tests: Component rendering, slide CRUD, keyboard navigation

**Files:**
- `components/SlideThumbnails.tsx` — new
- `components/SlideCanvas.tsx` — new (basic version, no shape editing yet)
- `stores/PresentationStore.ts` — extend with slide CRUD actions
- `types/slides.ts` — validate existing types, add missing fields
- `LeftMenu.tsx` — add slides button, wire thumbnails panel
- `styles/presentation.css` — new, following documenteditor CSS patterns

### Sub-Sprint 2: PPTX Backend (~1.5 weeks)

Pure Rust extension of wo-ooxml. Independently testable via `cargo test`.

**Deliverables:**
- PptxPresentation model structs
- PPTX serializer — create valid PPTX from model (minimal but spec-compliant)
- PPTX parser — read existing PPTX into model
- Roundtrip tests — parse → serialize → compare binary
- FormatRoundtrip trait implementation
- No frontend changes yet

**Files:**
- `core/crates/wo-ooxml/src/pptx_model.rs` — new (or add to model.rs)
- `core/crates/wo-ooxml/src/pptx_parser.rs` — new (or add to parser.rs)
- `core/crates/wo-ooxml/src/pptx_serializer.rs` — new (or add to serializer.rs)
- `core/crates/wo-ooxml/src/lib.rs` — extend exports
- `core/crates/wo-ooxml/Cargo.toml` — add image crate dependency

### Sub-Sprint 3: Content Editing (~1 week)

Wire frontend to real PPTX backend.

**Deliverables:**
- Shape CRUD — add text box, add picture, move/resize on canvas
- Text editing — contentEditable with toolbar formatting
- Image insertion — file picker → embed in PPTX
- Properties panel — selected shape position/size/text properties
- PPTX save/load — integrated with SS2 backend
- Save as download, Open via file picker
- Tests: Shape CRUD, drag/resize, PPTX roundtrip via frontend

**Files:**
- `components/ShapeRenderer.tsx` — new
- `components/PropertiesPanel.tsx` — new
- `components/InsertMenu.tsx` — new
- `stores/PresentationStore.ts` — extend with shape CRUD, PPTX load/save
- `SlideCanvas.tsx` — extend with shape editing, drag/resize handlers
- `Toolbar.tsx` — modify with format buttons, insert buttons

## Testing Strategy

### Rust Tests (SS2)
- `test_parse_pptx_minimal` — parse a minimal valid PPTX
- `test_serialize_pptx_empty` — serialize empty presentation
- `test_pptx_roundtrip` — parse → modify → serialize → re-parse, verify
- `test_slide_shapes` — verify shape types, bounds, text content
- `test_pptx_with_images` — roundtrip with embedded images

### Frontend Tests (SS1, SS3)
- `test_slide_crud` — add, select, delete, duplicate slides
- `test_slide_reorder` — drag reorder updates model
- `test_shape_crud` — add, select, move, resize, delete shapes
- `test_text_editing` — type text, format, verify model updates
- `test_pptx_import_export` — load PPTX, verify slide count, shapes

## ROADMAP Note

The full slides editor roadmap (animations, transitions, themes, presenter view, realtime coauthoring) is documented in `ROADMAP.md` under "Tier 3 (Future)". This MVP establishes the foundation that all those features build upon.
