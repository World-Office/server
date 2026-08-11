## Context

World Office is a document editing suite with 5 React editors (document, spreadsheet, presentation, PDF, Visio) under `server/apps/web/apps/*-react/`, coordinated by shared packages (`@world-office/editor-common`, `@world-office/editor-stores`, `@world-office/design-system`). The architecture mirrors ONLYOFFICE's editor-per-app model but uses React 19 + Vite 6 + MobX + TipTap (document) + Univer (spreadsheet) instead of Backbone.js + RequireJS.

**Current state:**
- **Document editor**: Functional. TipTap rich text editing with ~30 wired toolbar buttons (clipboard, font, paragraph, styles, table, find/replace, spellcheck). Toolbar tabs exist (File, Home, Insert, Layout, HeaderFooter, References, Forms, View) but many buttons are stub placeholders. Has collaboration, WOPI, spellchecker, Tauri bridge, i18n.
- **Spreadsheet editor**: Shell with tabs (File, Home, Insert, Layout, Formula, DataTable) but only clipboard and find/replace buttons work. All formatting buttons are `disabled`. Univer grid renders but has no formatting integration.
- **Presentation editor**: Shell exists but minimal functionality.
- **PDF editor**: Shell exists but minimal functionality.
- **Visio editor**: Shell exists but minimal functionality.
- **Legacy code**: `apps/web/apps/common/` contains 217 Backbone.js files from the ONLYOFFICE fork, still used for help resources and some shared utilities.

**Reference spec**: ONLYOFFICE web-apps at `/tmp/onlyoffice-webapps/` — Backbone.js MVC with 45 shared components, 52 shared views, 25 shared controllers, Grunt build. Full ribbon toolbars per editor with contextual tabs.

**Key packages:**
- `@world-office/editor-common` — Ribbon component with `RibbonContext`, `RibbonCommandDispatch`, `wordRibbonSpec`/`sheetRibbonSpec`. Currently a basic Ribbon shell.
- `@world-office/editor-stores` — MobX stores shared across editors.
- `@world-office/design-system` — Tokens, theme, primitive components.
- `@world-office/wo-renderer-wasm` — Canvas rendering for ODT/DOCX via WASM.
- `@world-office/wopi-client` — WOPI protocol client.
- `@world-office/spellchecker` — nspell-based spellchecker.
- `@world-office/collaboration-client/react` — Real-time collaboration.

## Goals / Non-Goals

**Goals:**
- Wire all spreadsheet toolbar buttons to the Univer API
- Complete document editor toolbar with missing features (highlight, line spacing, comments, track changes, footnotes, TOC)
- Build presentation editor with slide management, animation, transitions
- Build PDF editor with annotations, forms, page manipulation
- Extract shared ribbon primitives into `@world-office/editor-common`
- Define plugin API surface and loader
- Maintain existing functionality — no regressions

**Non-Goals:**
- Visio editor functional features (shell only for this change)
- Full plugin marketplace (stub only)
- Legacy Backbone.js migration (separate change)
- New external dependencies beyond what's already in the monorepo (except Univer chart/plugin APIs)
- Mobile-specific editor UI
- Real-time collaboration for new editors (document already has it; others get it in a follow-up)
- Macro/VBA support

## Decisions

### 1. Ribbon primitives in `@world-office/editor-common` (not a separate package)
**Decision**: Add ColorPicker, DropdownMenu, FlyoutPanel, ComboBox, SpinBox, ContextMenu to `@world-office/editor-common` alongside the existing Ribbon component.

**Rationale**: These components are tightly coupled to the Ribbon's layout and theming. A separate package adds overhead with no benefit since only editor apps consume them. The existing `Ribbon` component already lives in `editor-common`.

**Alternative considered**: Separate `@world-office/ribbon-ui` package. Rejected — premature abstraction for <10 components used exclusively by editors.

### 2. Spec-driven toolbar definitions
**Decision**: Each editor defines its ribbon as a declarative spec object (`wordRibbonSpec`, `sheetRibbonSpec`, `slideRibbonSpec`, `pdfRibbonSpec`) consumed by the shared `<Ribbon>` component. Specs define tabs, groups, and buttons with `type`, `command`, `disabled` predicate, and `active` predicate.

**Rationale**: The document editor already uses `wordRibbonSpec` and `sheetRibbonSpec` patterns. Extending this to all editors provides consistency and makes toolbar changes declarative. Matches ONLYOFFICE's approach of per-editor template definitions.

### 3. Univer API for spreadsheet formatting
**Decision**: Wire spreadsheet toolbar directly to Univer's public API for cell formatting, rather than building an abstraction layer.

**Rationale**: Univer already exposes a comprehensive API for cell operations (`setRangeValues`, `setStyle`, `setBorder`, etc.). Adding an abstraction layer would duplicate effort and lag behind Univer's API evolution.

**Alternative considered**: Abstract spreadsheet operations behind a `SpreadsheetEngine` interface. Rejected for now — YAGNI until we need to support a different grid engine.

### 4. TipTap extensions for document features
**Decision**: Implement highlight, line spacing, multilevel lists, paragraph borders, and content controls as TipTap extensions (or use existing community extensions) rather than custom DOM manipulation.

**Rationale**: TipTap is already the document editor's core. TipTap extensions are composable, testable, and integrate with undo/redo and collaboration out of the box.

**Alternative considered**: Direct ProseMirror plugins. Rejected — TipTap wraps ProseMirror with a cleaner API and we already use TipTap throughout.

### 5. Comments and track changes as TipTap + custom state
**Decision**: Comments use TipTap annotations (`@tiptap/extension-annotation` or custom marks). Track changes use a custom TipTap extension that records operations in a separate `TrackChangesStore` (MobX).

**Rationale**: Comments need to be anchored to text ranges and survive edits — TipTap annotations handle this. Track changes need to show insertions/deletions visually without modifying the base document content — a custom store with a rendering layer is the cleanest approach.

### 6. PDF rendering via `wo-renderer-wasm`
**Decision**: Use the existing `wo-renderer-wasm` package for PDF rendering. Add annotation/form layers as React overlays on top of the WASM canvas.

**Rationale**: `wo-renderer-wasm` already handles PDF rendering to canvas. Annotations and forms are UI concerns that belong in React, not the rendering engine.

**Alternative considered**: PDF.js. Rejected — we already have a working WASM renderer, and adding PDF.js would double our WASM payload.

### 7. Presentation editor uses canvas rendering
**Decision**: Render slides using `wo-renderer-wasm` for the canvas layer. Add React overlays for UI interactions (shape selection, text editing, drag-drop).

**Rationale**: Consistent with the PDF editor approach. The WASM renderer handles the heavy lifting (text layout, shapes, images); React handles the interactive layer.

### 8. Plugin system: JS module loading with API boundary
**Decision**: Plugins are ES modules loaded via dynamic `import()`. They receive a `PluginContext` object that exposes a restricted API. No iframe sandboxing for v1 — API boundary enforcement is sufficient.

**Rationale**: Iframe sandboxing adds complexity (postMessage serialization, no shared memory) without practical security benefit for open-source plugins. The API boundary prevents accidental internal access. If enterprise plugin isolation is needed later, we can add a Web Worker sandbox.

**Alternative considered**: Web Worker sandboxing. Rejected for v1 — too complex, limits DOM access needed by plugins.

### 9. Incremental editor rollout
**Decision**: Implement editors in priority order: spreadsheet (most buttons exist, just need wiring) → document (completion work) → PDF (new but simpler) → presentation (most new work). Visio remains shell-only.

**Rationale**: Spreadsheet has the highest effort-to-value ratio — many buttons already exist and just need Univer API wiring. Document editor completion builds on existing TipTap work. PDF is self-contained. Presentation requires the most new code.

## Risks / Trade-offs

**[Risk] Univer API limitations** → Mitigation: Spike on Univer's formatting, chart, pivot table, and data validation APIs before committing to the spreadsheet implementation. If gaps exist, we can contribute upstream or implement missing features as Univer plugins.

**[Risk] TipTap extension availability** → Mitigation: Check community extensions for highlight, content controls, and track changes before building custom ones. Known available: `@tiptap/extension-highlight`, `@tiptap-pro/extension-diff` (track changes).

**[Risk] wo-renderer-wasm PDF annotation support** → Mitigation: Annotations are React overlays, not renderer features. The renderer only needs to render the page — annotations are a separate concern. Verify the renderer exposes page dimensions and text position APIs for anchoring annotations.

**[Risk] Plugin API backward compatibility** → Mitigation: Version the PluginContext interface. Use `semver` checks — plugins declare minimum API version, editor validates before loading.

**[Trade-off] Spec-driven ribbon vs. component-per-tab** → The spec-driven approach is more declarative and consistent but less flexible for complex custom UI (e.g., color pickers with sub-menus). Mitigate by allowing spec entries to reference React components for complex controls.

## Migration Plan

1. **Phase 1** — Ribbon primitives: Add shared components to `@world-office/editor-common`. No migration needed; new exports alongside existing Ribbon.
2. **Phase 2** — Spreadsheet wiring: Enable disabled buttons in `spreadsheeteditor-react` and connect to Univer. No breaking changes.
3. **Phase 3** — Document completion: Add TipTap extensions and toolbar buttons. Existing buttons continue working.
4. **Phase 4** — PDF editor: Build annotation layer. The shell already exists.
5. **Phase 5** — Presentation editor: Build slide management and toolbar. The shell already exists.
6. **Phase 6** — Plugin system: Add loader and API. No impact on existing editors.

Each phase is independently deployable. No database migrations or server changes required.

## Open Questions

- **Univer chart/pivot table maturity**: Does Univer support charts and pivot tables in its current stable release, or are these preview features?
- **Track changes collaboration**: How do tracked changes interact with real-time collaboration (Operational Transform vs CRDT)? The existing collaboration system needs investigation.
- **PDF form AcroForm vs XFA**: Should we support XFA forms (more complex) or only AcroForm (simpler, more common)?
- **Plugin storage**: Should plugin data persist in localStorage, IndexedDB, or server-side storage via WOPI?
