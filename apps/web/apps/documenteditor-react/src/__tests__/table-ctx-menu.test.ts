// @vitest-environment jsdom
/**
 * PGP-1 — table context menu (OO ctx-contracts, table rows).
 *
 * Covers the OO table context contract (17 live-verified rows), the
 * wo-command / browser-side dispatches behind each row, and the new
 * Distribute Rows / Distribute Columns model changes (rte-command.ts).
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
import {
  TABLE_CONTEXT_CONTRACT_ROWS,
  TABLE_CONTEXT_ROWS,
  TableContextMenu,
  isTableTarget,
} from "../components/TableContextMenu"
import {
  TableRowHeight,
  dispatchRichTextCommand,
  distributeTableColumns,
  distributeTableRows,
  setActiveRichTextEditor,
} from "../lib/rte-command"
import { createWordCommandHandler } from "../lib/word-commands"
import { documentStore } from "../stores/DocumentStore"

const wasmMocks = vi.hoisted(() => ({
  getWasmApi: vi.fn((): unknown => null),
}))

vi.mock("../lib/wasm-renderer", () => ({ getWasmApi: wasmMocks.getWasmApi }))

/**
 * Inline copy of the OO ctx-contract table rows (live-verified OO 9.4.0,
 * see config/port-graph-parity/tasks.json → PGP-1). Keeping the copy here
 * makes a contract change fail loudly instead of silently dropping rows.
 */
const OO_TABLE_CONTRACT_ROWS = [
  "Cut",
  "Copy",
  "Paste",
  "PrintSelection",
  "Select",
  "Delete",
  "MergeCells",
  "SplitCell",
  "DistributeRows",
  "DistributeColumns",
  "TextAlignment",
  "InsertCaption",
  "TableProperties",
  "Link",
  "ParagraphSettings",
  "FormattingAsStyle",
  "AI",
] as const

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

/** Editor surface hosting a paragraph plus a 1×1 table. */
function editorHost(): HTMLDivElement {
  const host = document.createElement("div")
  host.innerHTML =
    '<p>plain paragraph</p><table><tbody><tr><td id="in-table">cell text</td></tr></tbody></table>'
  document.body.appendChild(host)
  appended.push(host)
  return host
}

/** Mount the menu and right-click inside the table cell. */
function openMenuInTable(): HTMLDivElement {
  const host = editorHost()
  const menuHost = mount(createElement(TableContextMenu))
  const cell = host.querySelector("#in-table") as HTMLElement
  act(() => {
    cell.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 34 }),
    )
  })
  expect(menuHost.querySelector('[role="menu"]')).not.toBeNull()
  return menuHost
}

function menuItem(container: HTMLElement, rowId: string): HTMLButtonElement {
  const el = container.querySelector(`button[data-row-id="${rowId}"]`)
  expect(el, `menu row ${rowId}`).toBeDefined()
  return el as HTMLButtonElement
}

function rowIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-row-id]")).map((el) =>
    el.getAttribute("data-row-id"),
  ) as string[]
}

/** Table with unequal columns: 100px + 200px (header) and unset body cells. */
const TABLE_HTML =
  '<table><tbody><tr><th colwidth="100"><p>Head A</p></th>' +
  '<th colwidth="200"><p>Head B</p></th></tr>' +
  "<tr><td><p>one</p></td><td><p>two</p></td></tr></tbody></table>"

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

describe("table ctx menu — OO contract coverage", () => {
  it("declares exactly the 17 live-verified OO table rows", () => {
    expect(OO_TABLE_CONTRACT_ROWS).toHaveLength(17)
    expect(TABLE_CONTEXT_CONTRACT_ROWS).toEqual([...OO_TABLE_CONTRACT_ROWS])
    expect(TABLE_CONTEXT_ROWS.filter((row) => row.contract).map((row) => row.id)).toEqual([
      ...OO_TABLE_CONTRACT_ROWS,
    ])
  })

  it("renders every contract row (missing rows are listed, not dropped)", () => {
    const menu = openMenuInTable()
    const ids = rowIds(menu)
    const missing = OO_TABLE_CONTRACT_ROWS.filter((id) => !ids.includes(id))
    expect(missing).toEqual([])
  })

  it("renders the contract rows in OO's order", () => {
    const menu = openMenuInTable()
    const order = rowIds(menu).filter((id) =>
      (OO_TABLE_CONTRACT_ROWS as readonly string[]).includes(id),
    )
    expect(order).toEqual([...OO_TABLE_CONTRACT_ROWS])
  })

  it("shows the labels OO uses", () => {
    const menu = openMenuInTable()
    const text = menu.textContent ?? ""
    for (const label of [
      "Cut",
      "Copy",
      "Paste",
      "Print Selection",
      "Select All",
      "Merge Cells",
      "Split Cell",
      "Distribute Rows",
      "Distribute Columns",
      "Text Alignment",
      "Insert Caption",
      "Table Properties",
      "Link",
      "Paragraph Settings",
      "Formatting as Style",
      "AI",
    ]) {
      expect(text).toContain(label)
    }
  })
})

describe("table ctx menu — trigger", () => {
  it("opens at the pointer position on right-click inside a table", () => {
    const menu = openMenuInTable().querySelector('[role="menu"]') as HTMLElement
    expect(menu.style.left).toBe("12px")
    expect(menu.style.top).toBe("34px")
  })

  it("stays closed for right-clicks outside a table", () => {
    const host = editorHost()
    const menuHost = mount(createElement(TableContextMenu))
    act(() => {
      host.querySelector("p")?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 5,
          clientY: 5,
        }),
      )
    })
    expect(menuHost.querySelector('[role="menu"]')).toBeNull()
  })

  it("isTableTarget only matches table content", () => {
    const host = editorHost()
    const cell = host.querySelector("#in-table") as HTMLElement
    expect(isTableTarget(cell)).toBe(true)
    expect(isTableTarget(host.querySelector("p"))).toBe(false)
    expect(isTableTarget(null)).toBe(false)
  })

  it("closes on Escape and on an outside mousedown", () => {
    const menuHost = openMenuInTable()
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(menuHost.querySelector('[role="menu"]')).toBeNull()

    const secondHost = openMenuInTable()
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    })
    expect(secondHost.querySelector('[role="menu"]')).toBeNull()
  })
})

describe("table ctx menu — command rows", () => {
  it.each<[string, string]>([
    ["MergeCells", "mergeCells"],
    ["SplitCell", "splitCell"],
    ["DistributeRows", "distributeRows"],
    ["DistributeColumns", "distributeColumns"],
    ["InsertCaption", "insertCaptionTable"],
    ["TableProperties", "tableProperties"],
    ["Link", "link"],
    ["ParagraphSettings", "paragraphSettings"],
    ["FormattingAsStyle", "formattingAsStyle"],
    ["AI", "aiAssistant"],
  ])("%s dispatches wo-command %s", (rowId, command) => {
    const menu = openMenuInTable()
    act(() => menuItem(menu, rowId).click())
    expect(woCommands).toEqual([{ command, value: undefined }])
    // choosing an action closes the menu (OO dismisses on select)
    expect(menu.querySelector('[role="menu"]')).toBeNull()
  })

  it.each<[string, string]>([
    ["alignLeft", "alignLeft"],
    ["alignCenter", "alignCenter"],
    ["alignRight", "alignRight"],
    ["alignJustify", "alignJustify"],
  ])("TextAlignment sub-row %s dispatches the alignment command", (rowId, command) => {
    const menu = openMenuInTable()
    act(() => menuItem(menu, rowId).click())
    expect(woCommands).toEqual([{ command, value: undefined }])
  })

  it.each<[string, string]>([
    ["deleteRow", "deleteRow"],
    ["deleteColumn", "deleteColumn"],
    ["deleteTable", "deleteTable"],
  ])("Delete sub-row %s dispatches the table op", (rowId, command) => {
    const menu = openMenuInTable()
    act(() => menuItem(menu, rowId).click())
    expect(woCommands).toEqual([{ command, value: undefined }])
  })

  it.each<[string, string]>([
    ["insertRowBefore", "addRowBefore"],
    ["insertRowAfter", "addRowAfter"],
    ["insertColumnBefore", "addColumnBefore"],
    ["insertColumnAfter", "addColumnAfter"],
  ])("extra structure row %s re-uses the existing command", (rowId, command) => {
    const menu = openMenuInTable()
    act(() => menuItem(menu, rowId).click())
    expect(woCommands).toEqual([{ command, value: undefined }])
  })
})

describe("table ctx menu — browser-side rows (Cut/Copy/Paste/Print/Select)", () => {
  // jsdom ships no execCommand implementation — install a recording stub.
  const execCalls: string[] = []
  let previousExec: ((command: string, showUI?: boolean, value?: string) => boolean) | undefined

  beforeEach(() => {
    execCalls.length = 0
    previousExec = document.execCommand
    document.execCommand = (command: string) => {
      execCalls.push(command)
      return true
    }
  })

  afterEach(() => {
    if (previousExec === undefined) Reflect.deleteProperty(document as object, "execCommand")
    else document.execCommand = previousExec
  })

  it.each<[string, string]>([
    ["Cut", "cut"],
    ["Copy", "copy"],
    ["Paste", "paste"],
    ["Select", "selectAll"],
  ])("%s runs the native execCommand %s", (rowId, action) => {
    const menu = openMenuInTable()
    act(() => menuItem(menu, rowId).click())
    expect(execCalls).toEqual([action])
    expect(woCommands).toEqual([])
  })

  it("Print Selection prints natively", () => {
    const print = vi.fn()
    const previous = window.print
    window.print = print
    const menu = openMenuInTable()
    act(() => menuItem(menu, "PrintSelection").click())
    window.print = previous
    expect(print).toHaveBeenCalledTimes(1)
    expect(woCommands).toEqual([])
  })

  it("Delete sub-rows use the editor commands, not execCommand", () => {
    const menu = openMenuInTable()
    act(() => menuItem(menu, "deleteRow").click())
    expect(execCalls).toEqual([])
    expect(woCommands).toEqual([{ command: "deleteRow", value: undefined }])
  })
})

describe("distribute rows / columns — model change", () => {
  const editors: Editor[] = []

  afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy()
  })

  it("distributeColumns equalizes every column width", () => {
    const editor = buildEditor(TABLE_HTML)
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "one")

    expect(dispatchRichTextCommand("distributeColumns")).toBe(true)

    const doc = editor.state.doc.toJSON()
    const cells = nodesOfType(doc, "tableCell").concat(nodesOfType(doc, "tableHeader"))
    expect(cells).toHaveLength(4)
    for (const cell of cells) expect(cell.attrs?.colwidth).toEqual([150])
    expect(editor.getHTML()).toContain('colwidth="150"')
  })

  it("distributeRows gives every row the same height", () => {
    const editor = buildEditor(TABLE_HTML)
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "Head A")

    expect(dispatchRichTextCommand("distributeRows")).toBe(true)

    const rows = nodesOfType(editor.state.doc.toJSON(), "tableRow")
    expect(rows).toHaveLength(2)
    const heights = rows.map((row) => row.attrs?.rowHeight)
    expect(new Set(heights).size).toBe(1)
    expect(heights[0]).toBe(24) // headless: no layout → the min row height
    expect(editor.getHTML()).toContain('data-row-height="24"')
    expect(editor.getHTML()).toContain("height: 24px")
  })

  it("distribute keeps the taller row height when the model already has one", () => {
    const editor = buildEditor(
      '<table><tbody><tr data-row-height="80"><td><p>tall</p></td></tr>' +
        "<tr><td><p>short</p></td></tr></tbody></table>",
    )
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "short")

    expect(distributeTableRows(editor)).toBe(true)

    const rows = nodesOfType(editor.state.doc.toJSON(), "tableRow")
    expect(rows.map((row) => row.attrs?.rowHeight)).toEqual([80, 80])
  })

  it("distribute is a no-op (true) when everything is already equal", () => {
    const editor = buildEditor(TABLE_HTML)
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "one")
    distributeTableColumns(editor)
    const before = editor.state.doc.toJSON()

    expect(distributeTableColumns(editor)).toBe(true)
    expect(editor.state.doc.toJSON()).toEqual(before)
  })

  it("returns false outside a table", () => {
    const editor = buildEditor("<p>no table here</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "table")

    expect(dispatchRichTextCommand("distributeRows")).toBe(false)
    expect(dispatchRichTextCommand("distributeColumns")).toBe(false)
  })
})

describe("table ctx menu — word-commands routing", () => {
  function handler(onRichTextCommand = vi.fn()) {
    return {
      handler: createWordCommandHandler({ editorRef: { current: null }, onRichTextCommand }),
      onRichTextCommand,
    }
  }

  it("routes Distribute Rows / Columns to the rich-text bridge", () => {
    const { handler: h, onRichTextCommand } = handler()
    h({ command: "distributeRows" })
    h({ command: "distributeColumns" })
    expect(onRichTextCommand).toHaveBeenNthCalledWith(1, "distributeRows", undefined)
    expect(onRichTextCommand).toHaveBeenNthCalledWith(2, "distributeColumns", undefined)
  })

  it("Table Properties / Paragraph Settings open their settings panels", () => {
    const { handler: h } = handler()
    documentStore.activeRightPanel = null

    h({ command: "tableProperties" })
    expect(documentStore.activeRightPanel).toBe("table")

    h({ command: "paragraphSettings" })
    expect(documentStore.activeRightPanel).toBe("paragraph")
  })

  it("Print Selection prints the document", () => {
    const print = vi.fn()
    const previous = window.print
    window.print = print
    const { handler: h } = handler()

    h({ command: "printSelection" })

    window.print = previous
    expect(print).toHaveBeenCalledTimes(1)
  })
})
