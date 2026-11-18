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
import { TableRow } from "@tiptap/extension-table-row"
import type { Node as PMNode } from "@tiptap/pm/model"
import type { EditorState } from "@tiptap/pm/state"
import { documentStore } from "../stores/DocumentStore"
import { currentUser } from "./collaboration"
import { type CrossRefFormat, resolveRef } from "./cross-ref"
import { updateIndex as updateDocIndex } from "./document-index"
import { insertEndnoteCommand } from "./endnote-mark"
import { insertFootnoteCommand, updateFootnoteDisplayNumbers } from "./footnote-mark"
import { insertTableOfContentsCommand, updateTableOfContentsCommand } from "./toc-extension"
import {
  acceptAllChanges,
  acceptChange,
  nextChange,
  rejectAllChanges,
  rejectChange,
  toggleTrackChanges,
} from "./track-changes"
import { stepFontSize } from "./word-commands"

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
  | "cut"
  | "copy"
  | "paste"
  | "normal"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "bulletList"
  | "orderedList"
  | "taskList"
  // List Settings / List Types pickers
  | "listNumberingStyle"
  | "listIndent"
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
  | "insertCells"
  | "addRowBefore"
  | "addRowAfter"
  | "deleteRow"
  | "addColumnBefore"
  | "addColumnAfter"
  | "deleteColumn"
  | "mergeCells"
  | "splitCell"
  | "distributeRows"
  | "distributeColumns"
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
  | "removeHeader"
  | "removeFooter"
  | "differentFirstPage"
  | "differentOddEven"
  | "find"
  | "openTheme"
  | "openSearch"
  | "findNext"
  | "findPrevious"
  | "replace"
  | "replaceAll"
  | "addComment"
  | "toggleComment"
  | "insertToc"
  | "updateToc"
  | "insertFootnote"
  | "insertEndnote"
  | "setTextDirection"
  | "toggleSpellCheck"
  | "toggleRuler"
  | "toggleGridlines"
  | "toggleNavigation"
  | "toggleMultiplePages"
  | "toggleDarkDocument"
  | "toggleTrackChanges"
  | "acceptChange"
  | "rejectChange"
  | "acceptAllChanges"
  | "rejectAllChanges"
  | "nextChange"
  | "insertPageNumber"
  | "insertMergeField"
  | "loadHtml"
  | "insertSectionBreak"
  | "insertContinuousSectionBreak"
  | "insertCaptionFigure"
  | "insertCaptionTable"
  | "insertCrossReference"
  | "resolveCrossReferences"
  | "insertPlainTextControl"
  | "insertDropdownControl"
  | "insertCheckboxControl"
  | "insertDatePickerControl"
  | "setBoxBorder"
  | "removeBorders"
  | "insertIndexEntry"
  | "insertIndex"
  | "updateIndex"
  | "insertDateTime"
  | "insertField"
  | "increaseFontSize"
  | "decreaseFontSize"

/**
 * Numbering formats for the List Settings / List Types picker
 * (OO "List Settings" numbering-format rows + "List Types" gallery).
 *
 * `marker` is the value stored on the orderedList node `type` attribute —
 * TipTap's OrderedList renders it straight onto the `<ol type="…">`
 * element, which is also the CSS `list-style-type` shorthand ("1", "a",
 * "A", "i", "I").
 */
export type ListNumberingFormatId = "decimal" | "lowerAlpha" | "upperAlpha" | "lowerRoman" | "upperRoman"

export interface ListNumberingFormat {
  id: ListNumberingFormatId
  label: string
  /** Value for the orderedList `type` attr / `<ol type>` marker. */
  marker: string
  /** Human-facing example shown in the picker, e.g. "a. b. c.". */
  example: string
}

export const LIST_NUMBERING_FORMATS: Record<ListNumberingFormatId, ListNumberingFormat> = {
  decimal: { id: "decimal", label: "Numbered", marker: "1", example: "1. 2. 3." },
  lowerAlpha: { id: "lowerAlpha", label: "Lowercase Alphabet", marker: "a", example: "a. b. c." },
  upperAlpha: { id: "upperAlpha", label: "Uppercase Alphabet", marker: "A", example: "A. B. C." },
  lowerRoman: { id: "lowerRoman", label: "Lowercase Roman", marker: "i", example: "i. ii. iii." },
  upperRoman: { id: "upperRoman", label: "Uppercase Roman", marker: "I", example: "I. II. III." },
}

/**
 * Normalize a numbering-format value coming from a `wo-command` dispatch.
 * Accepts the camelCase ids used by the UI (`lowerAlpha`), the CSS
 * `list-style-type` spellings (`lower-alpha`) and the raw `<ol type>`
 * markers (`a`, `I`, …). Returns null for unknown values.
 */
export function normalizeListNumberingFormat(value?: string | null): ListNumberingFormatId | null {
  if (!value) return null
  const aliases: Record<string, ListNumberingFormatId> = {
    decimal: "decimal",
    "1": "decimal",
    "decimal-leading-zero": "decimal",
    loweralpha: "lowerAlpha",
    "lower-alpha": "lowerAlpha",
    a: "lowerAlpha",
    upperalpha: "upperAlpha",
    "upper-alpha": "upperAlpha",
    A: "upperAlpha",
    lowerroman: "lowerRoman",
    "lower-roman": "lowerRoman",
    i: "lowerRoman",
    upperroman: "upperRoman",
    "upper-roman": "upperRoman",
    I: "upperRoman",
  }
  return aliases[value] ?? aliases[value.toLowerCase()] ?? null
}

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
// Tracks spellcheck toggle state so the command works even when the editor
// DOM is not currently mounted (e.g. contract tests). Initial value matches
// the production default in RichTextEditor.tsx (`spellCheck="true"`).
let spellcheckEnabled = true

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
  "normal",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
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
  "insertCells",
  "addRowBefore",
  "addRowAfter",
  "deleteRow",
  "addColumnBefore",
  "addColumnAfter",
  "deleteColumn",
  "mergeCells",
  "splitCell",
  "distributeRows",
  "distributeColumns",
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
  "removeHeader",
  "removeFooter",
  "differentFirstPage",
  "differentOddEven",
  "openSearch",
  "findNext",
  "findPrevious",
  "replace",
  "replaceAll",
  "addComment",
  "toggleComment",
  "insertToc",
  "updateToc",
  "insertFootnote",
  "insertEndnote",
  "setTextDirection",
  "toggleSpellCheck",
  "toggleRuler",
  "toggleGridlines",
  "toggleNavigation",
  "toggleMultiplePages",
  "toggleDarkDocument",
  "toggleTrackChanges",
  "acceptChange",
  "rejectChange",
  "acceptAllChanges",
  "rejectAllChanges",
  "nextChange",
  "insertPageNumber",
  "insertMergeField",
  "loadHtml",
  "insertSectionBreak",
  "insertContinuousSectionBreak",
  "insertCaptionFigure",
  "insertCaptionTable",
  "insertCrossReference",
  "resolveCrossReferences",
  "insertPlainTextControl",
  "insertDropdownControl",
  "insertCheckboxControl",
  "insertDatePickerControl",
  "setBoxBorder",
  "removeBorders",
  "insertIndexEntry",
  "insertIndex",
  "updateIndex",
  "insertDateTime",
  "insertField",
  "increaseFontSize",
  "decreaseFontSize",
] as const

/**
 * PGP-1 — table "Distribute Rows".
 *
 * TipTap's `tableRow` carries no height attribute, so equal row heights have
 * nowhere to live in the document model. This extends `tableRow` with a
 * `rowHeight` attr (rendered as `<tr data-row-height="24" style="height:24px">`,
 * which browsers treat as the row's minimum height) so `distributeRows` can
 * persist a uniform height per row.
 */
export const TableRowHeight = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-row-height") ?? element.style.height ?? ""
          const px = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10)
          return Number.isFinite(px) && px > 0 ? px : null
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const height = attributes.rowHeight
          if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return {}
          return { "data-row-height": String(height), style: `height: ${height}px` }
        },
      },
    }
  },
})

/** Fallback column width (px) when a table has no `colwidth` at all yet. */
const DEFAULT_DISTRIBUTED_COLUMN_WIDTH = 100
/** Minimum uniform row height (px) used when the DOM reports no height. */
const MIN_DISTRIBUTED_ROW_HEIGHT = 24

/** The closest ancestor (or self) of the selection with the given node name. */
function ancestorOfSelection(
  state: EditorState,
  typeName: string,
): { pos: number; node: PMNode } | null {
  const from = state.selection.$from
  for (let depth = from.depth; depth > 0; depth -= 1) {
    const node = from.node(depth)
    if (node.type.name === typeName) {
      return { pos: from.before(depth), node }
    }
  }
  return null
}

/** Uniform column width (px) for `distributeColumns` — the mean known width. */
function distributedColumnWidth(table: PMNode): number {
  const widths: number[] = []
  table.firstChild?.forEach((cell) => {
    const span = Number(cell.attrs.colspan ?? 1)
    const colwidth = Array.isArray(cell.attrs.colwidth) ? cell.attrs.colwidth : null
    for (let i = 0; i < span; i += 1) {
      const w = colwidth ? colwidth[i] : null
      if (typeof w === "number" && Number.isFinite(w)) widths.push(w)
    }
  })
  if (widths.length === 0) return DEFAULT_DISTRIBUTED_COLUMN_WIDTH
  return Math.round(widths.reduce((a, b) => a + b, 0) / widths.length)
}

/**
 * Uniform row height (px) for `distributeRows` — the tallest row wins so no
 * row ever shrinks below its content (Word's "Distribute Rows" equalizes).
 * Falls back to MIN_DISTRIBUTED_ROW_HEIGHT when the DOM reports no layout
 * (headless tests, unmounted editor).
 */
function distributedRowHeight(editor: Editor, tablePos: number, table: PMNode): number {
  let target = MIN_DISTRIBUTED_ROW_HEIGHT
  table.forEach((row) => {
    const h = row.attrs.rowHeight
    if (typeof h === "number" && h > target) target = h
  })
  try {
    const dom = editor.view.nodeDOM(tablePos)
    // nodeDOM may hand back the table element or an ancestor of it; either
    // way measure the rows of the first table in scope.
    const scope =
      dom instanceof HTMLTableElement
        ? dom
        : dom instanceof HTMLElement
          ? dom.querySelector("table")
          : null
    if (scope !== null) {
      for (const row of Array.from(scope.querySelectorAll("tr"))) {
        const h = Math.round(row.getBoundingClientRect().height)
        if (h > target) target = h
      }
    }
  } catch {
    // No DOM for this node (never rendered) — keep the model/fallback value.
  }
  return target
}

/**
 * OO "Distribute Columns" — make every column of the table holding the
 * selection the same width by writing the mean width onto each cell's
 * `colwidth` attr (the same attr the column-resize handle writes).
 * Returns false when the selection is not inside a table.
 */
export function distributeTableColumns(editor: Editor): boolean {
  const table = ancestorOfSelection(editor.state, "table")
  if (table === null) return false
  const width = distributedColumnWidth(table.node)
  const tr = editor.state.tr
  table.node.forEach((row, rowOffset) => {
    row.forEach((cell, cellOffset) => {
      const span = Number(cell.attrs.colspan ?? 1)
      tr.setNodeMarkup(table.pos + 1 + rowOffset + 1 + cellOffset, undefined, {
        ...cell.attrs,
        colwidth: Array.from({ length: span }, () => width),
      })
    })
  })
  if (!tr.docChanged) return true
  editor.view.dispatch(tr)
  return true
}

/**
 * OO "Distribute Rows" — give every row of the table holding the selection
 * the same `rowHeight` (see TableRowHeight). Returns false when the
 * selection is not inside a table.
 *
 * ponytail: the height is a model attr rendered as a CSS height hint; rows
 * still grow with their content (a real fixed-height layout needs the
 * engine to own row geometry).
 */
export function distributeTableRows(editor: Editor): boolean {
  const table = ancestorOfSelection(editor.state, "table")
  if (table === null) return false
  const height = distributedRowHeight(editor, table.pos, table.node)
  const tr = editor.state.tr
  table.node.forEach((row, rowOffset) => {
    tr.setNodeMarkup(table.pos + 1 + rowOffset, undefined, { ...row.attrs, rowHeight: height })
  })
  if (!tr.docChanged) return true
  editor.view.dispatch(tr)
  return true
}

/**
 * Shift directions offered by the OO "Cells Add" (Insert Cells) dialog:
 * the new blank cell takes the selected cell's place and the existing
 * cells move `right` (same row) or `down` (same column).
 */
export type InsertCellsDirection = "right" | "down"

/**
 * Default shift direction when a dispatch carries no value — the option
 * the OO dialog preselects ("Shift cells right").
 */
export const DEFAULT_INSERT_CELLS_DIRECTION: InsertCellsDirection = "right"

const INSERT_CELLS_ALIASES: Record<string, InsertCellsDirection> = {
  right: "right",
  shiftright: "right",
  "shift-right": "right",
  horizontal: "right",
  column: "right",
  down: "down",
  shiftdown: "down",
  "shift-down": "down",
  vertical: "down",
  row: "down",
}

/**
 * Normalize a shift-direction value coming from a `wo-command` dispatch.
 * Unknown or missing values fall back to the dialog default.
 */
export function normalizeInsertCellsDirection(value?: string | null): InsertCellsDirection {
  if (!value) return DEFAULT_INSERT_CELLS_DIRECTION
  return (
    INSERT_CELLS_ALIASES[value] ??
    INSERT_CELLS_ALIASES[value.toLowerCase()] ??
    DEFAULT_INSERT_CELLS_DIRECTION
  )
}

/**
 * PGP-3 — OO "Cells Add": insert cell(s) at the selection and shift the
 * existing cells in the chosen direction. ProseMirror tables are a
 * rectangular grid, so the shift materializes as a column / row inserted
 * *at* the selected cell: with `right` the selected cell (and everything
 * after it in its row) moves one column right, with `down` the row moves
 * one row down. Returns the TipTap command result (false outside a table).
 */
export function insertTableCells(editor: Editor, direction: InsertCellsDirection): boolean {
  const chain = editor.chain().focus()
  return direction === "right" ? chain.addColumnBefore().run() : chain.addRowBefore().run()
}

export type RichTextCommandSurface = Editor

let activeEditor: RichTextCommandSurface | null = null

export function getActiveRichTextEditor(): RichTextCommandSurface | null {
  return activeEditor
}

export function setActiveRichTextEditor(editor: RichTextCommandSurface | null): void {
  activeEditor = editor
}

export function dispatchRichTextCommand(command: RichTextCommand, value?: string): boolean {
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
      const color = value || window.prompt("Enter text color (name or hex, e.g., red, #ff0000):")
      if (color) {
        chain.setColor(color).run()
      }
      return true
    }
    case "highlight": {
      const hlColor = value || window.prompt("Enter highlight color (name or hex):")
      if (hlColor === "transparent" || hlColor === "none") {
        chain.unsetHighlight().run()
      } else if (hlColor) {
        chain.toggleHighlight({ color: hlColor }).run()
      }
      return true
    }
    case "fontFamily": {
      const font = value || window.prompt("Enter font family (e.g., Arial, Times New Roman):")
      if (font) {
        chain.setFontFamily(font).run()
      }
      return true
    }
    case "fontSize": {
      const size = value || window.prompt("Enter font size (e.g., 14pt, 16px):")
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
    case "cut":
      document.execCommand("cut")
      return true
    case "copy":
      document.execCommand("copy")
      return true
    case "paste":
      document.execCommand("paste")
      return true
    case "find":
      // Alias: toggle the find panel
      documentStore.setShowFindPanel(!documentStore.showFindPanel)
      return true
    case "openTheme":
      documentStore.toggleRightPanel("theme")
      return true
    case "normal":
      chain.setParagraph().run()
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
    case "heading4":
      chain.toggleHeading({ level: 4 }).run()
      return true
    case "heading5":
      chain.toggleHeading({ level: 5 }).run()
      return true
    case "heading6":
      chain.toggleHeading({ level: 6 }).run()
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
    case "listNumberingStyle": {
      // OO List Settings (numbering format) + List Types (gallery pick).
      // Sets the `type` attr on the orderedList the selection lives in;
      // when the selection is in a different list kind (or no list at all)
      // it first converts/starts a numbered list, mirroring the OO picker.
      const formatId = normalizeListNumberingFormat(value)
      if (!formatId) return false
      const { state } = editor
      const { from, to } = state.selection
      let inOrdered = false
      state.doc.nodesBetween(from, to, (node) => {
        if (node.type.name === "orderedList") inOrdered = true
      })
      if (!inOrdered) {
        // bulletList / taskList / plain paragraph → numbered list
        editor.chain().focus().toggleOrderedList().run()
      }
      return editor
        .chain()
        .focus()
        .updateAttributes("orderedList", { type: LIST_NUMBERING_FORMATS[formatId].marker })
        .run()
    }
    case "listIndent": {
      // OO List Settings per-level indent: "down" deepens the level
      // (nest under the previous item), "up" lifts it back out.
      if (value === "down") {
        return editor.chain().focus().sinkListItem("listItem").run()
      }
      if (value === "up") {
        return editor.chain().focus().liftListItem("listItem").run()
      }
      return false
    }
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
      const url = value || window.prompt("Enter link URL:")
      if (url) {
        chain.setLink({ href: url }).run()
      }
      return true
    }
    case "image": {
      const src = value || window.prompt("Enter image URL:")
      if (src) {
        chain.setImage({ src }).run()
      }
      return true
    }
    // Table commands
    case "insertTable": {
      let rows = 0
      let cols = 0
      if (value && /^\s*(\d+)\s*[xX,]\s*(\d+)\s*$/.test(value)) {
        const m = value.match(/^\s*(\d+)\s*[xX,]\s*(\d+)\s*$/)
        if (m) {
          rows = Number.parseInt(m[1], 10)
          cols = Number.parseInt(m[2], 10)
        } else {
          rows = Number.parseInt(window.prompt("Number of rows:", "3") ?? "3", 10)
          cols = Number.parseInt(window.prompt("Number of columns:", "3") ?? "3", 10)
        }
      }
      if (rows > 0 && cols > 0) {
        chain.insertTable({ rows, cols, withHeaderRow: true }).run()
      }
      return true
    }
    case "insertCells":
      // OO "Cells Add" dialog — insert cell(s) at the selection with a
      // shift direction (right / down).
      return insertTableCells(editor, normalizeInsertCellsDirection(value))
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
    case "distributeRows":
      // OO table ctx-menu "Distribute Rows" — equal row heights.
      return distributeTableRows(editor)
    case "distributeColumns":
      // OO table ctx-menu "Distribute Columns" — equal column widths.
      return distributeTableColumns(editor)
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
      const spacing = value || window.prompt("Enter line spacing (e.g., 1, 1.15, 1.5, 2):", "1.15")
      if (spacing) {
        chain.setLineSpacing(spacing).run()
      }
      return true
    }
    case "paragraphSpacingBefore": {
      const before = value ?? window.prompt("Enter space before paragraph (px):", "12") ?? ""
      if (before) {
        chain.setParagraphSpacingBefore(`${before}px`).run()
      }
      return true
    }
    case "paragraphSpacingAfter": {
      const after = value ?? window.prompt("Enter space after paragraph (px):", "12") ?? ""
      if (after) {
        chain.setParagraphSpacingAfter(`${after}px`).run()
      }
      return true
    }
    case "pageOrientation": {
      const orientation =
        value ||
        window.prompt(
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
      const size =
        value || window.prompt("Page size (A4/A3/Letter/Legal):", pageLayout.pageSize ?? "A4")
      if (size && ["A4", "A3", "Letter", "Legal"].includes(size)) {
        pageLayout.pageSize = size as PageLayoutSettings["pageSize"]
        window.dispatchEvent(
          new CustomEvent("world-office:page-layout", { detail: { ...pageLayout } }),
        )
      }
      return true
    }
    case "pageMargins": {
      const margins =
        value || window.prompt("Margins (normal/narrow/wide):", pageLayout.margins ?? "normal")
      if (margins && ["normal", "narrow", "wide"].includes(margins)) {
        pageLayout.margins = margins as PageLayoutSettings["margins"]
        window.dispatchEvent(
          new CustomEvent("world-office:page-layout", { detail: { ...pageLayout } }),
        )
      }
      return true
    }
    case "columns": {
      let n: number
      if (value && /^\d+$/.test(String(value))) {
        n = Number.parseInt(String(value), 10)
      } else {
        const cols = window.prompt("Number of columns (1-3):", "2")
        n = Number.parseInt(cols ?? "1", 10)
      }
      if (n >= 1 && n <= 3) {
        window.dispatchEvent(new CustomEvent("world-office:columns", { detail: { count: n } }))
      }
      return true
    }
    case "columnsReset":
      window.dispatchEvent(new CustomEvent("world-office:columns", { detail: { count: 1 } }))
      return true
    case "editHeader":
      documentStore.headerFooterMode =
        documentStore.headerFooterMode === "header" ? "none" : "header"
      return true
    case "editFooter":
      documentStore.headerFooterMode =
        documentStore.headerFooterMode === "footer" ? "none" : "footer"
      return true
    case "removeHeader":
      documentStore.clearHeader()
      documentStore.headerFooterMode = "none"
      return true
    case "removeFooter":
      documentStore.clearFooter()
      documentStore.headerFooterMode = "none"
      return true
    case "differentFirstPage":
      documentStore.setDifferentFirstPage(!documentStore.differentFirstPage)
      return true
    case "differentOddEven":
      documentStore.setDifferentOddEven(!documentStore.differentOddEven)
      return true
    case "openSearch": {
      if (!value) {
        // Toggle the find panel — the panel itself drives search on input.
        documentStore.setShowFindPanel(!documentStore.showFindPanel)
        return true
      }
      const doc = editor.state.doc
      const text = doc.textBetween(0, doc.content.size, "\n", " ")
      const matches = text.toLowerCase().split(value.toLowerCase()).length - 1
      searchState.query = value
      searchState.matches = matches
      searchState.currentIndex = 0
      const pos = text.toLowerCase().indexOf(value.toLowerCase())
      if (pos >= 0) {
        try {
          editor.commands.setTextSelection({ from: pos + 1, to: pos + 1 + value.length })
          editor.commands.scrollIntoView()
        } catch {
          // ignore
        }
      }
      window.dispatchEvent(
        new CustomEvent("world-office:search-state", { detail: { ...searchState } }),
      )
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
      const replaceWith = value ?? searchState.replaceText
      if (replaceWith) {
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
      const replaceWith = value ?? searchState.replaceText
      if (replaceWith) {
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
    case "insertToc":
      insertTableOfContentsCommand(editor)
      return true
    case "updateToc":
      updateTableOfContentsCommand(editor)
      return true
    case "insertFootnote":
      insertFootnoteCommand(editor)
      updateFootnoteDisplayNumbers(editor)
      return true
    case "insertEndnote":
      insertEndnoteCommand(editor)
      return true
    case "setTextDirection": {
      if (value === "ltr" || value === "rtl") {
        editor.chain().focus().setTextDirection(value).run()
      }
      return true
    }
    case "toggleSpellCheck": {
      spellcheckEnabled = !spellcheckEnabled
      const current = document.querySelector<HTMLElement>(".rich-text-editor [contenteditable]")
      if (current) {
        current.setAttribute("spellcheck", spellcheckEnabled ? "true" : "false")
      }
      window.dispatchEvent(
        new CustomEvent("world-office:spellcheck", { detail: { enabled: spellcheckEnabled } }),
      )
      return true
    }
    case "toggleRuler":
      documentStore.toggleRuler()
      return true
    case "toggleGridlines":
      documentStore.toggleGridlines()
      return true
    case "toggleNavigation":
      documentStore.toggleNavigation()
      return true
    case "toggleMultiplePages":
      documentStore.toggleMultiplePages()
      return true
    case "toggleDarkDocument":
      documentStore.toggleDarkDocument()
      return true
    case "toggleTrackChanges":
      return toggleTrackChanges(editor, currentUser.username, currentUser.id)
    case "acceptChange":
      return acceptChange(editor, editor.state.selection.from)
    case "rejectChange":
      return rejectChange(editor, editor.state.selection.from)
    case "acceptAllChanges":
      acceptAllChanges(editor)
      return true
    case "rejectAllChanges":
      rejectAllChanges(editor)
      return true
    case "nextChange":
      return nextChange(editor)
    case "insertPageNumber":
      return editor
        .chain()
        .focus()
        .insertContent(
          'Page <span data-page-number data-pn-num="1">1</span> of <span data-page-count data-pc-total="1">1</span>',
        )
        .run()
    case "insertMergeField":
      if (value) {
        return editor
          .chain()
          .focus()
          .insertContent(
            `<span data-merge-field data-field-name="${value.replace(/"/g, "&quot;")}">«${value}»</span>`,
          )
          .run()
      }
      return true
    case "loadHtml":
      if (value) {
        editor.commands.setContent(value)
        return true
      }
      return true
    case "insertSectionBreak":
      return editor
        .chain()
        .focus()
        .insertContent(`<div data-section-break data-section-type="next-page"></div>`)
        .run()
    case "insertContinuousSectionBreak":
      return editor
        .chain()
        .focus()
        .insertContent(`<div data-section-break data-section-type="continuous"></div>`)
        .run()
    case "insertCaptionFigure":
      return editor
        .chain()
        .focus()
        .insertContent(
          `<div data-caption data-caption-type="figure" data-caption-num="1"><span data-caption-text="">${value ?? ""}</span></div>`,
        )
        .run()
    case "insertCaptionTable":
      return editor
        .chain()
        .focus()
        .insertContent(
          `<div data-caption data-caption-type="table" data-caption-num="1"><span data-caption-text="">${value ?? ""}</span></div>`,
        )
        .run()
    case "insertCrossReference":
      if (value) {
        const parts = value.split("|")
        const targetId = parts[0] ?? ""
        const format = parts[1] ?? "text"
        const display = parts[2] ?? "[Ref]"
        return editor
          .chain()
          .focus()
          .insertContent(
            `<span data-cross-ref data-ref-target="${targetId}" data-ref-format="${format}" data-ref-display="${display}">${display}</span>`,
          )
          .run()
      }
      return true
    case "resolveCrossReferences":
      // Re-resolve all cross-references in the document
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "crossReference") {
          const targetId = node.attrs.targetId as string
          const format = (node.attrs.format as string) ?? "text"
          const resolved = resolveRef(targetId, format as CrossRefFormat, editor)
          editor
            .chain()
            .focus()
            .setNodeSelection(pos)
            .updateAttributes("crossReference", { display: resolved })
            .run()
        }
        return true
      })
      return true
    case "insertPlainTextControl":
      return editor
        .chain()
        .focus()
        .insertContent('<span data-content-control="plain-text">Enter text</span>')
        .run()
    case "insertDropdownControl":
      return editor
        .chain()
        .focus()
        .insertContent('<span data-content-control="dropdown" data-options="">Select...</span>')
        .run()
    case "insertCheckboxControl":
      return editor
        .chain()
        .focus()
        .insertContent('<span data-content-control="checkbox">☐</span>')
        .run()
    case "insertDatePickerControl":
      return editor
        .chain()
        .focus()
        .insertContent('<span data-content-control="date-picker"></span>')
        .run()
    case "setBoxBorder":
      return (
        editor.commands.setBorderTop({ borderTop: "2px solid #000" }) &&
        editor.commands.setBorderBottom({ borderBottom: "2px solid #000" })
      )
    case "removeBorders":
      return editor.commands.removeBorders()
    case "insertIndexEntry": {
      const term = value || window.getSelection()?.toString() || "entry"
      return editor
        .chain()
        .focus()
        .insertContent(
          `<span data-index-entry data-index-term="${term.replace(/"/g, "&quot;")}">${term}</span>`,
        )
        .run()
    }
    case "insertIndex":
      return editor
        .chain()
        .focus()
        .insertContent('<div data-index-list data-index-updated=""></div>')
        .run()
    case "updateIndex": {
      return updateDocIndex(editor)
    }
    case "insertDateTime": {
      const stamp = new Date().toISOString()
      return editor
        .chain()
        .focus()
        .insertContent(`<span data-wo-field="DATETIME">${stamp}</span>`)
        .run()
    }
    case "insertField": {
      const name = value || "PAGE"
      return editor
        .chain()
        .focus()
        .insertContent(`<span data-wo-field="${name}">${name}</span>`)
        .run()
    }
    case "increaseFontSize":
    case "decreaseFontSize": {
      // Home tab A^/Av buttons — step along the OO font ladder. The value is
      // the current size; the step lands via the same wasm path word-commands
      // uses (commandToFormat → applyFormatting). Here in the RTE bridge we
      // mirror it for direct dispatch callers.
      const dir = command === "increaseFontSize" ? 1 : -1
      const next = stepFontSize(value, dir)
      return editor.commands.command(({ tr }) => {
        tr.setMeta("wo-format", { fontSize: next * 2 })
        return true
      })
    }
  }
}
