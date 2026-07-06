/**
 * Rich-text editor command bridge for the document editor toolbar.
 *
 * The toolbar in this app is a sibling of the RichTextEditor (they are rendered
 * by separate React components). To dispatch a TipTap command from a toolbar
 * button we use a module-level "active editor" reference inside RichTextEditor
 * plus this typed command surface.
 *
 * If a command is dispatched while no editor is mounted the dispatcher becomes
 * a no-op. Callers do not need to guard for this.
 */

import type { Editor } from "@tiptap/core"

export type RichTextCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "subscript"
  | "superscript"
  | "textColor"
  | "highlight"
  | "fontFamily"
  | "fontSize"
  | "clearFormatting"
  | "undo"
  | "redo"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignJustify"
  | "blockquote"
  | "codeBlock"
  | "link"
  | "image"
  | "indent"
  | "outdent"
  // Table commands
  | "insertTable"
  | "addRowBefore"
  | "addRowAfter"
  | "deleteRow"
  | "addColumnBefore"
  | "addColumnAfter"
  | "deleteColumn"
  | "mergeCells"
  | "splitCell"
  | "toggleHeaderRow"
  | "toggleHeaderColumn"
  | "toggleHeaderCell"
  | "deleteTable"
  | "pageBreak"
  | "horizontalRule"

export type RichTextCommandHandler = (command: RichTextCommand) => void

export const RICH_TEXT_COMMANDS: readonly RichTextCommand[] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "subscript",
  "superscript",
  "textColor",
  "highlight",
  "fontFamily",
  "fontSize",
  "clearFormatting",
  "undo",
  "redo",
  "heading1",
  "heading2",
  "heading3",
  "bulletList",
  "orderedList",
  "taskList",
  "alignLeft",
  "alignCenter",
  "alignRight",
  "alignJustify",
  "blockquote",
  "codeBlock",
  "link",
  "image",
  "indent",
  "outdent",
  "insertTable",
  "addRowBefore",
  "addRowAfter",
  "deleteRow",
  "addColumnBefore",
  "addColumnAfter",
  "deleteColumn",
  "mergeCells",
  "splitCell",
  "toggleHeaderRow",
  "toggleHeaderColumn",
  "toggleHeaderCell",
  "deleteTable",
  "pageBreak",
  "horizontalRule",
] as const

export type RichTextCommandSurface = Editor

let activeEditor: RichTextCommandSurface | null = null

export function getActiveRichTextEditor(): RichTextCommandSurface | null {
  return activeEditor
}

export function setActiveRichTextEditor(editor: RichTextCommandSurface | null): void {
  activeEditor = editor
}

export function dispatchRichTextCommand(command: RichTextCommand): boolean {
  const editor = activeEditor
  if (!editor) return false

  const chain = editor.chain().focus()

  switch (command) {
    case "bold":
      chain.toggleBold().run()
      return true
    case "italic":
      chain.toggleItalic().run()
      return true
    case "underline":
      chain.toggleUnderline().run()
      return true
    case "strike":
      chain.toggleStrike().run()
      return true
    case "subscript":
      chain.toggleSubscript().run()
      return true
    case "superscript":
      chain.toggleSuperscript().run()
      return true
    case "textColor": {
      const color = window.prompt("Enter text color (name or hex, e.g., red, #ff0000):")
      if (color) {
        chain.setColor(color).run()
      }
      return true
    }
    case "highlight": {
      const hlColor = window.prompt("Enter highlight color (name or hex):")
      if (hlColor) {
        chain.toggleHighlight({ color: hlColor }).run()
      }
      return true
    }
    case "fontFamily": {
      const font = window.prompt("Enter font family (e.g., Arial, Times New Roman):")
      if (font) {
        chain.setFontFamily(font).run()
      }
      return true
    }
    case "fontSize": {
      const size = window.prompt("Enter font size (e.g., 14pt, 16px):")
      if (size) {
        chain.setMark("textStyle", { fontSize: size }).run()
      }
      return true
    }
    case "clearFormatting":
      chain.unsetAllMarks().run()
      return true
    case "undo":
      chain.undo().run()
      return true
    case "redo":
      chain.redo().run()
      return true
    case "heading1":
      chain.toggleHeading({ level: 1 }).run()
      return true
    case "heading2":
      chain.toggleHeading({ level: 2 }).run()
      return true
    case "heading3":
      chain.toggleHeading({ level: 3 }).run()
      return true
    case "bulletList":
      chain.toggleBulletList().run()
      return true
    case "orderedList":
      chain.toggleOrderedList().run()
      return true
    case "taskList":
      chain.toggleTaskList().run()
      return true
    case "alignLeft":
      chain.setTextAlign("left").run()
      return true
    case "alignCenter":
      chain.setTextAlign("center").run()
      return true
    case "alignRight":
      chain.setTextAlign("right").run()
      return true
    case "alignJustify":
      chain.setTextAlign("justify").run()
      return true
    case "blockquote":
      chain.toggleBlockquote().run()
      return true
    case "codeBlock":
      chain.toggleCodeBlock().run()
      return true
    case "indent":
      chain.sinkListItem("listItem").run()
      return true
    case "outdent":
      chain.liftListItem("listItem").run()
      return true
    case "link": {
      const url = window.prompt("Enter link URL:")
      if (url) {
        chain.setLink({ href: url }).run()
      }
      return true
    }
    case "image": {
      const src = window.prompt("Enter image URL:")
      if (src) {
        chain.setImage({ src }).run()
      }
      return true
    }
    // Table commands
    case "insertTable": {
      const rows = Number.parseInt(window.prompt("Number of rows:", "3") ?? "3", 10)
      const cols = Number.parseInt(window.prompt("Number of columns:", "3") ?? "3", 10)
      if (rows > 0 && cols > 0) {
        chain.insertTable({ rows, cols, withHeaderRow: true }).run()
      }
      return true
    }
    case "addRowBefore":
      chain.addRowBefore().run()
      return true
    case "addRowAfter":
      chain.addRowAfter().run()
      return true
    case "deleteRow":
      chain.deleteRow().run()
      return true
    case "addColumnBefore":
      chain.addColumnBefore().run()
      return true
    case "addColumnAfter":
      chain.addColumnAfter().run()
      return true
    case "deleteColumn":
      chain.deleteColumn().run()
      return true
    case "mergeCells":
      chain.mergeCells().run()
      return true
    case "splitCell":
      chain.splitCell().run()
      return true
    case "toggleHeaderRow":
      chain.toggleHeaderRow().run()
      return true
    case "toggleHeaderColumn":
      chain.toggleHeaderColumn().run()
      return true
    case "toggleHeaderCell":
      chain.toggleHeaderCell().run()
      return true
    case "deleteTable":
      chain.deleteTable().run()
      return true
    case "pageBreak":
      // Use a horizontal rule as a page break marker
      chain.setHorizontalRule().run()
      return true
    case "horizontalRule":
      chain.setHorizontalRule().run()
      return true
  }
}
