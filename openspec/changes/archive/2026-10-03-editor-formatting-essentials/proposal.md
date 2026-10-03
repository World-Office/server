## Why

The document editor's TipTap integration currently supports only bold, italic, underline, strikethrough, two heading levels, and basic list/alignment formatting. Users see a toolbar with dozens of placeholder buttons that do nothing — font selection, text color, subscript, superscript, tables, and essential writing tools are missing. This makes the editor unusable for serious document work compared to OnlyOffice or LibreOffice.

This change delivers the most obvious formatting gaps first: text styling (superscript, subscript, color, highlight, font family/size), paragraph controls (blockquote, code, justify, clear formatting), and undo/redo. These are the features users notice immediately as missing.

## What Changes

- Install new `@tiptap/extension-*` packages for subscript, superscript, text color, highlight, font family, font size, and task list
- Add `@tiptap/extension-text-style` as a dependency of color and font-family extensions
- Register all new extensions in `RichTextEditor.tsx`
- Add command handlers for all new formatting in `rte-command.ts` (subscript, superscript, text color, highlight, font family, font size, task list, clear formatting, justify)
- Wire existing but unmapped HomeTab toolbar buttons (font size A+/A-, text color A, highlight Ab, indent, line spacing)
- Add missing toolbar buttons for blockquote, code, heading 3, undo, redo, justify, task list, clear formatting
- Add font family and font size dropdown selectors to the toolbar
- Backend: extend `wo-html` model to support inline styles (color, highlight, font-family, font-size) for roundtrip persistence

## Capabilities

### New Capabilities
- `format-text-styling`: Subscript, superscript, text color, highlight, font family, font size, clear formatting
- `format-paragraph-controls`: Blockquote, code, justify alignment, task list
- `format-history`: Undo/redo for rich text editing

### Modified Capabilities
<!-- No existing capabilities are modified — this is a purely new set of formatting features -->

## Impact

**Frontend** (`apps/web/apps/documenteditor-react/`):
- `package.json` — 8 new @tiptap dependencies
- `src/components/RichTextEditor.tsx` — register 8 new extensions
- `src/lib/rte-command.ts` — add 12 new command handlers
- `src/components/Toolbar/HomeTab.tsx` — wire existing buttons + add font/size dropdowns, 8 new buttons
- `src/lib/conversion.ts` — no changes needed (HTML in/out already generic)

**Backend** (`core/crates/wo-html/src/model.rs`):
- Extend `InlineElement` enum to include styling properties (color, highlight, font-family, font-size)
- Update `HtmlParser` and `HtmlSerializer` for these new attributes
- Update `wo-x2t` converters that produce/consume HTML

**Dependencies**: 8 new `@tiptap/extension-*` packages at ^3.27.1 (matching existing)
