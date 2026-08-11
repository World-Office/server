## 1. Ribbon Component System (`@world-office/editor-common`)

- [x] 1.1 Create `ColorPicker` component — preset color grid, recent colors, "More Colors..." native picker, `value/onChange/presetColors` props
- [x] 1.2 Create `DropdownMenu` component — toggle button + floating menu, nested submenus, checkmark/radio indicators, separators, keyboard navigation (Arrow/Enter/Escape)
- [x] 1.3 Create `FlyoutPanel` component — floating panel anchored to trigger, position hints (below/above/left/right), dismiss on outside click
- [x] 1.4 Create `ComboBox` component — text input + dropdown, filtering/type-ahead, selectable items with optional icons
- [x] 1.5 Create `SpinBox` component — numeric input with increment/decrement buttons, `min/max/step/value/onChange` props
- [x] 1.6 Create `ContextMenu` component — right-click triggered, positioned at cursor, nested items, separators, disabled items, icons, dismiss on scroll
- [x] 1.7 Create `RibbonSeparator` component — vertical divider between ribbon groups, optional `label` prop
- [x] 1.8 Enhance `Ribbon` component to support spec-driven rendering — accept `spec` objects defining tabs/groups/buttons with `type/command/disabled/active` predicates
- [x] 1.9 Add unit tests for all ribbon primitives (ColorPicker, DropdownMenu, FlyoutPanel, ComboBox, SpinBox, ContextMenu)
- [x] 1.10 Export all new components from `@world-office/editor-common` index

## 2. Spreadsheet Toolbar Wiring

- [x] 2.1 Wire font formatting buttons (Bold, Italic, Underline, Strikethrough) to Univer API with active state reflection
- [x] 2.2 Wire font family ComboBox to Univer API — list system fonts, apply to selection, display current cell font
- [x] 2.3 Wire font size SpinBox to Univer API — display current cell size, apply custom sizes
- [x] 2.4 Wire alignment buttons (AlignLeft, AlignCenter, AlignRight, Merge & Center, Wrap Text) to Univer API
- [x] 2.5 Wire number formatting buttons (Currency, Percent, Decimal) to Univer API
- [x] 2.6 Wire fill color and text color buttons to Univer API via ColorPicker component
- [x] 2.7 Wire cell insert/delete operations to Univer API (shift down/right for insert, shift up/left for delete)
- [x] 2.8 Wire Auto Sum to Univer API — detect selection range, insert SUM formula below/right
- [x] 2.9 Wire Sort (ascending/descending) and Filter to Univer API
- [x] 2.10 Build formula bar — display active cell formula/value, inline editing, Enter to commit
- [x] 2.11 Implement chart insertion (bar, line, pie, scatter) from Insert tab via Univer chart API
- [x] 2.12 Implement pivot table creation — field configuration panel, row/column/value assignment
- [x] 2.13 Implement conditional formatting — dialog for highlight rules (greater than, less than, between, data bars, color scales)
- [x] 2.14 Implement data validation — dropdown list, number range, date range, text length rules with error alerts
- [x] 2.15 Build sheet tab bar — add/rename/delete/reorder/duplicate sheets, right-click context menu
- [x] 2.16 Spike: Verify Univer chart, pivot table, and data validation API maturity — document gaps

## 3. Document Toolbar Completion

- [x] 3.1 Implement text highlight color — TipTap highlight extension with ColorPicker (preset colors + "No Color")
- [x] 3.2 Implement line spacing control — DropdownMenu with preset values (1.0, 1.15, 1.5, 2.0, 2.5, 3.0) and custom spacing option
- [x] 3.3 Implement multilevel list support — increase/decrease list level buttons, nested bullet and numbered lists
- [x] 3.4 Implement paragraph borders — FlyoutPanel with border options (top/bottom/left/right/box), width/color/style configuration
- [x] 3.5 Build style gallery dropdown — list all paragraph/character styles with live preview, apply on select
- [x] 3.6 Implement page number insertion — Insert tab options (top/bottom/margin/current position), auto-updating numbers
- [x] 3.7 Implement header/footer editing — double-click to enter edit mode, "Different first page" and "Different odd/even" support
- [x] 3.8 Build comments panel — right sidebar, add/reply/resolve/delete comments, anchored to text ranges
- [x] 3.9 Implement track changes mode — record insertions (colored + underline) and deletions (colored + strikethrough), accept/reject individual or all changes, Review tab
- [x] 3.10 Implement footnotes and endnotes — auto-numbered references, clickable navigation, footnote/endnote editing pane
- [x] 3.11 Implement Table of Contents — generate from heading styles, clickable page numbers, "Update Table" button
- [x] 3.12 Implement content controls — plain text, rich text, dropdown, date picker, checkbox controls
- [x] 3.13 Implement text direction controls (LTR/RTL) for bidirectional text support
- [x] 3.14 Investigate: TipTap extension availability for highlight, content controls, track changes — document what exists vs. needs building

## 4. Presentation Slide Management

- [x] 4.1 Build slide panel (left sidebar) with thumbnails — click to select, active slide highlight
- [x] 4.2 Implement slide CRUD — add (default layout), delete, duplicate, reorder via drag-and-drop
- [x] 4.3 Implement slide layout templates — Title Slide, Title and Content, Section Header, Two Content, Comparison, Blank
- [x] 4.4 Implement master slide editing — background, fonts, colors, placeholder positioning, propagate to child slides
- [x] 4.5 Build Home tab toolbar — font formatting (family/size/bold/italic/color), alignment, bullets/numbering, shape fill/outline/effects
- [x] 4.6 Build Insert tab — New Slide, Text Box, Picture, Shape, Table, Chart, Audio/Video, Link
- [x] 4.7 Implement animation pane — entrance/emphasis/exit/motion path animations, animation list with reorder
- [x] 4.8 implement slide transitions — transition types (fade, push, wipe, morph), duration, trigger (on click, after delay)
- [x] 4.9 Build speaker notes panel — per-slide notes editing, hidden in slideshow mode
- [x] 4.10 Implement slideshow mode — fullscreen, transitions/animations, navigation (click/arrows/spacebar), Escape to exit

## 5. PDF Annotation and Forms

- [x] 5.1 Build annotation toolbar (Comment tab) — Sticky Note, Highlight, Underline, Strikethrough, Rectangle, Ellipse, Line, Arrow, Freehand, Redact tools
- [x] 5.2 Implement highlight/markup annotations — select text, apply highlight/underline/strikethrough with configurable color
- [x] 5.3 Implement shape annotations — rectangle, ellipse, line, arrow, freehand drawing with color/border/fill options
- [x] 5.4 Implement sticky-note comments — click-to-place markers, comments sidebar with threaded replies
- [x] 5.5 Implement PDF form filling — detect AcroForm fields, render text inputs/checkboxes/radio/dropdowns/signature fields, save filled forms
- [x] 5.6 Implement redaction tools — select area, apply redaction (irreversible content removal, black overlay)
- [x] 5.7 Implement page manipulation — rotate (90° increments), delete, insert (from file/blank), reorder (drag-and-drop thumbnails), extract pages
- [x] 5.8 Build page thumbnail panel — miniature page previews with selection, right-click context menu for page operations
- [x] 5.9 Spike: Verify wo-renderer-wasm exposes page dimensions and text position APIs needed for annotation anchoring

## 6. Plugin Architecture

- [x] 6.1 Define `WorldOfficePlugin` TypeScript interface — `id`, `name`, `version`, `init(ctx)`, `destroy()`
- [x] 6.2 Define `PluginContext` API surface — `toolbar.registerButton()`, `toolbar.registerTab()`, `menu.registerItem()`, `panel.registerPanel()`, `i18n.addTranslations()`, `storage.get/set()`, `editor.getSelection()`, `editor.insertContent()`
- [x] 6.3 Implement plugin loader — async dynamic `import()`, config-driven plugin list, error handling (failed plugins don't block editor)
- [x] 6.4 Implement Plugin Manager UI — list installed plugins, enable/disable toggles, per-plugin settings panel
- [x] 6.5 Build Plugin Marketplace stub — placeholder page with "Coming Soon" message
- [x] 6.6 Create plugin configuration file format — JSON/TOML with enabled plugins and per-plugin settings
- [x] 6.7 Write plugin development example — sample plugin that registers a toolbar button and panel, with README

## 7. Spec Migration and Cleanup

- [x] 7.1 Migrate document editor toolbar tabs to use spec-driven Ribbon (replace per-tab button soup with declarative spec entries)
- [x] 7.2 Migrate spreadsheet editor toolbar tabs to use spec-driven Ribbon
- [x] 7.3 Add i18n translation keys for all new UI strings across existing locale files in `apps/web/translation/`
- [x] 7.4 Run `pnpm typecheck` and `pnpm lint` across all modified packages — fix any issues
- [x] 7.5 Verify no regressions in document editor — existing toolbar buttons still work, collaboration still functions
