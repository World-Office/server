// @vitest-environment jsdom
/**
 * PGP-A3 — shape context menu (OO ctx-contracts, shape rows).
 *
 * Covers the OO shape context contract (15 live-verified rows), the
 * wo-command / browser-side dispatches behind each row, and the new
 * shape node model (rte-command.ts): ShapeNode block atom, shape
 * rotation and Save-as-image.
 */
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { act, createElement } from "react"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  SHAPE_CONTEXT_CONTRACT_ROWS,
  SHAPE_CONTEXT_ROWS,
  ShapeContextMenu,
  isShapeTarget,
} from "../components/ShapeContextMenu"
import {
  ShapeNode,
  dispatchRichTextCommand,
  findSelectedShape,
  rotateSelectedShape,
  setActiveRichTextEditor,
} from "../lib/rte-command"
import { createWordCommandHandler } from "../lib/word-commands"
import { documentStore } from "../stores/DocumentStore"

const wasmMocks = vi.hoisted(() => ({
  getWasmApi: vi.fn((): unknown => null),
}))

vi.mock("../lib/wasm-renderer", () => ({ getWasmApi: wasmMocks.getWasmApi }))

/**
 * Inline copy of the OO ctx-contract shape rows (live-verified OO 9.4.0,
 * see config/port-graph-parity/tasks.json → PGP-A3). Keeping the copy here
 * makes a contract change fail loudly instead of silently dropping rows.
 */
const OO_SHAPE_CONTRACT_ROWS = [
  "Cut",
  "Copy",
  "Paste",
  "PrintSelection",
  "Arrange",
  "Align",
  "CombineShapes",
  "TextWrap",
  "Rotate",
  "InsertCaption",
  "SaveAsImage",
  "Link",
  "EditPoints",
  "ShapeSettings",
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
  documentStore.activeRightPanel = null
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

/**
 * Editor surface hosting a shape plus the other context-menu target types
 * (plain text, an image, a table, a misspelled word).
 */
function editorHost(): HTMLDivElement {
  const host = document.createElement("div")
  host.className = "rich-text-editor"
  host.innerHTML =
    '<p id="plain">plain paragraph</p>' +
    '<div class="wo-shape" data-wo-shape="true" data-shape-type="rect" id="shape"></div>' +
    '<p><img id="pic" src="x.png" alt="pic" /> trailing text</p>' +
    '<table><tbody><tr><td id="in-table">cell text</td></tr></tbody></table>' +
    '<p><span class="spellcheck-error" data-word="mispeld" id="misspelled">mispeld</span></p>'
  document.body.appendChild(host)
  appended.push(host)
  return host
}

/** Mount the menu and right-click on the shape. */
function openMenuOnShape(): HTMLDivElement {
  const host = editorHost()
  const menuHost = mount(createElement(ShapeContextMenu))
  const shape = host.querySelector("#shape") as HTMLElement
  act(() => {
    shape.dispatchEvent(
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

function buildEditor(html: string): Editor {
  return new Editor({
    extensions: [StarterKit.configure({ link: false }), ShapeNode],
    content: html,
  })
}

const SHAPE_HTML =
  '<p>intro</p><div data-wo-shape data-shape-type="rect" data-fill="#ff0000" style="width: 200px; height: 100px"></div>'

/** Document position of the first shape node. */
function shapePosition(editor: Editor): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1) return false
    if (node.type.name === "shape") {
      found = pos
      return false
    }
    return true
  })
  expect(found, "no shape in document").toBeGreaterThan(-1)
  return found
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

describe("shape ctx menu — OO contract coverage", () => {
  it("declares exactly the 15 live-verified OO shape rows", () => {
    expect(OO_SHAPE_CONTRACT_ROWS).toHaveLength(15)
    expect(SHAPE_CONTEXT_CONTRACT_ROWS).toEqual([...OO_SHAPE_CONTRACT_ROWS])
    expect(SHAPE_CONTEXT_ROWS.filter((row) => row.contract).map((row) => row.id)).toEqual([
      ...OO_SHAPE_CONTRACT_ROWS,
    ])
  })

  it("renders every contract row (missing rows are listed, not dropped)", () => {
    const menu = openMenuOnShape()
    const ids = rowIds(menu)
    const missing = OO_SHAPE_CONTRACT_ROWS.filter((id) => !ids.includes(id))
    expect(missing).toEqual([])
  })

  it("renders the contract rows in OO's order", () => {
    const menu = openMenuOnShape()
    const order = rowIds(menu).filter((id) =>
      (OO_SHAPE_CONTRACT_ROWS as readonly string[]).includes(id),
    )
    expect(order).toEqual([...OO_SHAPE_CONTRACT_ROWS])
  })

  it("shows the labels OO uses", () => {
    const menu = openMenuOnShape()
    const text = menu.textContent ?? ""
    for (const label of [
      "Cut",
      "Copy",
      "Paste",
      "Print Selection",
      "Arrange",
      "Align",
      "Combine Shapes",
      "Text Wrap",
      "Rotate",
      "Insert Caption",
      "Save as Image",
      "Link",
      "Edit Points",
      "Shape Settings",
      "AI",
    ]) {
      expect(text).toContain(label)
    }
  })
})

describe("shape ctx menu — trigger", () => {
  it("opens at the pointer position on right-click over a shape", () => {
    const menu = openMenuOnShape().querySelector('[role="menu"]') as HTMLElement
    expect(menu.style.left).toBe("12px")
    expect(menu.style.top).toBe("34px")
  })

  it.each<[string, string]>([
    ["plain", "plain text (text menu owns it)"],
    ["pic", "images (image menu owns them)"],
    ["in-table", "table cells (table menu owns them)"],
    ["misspelled", "misspelled words (spellcheck menu owns them)"],
  ])("stays closed for right-clicks on %s — %s", (elementId) => {
    const host = editorHost()
    const menuHost = mount(createElement(ShapeContextMenu))
    act(() => {
      host.querySelector(`#${elementId}`)?.dispatchEvent(
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

  it("opens for right-clicks on shapes outside the editor surface too (listens on document)", () => {
    const chrome = document.createElement("div")
    chrome.id = "chrome"
    chrome.setAttribute("data-wo-shape", "true")
    document.body.appendChild(chrome)
    appended.push(chrome)
    const menuHost = mount(createElement(ShapeContextMenu))
    act(() => {
      chrome.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
      )
    })
    expect(menuHost.querySelector('[role="menu"]')).not.toBeNull()
  })

  it("isShapeTarget only matches shapes, not tables / images / misspelled words", () => {
    const host = editorHost()
    expect(isShapeTarget(host.querySelector("#shape"))).toBe(true)
    expect(isShapeTarget(host.querySelector("#plain"))).toBe(false)
    expect(isShapeTarget(host.querySelector("#pic"))).toBe(false)
    expect(isShapeTarget(host.querySelector("#in-table"))).toBe(false)
    expect(isShapeTarget(host.querySelector("#misspelled"))).toBe(false)
    expect(isShapeTarget(null)).toBe(false)
  })

  it("closes on Escape and on an outside mousedown", () => {
    const menuHost = openMenuOnShape()
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(menuHost.querySelector('[role="menu"]')).toBeNull()

    const secondHost = openMenuOnShape()
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    })
    expect(secondHost.querySelector('[role="menu"]')).toBeNull()
  })
})

describe("shape ctx menu — command rows", () => {
  it.each<[string, string]>([
    ["Align", "alignObjects"],
    ["CombineShapes", "mergeShapes"],
    ["TextWrap", "textWrap"],
    ["Rotate", "rotateShape"],
    ["InsertCaption", "insertCaptionFigure"],
    ["SaveAsImage", "saveAsImage"],
    ["Link", "link"],
    ["EditPoints", "editPoints"],
    ["ShapeSettings", "shape"],
    ["AI", "aiAssistant"],
  ])("%s dispatches wo-command %s", (rowId, command) => {
    const menu = openMenuOnShape()
    act(() => menuItem(menu, rowId).click())
    expect(woCommands).toEqual([{ command, value: undefined }])
    // choosing an action closes the menu (OO dismisses on select)
    expect(menu.querySelector('[role="menu"]')).toBeNull()
  })

  it.each<[string, string]>([
    ["bringForward", "bringForward"],
    ["sendBackward", "sendBackward"],
    ["alignObjects", "alignObjects"],
  ])("Arrange sub-row %s dispatches the arrange command", (rowId, command) => {
    const menu = openMenuOnShape()
    act(() => menuItem(menu, rowId).click())
    expect(woCommands).toEqual([{ command, value: undefined }])
  })
})

describe("shape ctx menu — browser-side rows (Cut/Copy/Paste/Print)", () => {
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
  ])("%s runs the native execCommand %s", (rowId, action) => {
    const menu = openMenuOnShape()
    act(() => menuItem(menu, rowId).click())
    expect(execCalls).toEqual([action])
    expect(woCommands).toEqual([])
  })

  it("Print Selection prints natively", () => {
    const print = vi.fn()
    const previous = window.print
    window.print = print
    const menu = openMenuOnShape()
    act(() => menuItem(menu, "PrintSelection").click())
    window.print = previous
    expect(print).toHaveBeenCalledTimes(1)
    expect(woCommands).toEqual([])
  })

  it("command rows use wo-command, not execCommand", () => {
    const menu = openMenuOnShape()
    act(() => menuItem(menu, "Rotate").click())
    expect(execCalls).toEqual([])
    expect(woCommands).toEqual([{ command: "rotateShape", value: undefined }])
  })
})

describe("shape node model — rotation / save-as-image (PGP-A3)", () => {
  const editors: Editor[] = []

  afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy()
  })

  function selectShape(editor: Editor): void {
    editor.commands.setNodeSelection(shapePosition(editor))
  }

  it("parses the shape node out of the document HTML (attrs + markers)", () => {
    const editor = buildEditor(SHAPE_HTML)
    editors.push(editor)

    const shape = nodesOfType(editor.state.doc.toJSON(), "shape")[0]
    expect(shape.attrs?.shapeType).toBe("rect")
    expect(shape.attrs?.fill).toBe("#ff0000")
    expect(shape.attrs?.width).toBe(200)
    expect(shape.attrs?.height).toBe(100)
    // round-trip: the rendered HTML keeps the ctx-menu target markers
    const html = editor.getHTML()
    expect(html).toContain("wo-shape")
    expect(html).toContain('data-wo-shape="true"')
    expect(html).toContain('data-shape-type="rect"')
  })

  it("rotateShape turns the selected shape by 90° (attr + CSS transform)", () => {
    const editor = buildEditor(SHAPE_HTML)
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectShape(editor)

    expect(dispatchRichTextCommand("rotateShape")).toBe(true)

    expect(editor.getHTML()).toContain('data-rotation="90"')
    expect(editor.getHTML()).toContain("transform: rotate(90deg)")
    expect(nodesOfType(editor.state.doc.toJSON(), "shape")[0].attrs?.rotation).toBe(90)
  })

  it("rotateShape honors an explicit value and wraps around 360°", () => {
    const editor = buildEditor(SHAPE_HTML)
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectShape(editor)

    expect(dispatchRichTextCommand("rotateShape", "180")).toBe(true)
    expect(nodesOfType(editor.state.doc.toJSON(), "shape")[0].attrs?.rotation).toBe(180)

    expect(dispatchRichTextCommand("rotateShape", "270")).toBe(true)
    expect(nodesOfType(editor.state.doc.toJSON(), "shape")[0].attrs?.rotation).toBe(90)

    expect(dispatchRichTextCommand("rotateShape", "-90")).toBe(true)
    expect(nodesOfType(editor.state.doc.toJSON(), "shape")[0].attrs?.rotation).toBe(0)
    expect(editor.getHTML()).not.toContain("data-rotation")
  })

  it("rotation round-trips through the rendered HTML (save/load)", () => {
    const editor = buildEditor(SHAPE_HTML)
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectShape(editor)

    dispatchRichTextCommand("rotateShape")
    const html = editor.getHTML()
    expect(html).toContain('data-rotation="90"')

    editor.commands.setContent(html)
    expect(nodesOfType(editor.state.doc.toJSON(), "shape")[0].attrs?.rotation).toBe(90)
  })

  it("rotateSelectedShape reports failure with no shape selected", () => {
    const editor = buildEditor("<p>no shapes here</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)

    expect(rotateSelectedShape(editor, 90)).toBe(false)
    expect(dispatchRichTextCommand("rotateShape")).toBe(false)
    expect(findSelectedShape(editor)).toBeNull()
  })

  it("Save as Image downloads the selected shape as an SVG file", () => {
    const downloads: Array<{ href: string; download: string }> = []
    function recordAnchorClick(this: HTMLAnchorElement): void {
      downloads.push({
        href: this.getAttribute("href") ?? "",
        download: this.getAttribute("download") ?? "",
      })
    }
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(recordAnchorClick)

    const editor = buildEditor(SHAPE_HTML)
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectShape(editor)

    try {
      expect(dispatchRichTextCommand("saveAsImage")).toBe(true)
    } finally {
      clickSpy.mockRestore()
    }

    expect(downloads).toHaveLength(1)
    expect(downloads[0].download).toBe("shape-rect.svg")
    expect(downloads[0].href.startsWith("data:image/svg+xml")).toBe(true)
    const svg = decodeURIComponent(downloads[0].href)
    expect(svg).toContain('<rect width="200" height="100" fill="#ff0000"')
  })

  it("saveAsImage reports failure with nothing selected", () => {
    const editor = buildEditor("<p>no objects here</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)

    expect(dispatchRichTextCommand("saveAsImage")).toBe(false)
  })
})

describe("shape ctx menu — word-commands routing", () => {
  function handler(onRichTextCommand = vi.fn()) {
    return {
      handler: createWordCommandHandler({ editorRef: { current: null }, onRichTextCommand }),
      onRichTextCommand,
    }
  }

  it("routes the shape model rows to the rich-text bridge", () => {
    const { handler: h, onRichTextCommand } = handler()
    h({ command: "rotateShape", value: "180" })
    h({ command: "saveAsImage" })
    h({ command: "insertCaptionFigure" })
    expect(onRichTextCommand).toHaveBeenNthCalledWith(1, "rotateShape", "180")
    expect(onRichTextCommand).toHaveBeenNthCalledWith(2, "saveAsImage", undefined)
    expect(onRichTextCommand).toHaveBeenNthCalledWith(3, "insertCaptionFigure", undefined)
  })

  it("Shape Settings / Edit Points / Text Wrap open their settings surfaces", () => {
    const { handler: h } = handler()

    documentStore.activeRightPanel = null
    h({ command: "shape" })
    expect(documentStore.activeRightPanel).toBe("shape")

    documentStore.activeRightPanel = null
    h({ command: "editPoints" })
    expect(documentStore.activeRightPanel).toBe("shape")

    documentStore.activeRightPanel = null
    h({ command: "textWrap" })
    expect(documentStore.activeRightPanel).toBe("paragraph")
  })

  it("Link opens the cross-reference panel and AI the assistant panel", () => {
    const { handler: h } = handler()

    documentStore.activeRightPanel = null
    h({ command: "link" })
    expect(documentStore.activeRightPanel).toBe("crossreference")

    documentStore.activeRightPanel = null
    h({ command: "aiAssistant" })
    expect(documentStore.activeRightPanel).toBe("ai-assistant")
  })
})
