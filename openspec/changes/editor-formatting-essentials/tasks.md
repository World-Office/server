## 1. Backend: Extend wo-html model for inline styles

- [x] 1.1 Add `style: Option<String>` field to `InlineElement::Text` in `core/crates/wo-html/src/model.rs`
- [x] 1.2 Update `HtmlParser` to extract `style` attribute from `<span>` tags and populate the new field
- [x] 1.3 Update `HtmlSerializer` to output `style` attribute when `InlineElement::Text` has a style value
- [x] 1.4 Update all match arms on `InlineElement` across wo-html and wo-x2t that don't handle the new field (ensure compilation)
- [x] 1.5 Run `cargo test -p wo-html -p wo-x2t` to verify roundtrip

## 2. Frontend: Install new TipTap extensions

- [x] 2.1 Add 8 new @tiptap packages to `package.json` at ^3.27.1
- [x] 2.2 Run `pnpm install` to install new deps
- [x] 2.3 Verify `pnpm lint`, `pnpm typecheck`, `pnpm build` pass

## 3. Frontend: Register extensions in RichTextEditor.tsx

- [x] 3.1 Import all 8 new extensions at the top of `RichTextEditor.tsx`
- [x] 3.2 Add Subscript, Superscript, Color, Highlight.configure({ multicolor: true }), FontFamily, TextStyle, TaskList, TaskItem to the extensions array
- [x] 3.3 Ensure TextAlign's `types` config still includes paragraph and heading
- [x] 3.4 Verify `pnpm typecheck` passes

## 4. Frontend: Add command handlers in rte-command.ts

- [x] 4.1 Add 15 new commands to the `RichTextCommand` type
- [x] 4.2 Implement switch cases for each new command
- [x] 4.3 Add prompt-based helpers for parameterized commands
- [x] 4.4 Verify `pnpm typecheck` and `pnpm build` pass

## 5. Frontend: Wire toolbar buttons in HomeTab.tsx

- [x] 5.1 Add font family dropdown selector (Aptos, Calibri, Arial, etc.)
- [x] 5.2 Add font size dropdown selector (8-72pt)
- [x] 5.3 Wire A+ and A- buttons to fontSize command
- [x] 5.4 Wire text color (A) button with prompt-based color picker
- [x] 5.5 Wire highlight (Ab) button with prompt-based color picker
- [x] 5.6 Add undo and redo buttons to the clipboard group
- [x] 5.7 Add blockquote, code block, clear formatting buttons
- [x] 5.8 Add justify align button to paragraph alignment group
- [x] 5.9 Add task list button to paragraph list group
- [x] 5.10 Wire decrease/increase indent buttons
- [x] 5.11 Add heading 3 button to styles group

## 6. Frontend: Verify complete

- [x] 6.1 Run `pnpm lint` — clean
- [x] 6.2 Run `pnpm typecheck` — clean
- [x] 6.3 Run `pnpm build` — succeeds
- [x] 6.4 Run `pnpm test` — passes (10/10)
- [x] 6.5 Run `cargo build --workspace` — succeeds

## 7. Deploy

- [x] 7.1 Commit all changes with message "feat: add subscript, superscript, color, highlight, font controls, blockquote, code, task list, justify, undo/redo to TipTap editor"
- [x] 7.2 Push to origin/main
- [x] 7.3 Build frontend (pnpm build) for production
- [x] 7.4 SCP dist to legion:/opt/world-office/editor-ui/
- [x] 7.5 Restart wo-docserver container
- [x] 7.6 Verify new formatting buttons appear in the deployed editor
