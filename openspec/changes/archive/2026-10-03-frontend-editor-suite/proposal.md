## Why

World Office has a functional document editor with TipTap, collaboration, spellchecker, and WOPI — but the spreadsheet toolbar is mostly disabled (only clipboard + find work), and presentation/PDF/Visio editors are shells. The ONLYOFFICE/EuroOffice reference (cloned at `/tmp/onlyoffice-webapps/`) defines the target feature set: full ribbon toolbars, plugin architecture, 46-language i18n, and 5 editors with complete formatting capabilities. This change closes the gap between current state and that target.

## What Changes

- **Spreadsheet editor**: Wire all toolbar buttons to Univer API (font/alignment/number formatting, cell styles, conditional formatting, insert/delete cells, auto-sum, sort, filter, merge & center, wrap text). Add formula bar, chart support, pivot tables, data validation, sheet tabs.
- **Document editor**: Complete missing toolbar features — highlight color, line spacing, multilevel lists, paragraph borders, styles dropdown with full style gallery, page numbers, header/footer editing, comments panel, track changes (review mode), footnotes/endnotes, table of contents, content controls.
- **Presentation editor**: Build slide management (add/delete/duplicate/reorder), slide layouts, master slides, animation pane, transitions, speaker notes, shape/text formatting toolbar.
- **PDF editor**: Build annotation layer (comments, highlights, shapes), form filling (text fields, checkboxes, signatures), redaction tools, page manipulation (rotate/delete/insert/reorder).
- **Visio editor**: Basic shape/stencil support, connector routing, page management.
- **Shared component library** (`@world-office/editor-common`): Extract reusable ribbon primitives — ColorPicker, DropdownMenu, ContextMenu, FlyoutPanel, ComboBox, SpinBox, Tooltip, Separator — replacing per-editor button soup with a declarative ribbon spec system.
- **Plugin architecture**: Define plugin API (toolbar injection, menu items, panel registration, custom dialogs), plugin loader, plugin marketplace stub.
- **Legacy cleanup**: Migrate remaining Backbone.js code in `apps/common/` to React or remove if unused.

## Capabilities

### New Capabilities
- `ribbon-component-system`: Declarative ribbon toolbar component library — ColorPicker, DropdownMenu, FlyoutPanel, ComboBox, SpinBox, ContextMenu, Separator. Shared across all 5 editors via `@world-office/editor-common`.
- `spreadsheet-toolbar-wiring`: Connect all spreadsheet toolbar buttons to Univer API — formatting (font, alignment, number, borders, fill), cell operations (insert/delete), editing (auto-sum, sort, filter), formula bar, chart insertion.
- `document-toolbar-completion`: Missing document toolbar features — highlight color, line spacing, multilevel lists, paragraph borders, style gallery, comments panel, track changes, footnotes/endnotes, TOC.
- `presentation-slide-management`: Slide CRUD, layouts, master slides, animation pane, transitions, speaker notes, shape/text formatting.
- `pdf-annotation-and-forms`: Annotation layer (comments, highlights, shapes), form filling, redaction, page manipulation.
- `plugin-architecture`: Plugin API surface, loader, sandbox, marketplace stub.

### Modified Capabilities
<!-- No existing openspec specs to modify -->

## Impact

- **Packages affected**: `@world-office/editor-common` (ribbon primitives), `@world-office/editor-stores` (new stores for presentation/PDF), `@world-office/design-system` (new primitives if needed)
- **Editor apps**: All 5 React editors under `apps/web/apps/*-react/`
- **Legacy code**: `apps/web/apps/common/` (Backbone.js migration/removal)
- **Dependencies**: Univer API surface (spreadsheet), PDF.js or equivalent (PDF annotations), potential new charting library
- **Build**: No structural changes — existing Vite + Turbo pipeline
- **i18n**: New translation keys for all new UI strings across existing locale files in `apps/web/translation/`
