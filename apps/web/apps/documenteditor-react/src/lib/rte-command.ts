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
  // Line spacing / paragraph
  | "lineSpacing"
  | "paragraphSpacingBefore"
  | "paragraphSpacingAfter"
  | "pageOrientation"
  | "pageSize"
  | "pageMargins"
  | "columns"
  | "columnsReset"
  | "editHeader"
  | "editFooter"
  | "openSearch"
  | "findNext"
  | "findPrevious"
  | "replace"
  | "replaceAll"
  | "addComment"
  | "toggleComment"
  | "toggleSpellCheck"

export interface PageLayoutSettings {
  orientation?: "portrait" | "landscape"
  pageSize?: "A4" | "A3" | "Letter" | "Legal"
  margins?: "normal" | "narrow" | "wide"
}

export interface SearchState {
  query: string
  replaceText: string
  currentIndex: number
  matches: number
}

export type RichTextCommandHandler = (command: RichTextCommand) => void

const pageLayout: PageLayoutSettings = {}
const searchState: SearchState = { query: "", replaceText: "", currentIndex: 0, matches: 0 }

export function getPageLayout(): PageLayoutSettings {
  return pageLayout
}

export function getSearchState(): SearchState {
  return searchState
}

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
  "lineSpacing",
  "paragraphSpacingBefore",
  "paragraphSpacingAfter",
  "pageOrientation",
  "pageSize",
  "pageMargins",
  "columns",
  "columnsReset",
  "editHeader",
  "editFooter",
  "openSearch",
  "findNext",
  "findPrevious",
  "replace",
  "replaceAll",
  "addComment",
  "toggleComment",
  "toggleSpellCheck",
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
    case "lineSpacing": {
      const spacing = window.prompt("Enter line spacing (e.g., 1, 1.15, 1.5, 2):", "1.15")
      if (spacing) {
        chain.setMark("textStyle", { lineHeight: spacing }).run()
      }
      return true
    }
    case "paragraphSpacingBefore": {
      const before = window.prompt("Enter space before paragraph (px):", "12") ?? ""
      if (before) {
        chain.setMark("textStyle", { marginTop: `${before}px` }).run()
      }
      return true
    }
    case "paragraphSpacingAfter": {
      const after = window.prompt("Enter space after paragraph (px):", "12") ?? ""
      if (after) {
        chain.setMark("textStyle", { marginBottom: `${after}px` }).run()
      }
      return true
    }
    case "pageOrientation": {
      const orientation = window.prompt(
        "Page orientation (portrait/landscape):",
        pageLayout.orientation ?? "portrait",
      )
      if (orientation === "portrait" || orientation === "landscape") {
        pageLayout.orientation = orientation
        window.dispatchEvent(
          new CustomEvent("world-office:page-layout", { detail: { ...pageLayout } }),
        )
      }
      return true
    }
    case "pageSize": {
      const size = window.prompt("Page size (A4/A3/Letter/Legal):", pageLayout.pageSize ?? "A4")
      if (size && ["A4", "A3", "Letter", "Legal"].includes(size)) {
        pageLayout.pageSize = size as PageLayoutSettings["pageSize"]
        window.dispatchEvent(
          new CustomEvent("world-office:page-layout", { detail: { ...pageLayout } }),
        )
      }
      return true
    }
    case "pageMargins": {
      const margins = window.prompt("Margins (normal/narrow/wide):", pageLayout.margins ?? "normal")
      if (margins && ["normal", "narrow", "wide"].includes(margins)) {
        pageLayout.margins = margins as PageLayoutSettings["margins"]
        window.dispatchEvent(
          new CustomEvent("world-office:page-layout", { detail: { ...pageLayout } }),
        )
      }
      return true
    }
    case "columns": {
      const cols = window.prompt("Number of columns (1-3):", "2")
      const n = Number.parseInt(cols ?? "1", 10)
      if (n >= 1 && n <= 3) {
        window.dispatchEvent(new CustomEvent("world-office:columns", { detail: { count: n } }))
      }
      return true
    }
    case "columnsReset":
      window.dispatchEvent(new CustomEvent("world-office:columns", { detail: { count: 1 } }))
      return true
    case "editHeader":
      editor.commands.focus("start")
      editor.commands.scrollIntoView()
      return true
    case "editFooter":
      editor.commands.focus("end")
      editor.commands.scrollIntoView()
      return true
    case "openSearch": {
      const query = window.prompt("Search for:", searchState.query || "")
      if (query) {
        const doc = editor.state.doc
        const text = doc.textBetween(0, doc.content.size, "\n", " ")
        const matches = text.toLowerCase().split(query.toLowerCase()).length - 1
        searchState.query = query
        searchState.matches = matches
        searchState.currentIndex = 0
        const pos = text.toLowerCase().indexOf(query.toLowerCase())
        if (pos >= 0) {
          const from = pos
          const to = from + query.length
          editor.commands.setTextSelection({ from, to })
          editor.commands.scrollIntoView()
        }
        window.dispatchEvent(
          new CustomEvent("world-office:search-state", { detail: { ...searchState } }),
        )
      }
      return true
    }
    case "findNext": {
      if (!searchState.query) return true
      const doc = editor.state.doc
      const text = doc.textBetween(0, doc.content.size, "\n", " ")
      const query = searchState.query.toLowerCase()
      const textLower = text.toLowerCase()
      let pos = textLower.indexOf(query, (editor.state.selection.anchor || 0) + 1)
      if (pos < 0) pos = textLower.indexOf(query)
      if (pos >= 0) {
        editor.commands.setTextSelection({ from: pos, to: pos + query.length })
        editor.commands.scrollIntoView()
      }
      return true
    }
    case "findPrevious": {
      if (!searchState.query) return true
      const doc = editor.state.doc
      const text = doc.textBetween(0, doc.content.size, "\n", " ")
      const query = searchState.query.toLowerCase()
      const textLower = text.toLowerCase()
      let pos = textLower.lastIndexOf(
        query,
        (editor.state.selection.anchor || text.length) - query.length - 1,
      )
      if (pos < 0) pos = textLower.lastIndexOf(query)
      if (pos >= 0) {
        editor.commands.setTextSelection({ from: pos, to: pos + query.length })
        editor.commands.scrollIntoView()
      }
      return true
    }
    case "replace": {
      if (!searchState.query) return true
      const replaceWith = window.prompt("Replace with:", searchState.replaceText || "")
      if (replaceWith !== null) {
        searchState.replaceText = replaceWith
        const { from, to } = editor.state.selection
        if (from !== to) {
          const selected = editor.state.doc.textBetween(from, to, "\n", " ")
          if (selected.toLowerCase() === searchState.query.toLowerCase()) {
            editor.chain().focus().deleteRange({ from, to }).insertContent(replaceWith).run()
          }
        }
        setTimeout(() => dispatchRichTextCommand("findNext"), 50)
      }
      return true
    }
    case "replaceAll": {
      const replaceWith = window.prompt("Replace all matches with:", searchState.replaceText || "")
      if (replaceWith !== null) {
        searchState.replaceText = replaceWith
        const doc = editor.state.doc
        const text = doc.textBetween(0, doc.content.size, "\n", " ")
        let count = 0
        let idx = 0
        const query = searchState.query.toLowerCase()
        while (true) {
          const pos = text.toLowerCase().indexOf(query, idx)
          if (pos < 0) break
          const from = pos
          const to = pos + query.length
          editor.chain().focus().deleteRange({ from, to }).insertContent(replaceWith).run()
          count++
          idx = pos + replaceWith.length
        }
        window.dispatchEvent(
          new CustomEvent("world-office:search-state", {
            detail: { ...searchState, matches: count },
          }),
        )
      }
      return true
    }
    case "addComment": {
      const comment = window.prompt("Add comment:")
      if (comment) {
        const { from, to } = editor.state.selection
        if (from !== to) {
          editor.chain().focus().setComment({ comment }).run()
        }
      }
      return true
    }
    case "toggleComment":
      editor.chain().focus().unsetComment().run()
      return true
    case "toggleSpellCheck": {
      const current = document.querySelector<HTMLElement>(".rich-text-editor [contenteditable]")
      if (current) {
        const enabled = current.getAttribute("spellcheck") !== "false"
        current.setAttribute("spellcheck", enabled ? "false" : "true")
        window.dispatchEvent(
          new CustomEvent("world-office:spellcheck", { detail: { enabled: !enabled } }),
        )
      }
      return true
    }
  }
}
