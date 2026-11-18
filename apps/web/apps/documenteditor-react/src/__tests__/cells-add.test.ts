// @vitest-environment jsdom
/**
 * PGP-3 — "Cells Add" (OO Insert Cells dialog, shift direction).
 *
 * Covers the `insertCells` rich-text command: the OO dialog's two shift
 * directions (right / down) applied to the selected cell, the direction
 * normalization / registry surface (rte-command.ts), and the two
 * TablePanel buttons that dispatch the command.
 */
import { Editor } from "@tiptap/core"
import { Table } from "@tiptap/extension-table"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import StarterKit from "@tiptap/starter-kit"
import { act, createElement } from "react"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TablePanel } from "../components/TablePanel"
import {
  DEFAULT_INSERT_CELLS_DIRECTION,
  type InsertCellsDirection,
  RICH_TEXT_COMMANDS,
  type RichTextCommand,
  dispatchRichTextCommand,
  insertTableCells,
  normalizeInsertCellsDirection,
  setActiveRichTextEditor,
  TableRowHeight,
} from "../lib/rte-command"

const wasmMocks = vi.hoisted(() => ({
  getWasmApi: vi.fn((): unknown => null),
}))

vi.mock("../lib/wasm-renderer", () => ({ getWasmApi: wasmMocks.getWasmApi }))

/** Plain 2×2 table (no header row): A B / C D. */
const TABLE_2X2 =
  "<table><tbody>" +
  '<tr><td><p>AAA</p></td><td><p>BBB</p></td></tr>' +
  '<tr><td><p>CCC</p></td><td><p>DDD</p></td></tr>' +
  "</tbody></table>"

const mounted: Array<ReturnType<typeof createRoot>> = []
const appended: HTMLElement[] = []
const woCommands: Array<{ command: string; value?: string }> = []

function recordWoCommand(e: Event): void {
  const detail = (e as CustomEvent<{ command: string; value?: string }>).detail
  woCommands.push({ command: detail.command, value: detail.value })
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  woCommands.length = 0
  window.addEventListener("wo-command", recordWoCommand)
})

afterEach(() => {
  window.removeEventListener("wo-command", recordWoCommand)
  setActiveRichTextEditor(null)
  for (const root of mounted.splice(0)) act(() => root.unmount())
  for (const el of appended.splice(0)) el.remove()
})

function mount(node: ReactNode): HTMLDivElement {
  const container = document.createElement("div")
  document.body.appendChild(container)
  appended.push(container)
  const root = createRoot(container)
  act(() => root.render(node))
  mounted.push(root)
  return container
}

function buildEditor(html: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      Table,
      TableRowHeight,
      TableCell,
      TableHeader,
    ],
    content: html,
  })
}

/** Put the cursor on the first occurrence of `text` (works inside cells). */
function selectText(editor: Editor, text: string): void {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1) return false
    if (node.isText && node.text && node.text.includes(text)) {
      found = pos + node.text.indexOf(text) + 1
      return false
    }
    return true
  })
  expect(found, `text "${text}" not found`).toBeGreaterThan(0)
  editor.commands.setTextSelection(found)
}

interface DocNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  text?: string
}

/** Depth-first list of nodes with the given type name. */
function nodesOfType(node: DocNode, typeName: string): DocNode[] {
  const found: DocNode[] = []
  const walk = (n: DocNode): void => {
    if (n.type === typeName) found.push(n)
    for (const child of n.content ?? []) walk(child)
  }
  walk(node)
  return found
}

/** Concatenated text below a node (cell content is paragraph → text). */
function nodeText(node: DocNode): string {
  let text = ""
  const walk = (n: DocNode): void => {
    if (n.type === "text") text += n.text ?? ""
    for (const child of n.content ?? []) walk(child)
  }
  walk(node)
  return text
}

/** Cell text per row, e.g. [["AAA","BBB"],["CCC","DDD"]]. */
function tableRows(editor: Editor): string[][] {
  const doc = editor.state.doc.toJSON()
  return nodesOfType(doc, "tableRow").map((row) =>
    (row.content ?? [])
      .filter((child) => child.type === "tableCell" || child.type === "tableHeader")
      .map(nodeText),
  )
}

describe("insertCells — command registry", () => {
  it("is part of the RichTextCommand union and registry", () => {
    const command: RichTextCommand = "insertCells"
    expect(command).toBe("insertCells")
    expect(RICH_TEXT_COMMANDS).toContain("insertCells")
  })
})

describe("insertCells — OO dialog shift directions", () => {
  const editors: Editor[] = []

  afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy()
  })

  it("shift right: 2×2 → 2×3, blank column at the selected cell", () => {
    const editor = buildEditor(TABLE_2X2)
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "AAA")

    expect(dispatchRichTextCommand("insertCells", "right")).toBe(true)

    // The selected cell's content (and everything after it in the row)
    // moved one column right; the blank column sits where AAA used to be.
    expect(tableRows(editor)).toEqual([
      ["", "AAA", "BBB"],
      ["", "CCC", "DDD"],
    ])
  })

  it("shift down: 2×2 → 3×2, blank row at the selected cell", () => {
    const editor = buildEditor(TABLE_2X2)
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "AAA")

    expect(dispatchRichTextCommand("insertCells", "down")).toBe(true)

    // The selected row moved one row down; the blank row sits above it.
    expect(tableRows(editor)).toEqual([
      ["", ""],
      ["AAA", "BBB"],
      ["CCC", "DDD"],
    ])
  })

  it("shifts relative to whichever cell holds the cursor", () => {
    const editor = buildEditor(TABLE_2X2)
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "DDD")

    expect(dispatchRichTextCommand("insertCells", "right")).toBe(true)

    // Blank column before the selected cell's column (column 2) in every row.
    expect(tableRows(editor)).toEqual([
      ["AAA", "", "BBB"],
      ["CCC", "", "DDD"],
    ])
  })

  it.each<[InsertCellsDirection, string[][]]>([
    ["right", [["", "AAA", "BBB"], ["", "CCC", "DDD"]]],
    ["down", [["", ""], ["AAA", "BBB"], ["CCC", "DDD"]]],
  ])("insertTableCells(%s) applies the same shift directly", (direction, rows) => {
    const editor = buildEditor(TABLE_2X2)
    editors.push(editor)
    selectText(editor, "AAA")

    expect(insertTableCells(editor, direction)).toBe(true)
    expect(tableRows(editor)).toEqual(rows)
  })

  it("returns false outside a table", () => {
    const editor = buildEditor("<p>no table here</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "table")

    expect(dispatchRichTextCommand("insertCells", "right")).toBe(false)
    expect(dispatchRichTextCommand("insertCells", "down")).toBe(false)
  })
})

describe("insertCells — direction normalization", () => {
  it.each<[string | undefined, InsertCellsDirection]>([
    ["right", "right"],
    ["ShiftRight", "right"],
    ["shift-right", "right"],
    ["column", "right"],
    ["down", "down"],
    ["ShiftDown", "down"],
    ["shift-down", "down"],
    ["row", "down"],
    [undefined, DEFAULT_INSERT_CELLS_DIRECTION],
  ])("normalizes %s → %s", (value, direction) => {
    expect(normalizeInsertCellsDirection(value)).toBe(direction)
  })

  it("falls back to the dialog default for unknown values", () => {
    expect(DEFAULT_INSERT_CELLS_DIRECTION).toBe("right")
    expect(normalizeInsertCellsDirection("sideways")).toBe(DEFAULT_INSERT_CELLS_DIRECTION)
    expect(normalizeInsertCellsDirection(null)).toBe(DEFAULT_INSERT_CELLS_DIRECTION)
  })

  it("a dispatch without a value uses the default direction", () => {
    const editor = buildEditor(TABLE_2X2)
    setActiveRichTextEditor(editor)
    selectText(editor, "AAA")

    expect(dispatchRichTextCommand("insertCells")).toBe(true)
    expect(tableRows(editor)).toEqual([
      ["", "AAA", "BBB"],
      ["", "CCC", "DDD"],
    ])
    editor.destroy()
  })
})

describe("insertCells — TablePanel picker (OO dialog parity)", () => {
  function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
    const el = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === label,
    )
    expect(el, `button "${label}"`).toBeDefined()
    return el as HTMLButtonElement
  }

  it("renders the Insert Cells section with both shift directions", () => {
    const panel = mount(createElement(TablePanel, { visible: true }))

    expect(panel.textContent ?? "").toContain("Insert Cells")
    expect(buttonByText(panel, "Insert Cells Right")).toBeTruthy()
    expect(buttonByText(panel, "Insert Cells Down")).toBeTruthy()
  })

  it.each<[string, string]>([
    ["Insert Cells Right", "right"],
    ["Insert Cells Down", "down"],
  ])("%s dispatches wo-command insertCells %s", (label, value) => {
    const panel = mount(createElement(TablePanel, { visible: true }))

    act(() => buttonByText(panel, label).click())

    expect(woCommands).toEqual([{ command: "insertCells", value }])
  })

  it("is not rendered when the panel is hidden", () => {
    const panel = mount(createElement(TablePanel, { visible: false }))
    expect(panel.textContent ?? "").not.toContain("Insert Cells")
  })
})
