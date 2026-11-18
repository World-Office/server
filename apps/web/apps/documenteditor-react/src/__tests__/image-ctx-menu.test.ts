// @vitest-environment jsdom
/**
 * PGP-A2 — image context menu (OO ctx-contracts, image rows).
 *
 * Covers the OO image context contract (17 live-verified rows), the
 * wo-command / browser-side dispatches behind each row, and the new
 * Rotate / Actual Size / Replace / Save-as-image model changes
 * (rte-command.ts).
 */
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { act, createElement } from "react"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  IMAGE_CONTEXT_CONTRACT_ROWS,
  IMAGE_CONTEXT_ROWS,
  ImageContextMenu,
  isImageTarget,
} from "../components/ImageContextMenu"
import {
  ImageGeometry,
  dispatchRichTextCommand,
  findSelectedImage,
  resetImageToActualSize,
  rotateSelectedImage,
  setActiveRichTextEditor,
} from "../lib/rte-command"
import { createWordCommandHandler } from "../lib/word-commands"
import { documentStore } from "../stores/DocumentStore"

const wasmMocks = vi.hoisted(() => ({
  getWasmApi: vi.fn((): unknown => null),
}))

vi.mock("../lib/wasm-renderer", () => ({ getWasmApi: wasmMocks.getWasmApi }))

/**
 * Inline copy of the OO ctx-contract image rows (live-verified OO 9.4.0,
 * see config/port-graph-parity/tasks.json → PGP-A2). Keeping the copy here
 * makes a contract change fail loudly instead of silently dropping rows.
 */
const OO_IMAGE_CONTRACT_ROWS = [
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
  "Crop",
  "ActualSize",
  "ReplaceImage",
  "ImageSettings",
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
 * Editor surface hosting an image plus the other context-menu target
 * types (plain text, a table, a misspelled word).
 */
function editorHost(): HTMLDivElement {
  const host = document.createElement("div")
  host.className = "rich-text-editor"
  host.innerHTML =
    '<p id="plain">plain paragraph</p>' +
    '<p><img id="pic" src="x.png" alt="pic" /> trailing text</p>' +
    '<table><tbody><tr><td id="in-table">cell text</td></tr></tbody></table>' +
    '<p><span class="spellcheck-error" data-word="mispeld" id="misspelled">mispeld</span></p>'
  document.body.appendChild(host)
  appended.push(host)
  return host
}

/** Mount the menu and right-click on the image. */
function openMenuOnImage(): HTMLDivElement {
  const host = editorHost()
  const menuHost = mount(createElement(ImageContextMenu))
  const img = host.querySelector("#pic") as HTMLElement
  act(() => {
    img.dispatchEvent(
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
    extensions: [StarterKit.configure({ link: false }), ImageGeometry],
    content: html,
  })
}

/** Document position of the first image node. */
function imagePosition(editor: Editor): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1) return false
    if (node.type.name === "image") {
      found = pos
      return false
    }
    return true
  })
  expect(found, "no image in document").toBeGreaterThan(-1)
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

describe("image ctx menu — OO contract coverage", () => {
  it("declares exactly the 17 live-verified OO image rows", () => {
    expect(OO_IMAGE_CONTRACT_ROWS).toHaveLength(17)
    expect(IMAGE_CONTEXT_CONTRACT_ROWS).toEqual([...OO_IMAGE_CONTRACT_ROWS])
    expect(IMAGE_CONTEXT_ROWS.filter((row) => row.contract).map((row) => row.id)).toEqual([
      ...OO_IMAGE_CONTRACT_ROWS,
    ])
  })

  it("renders every contract row (missing rows are listed, not dropped)", () => {
    const menu = openMenuOnImage()
    const ids = rowIds(menu)
    const missing = OO_IMAGE_CONTRACT_ROWS.filter((id) => !ids.includes(id))
    expect(missing).toEqual([])
  })

  it("renders the contract rows in OO's order", () => {
    const menu = openMenuOnImage()
    const order = rowIds(menu).filter((id) =>
      (OO_IMAGE_CONTRACT_ROWS as readonly string[]).includes(id),
    )
    expect(order).toEqual([...OO_IMAGE_CONTRACT_ROWS])
  })

  it("shows the labels OO uses", () => {
    const menu = openMenuOnImage()
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
      "Crop",
      "Actual Size",
      "Replace Image",
      "Image Settings",
      "AI",
    ]) {
      expect(text).toContain(label)
    }
  })
})

describe("image ctx menu — trigger", () => {
  it("opens at the pointer position on right-click over an image", () => {
    const menu = openMenuOnImage().querySelector('[role="menu"]') as HTMLElement
    expect(menu.style.left).toBe("12px")
    expect(menu.style.top).toBe("34px")
  })

  it.each<[string, string]>([
    ["plain", "plain text (text menu owns it)"],
    ["in-table", "table cells (table menu owns them)"],
    ["misspelled", "misspelled words (spellcheck menu owns them)"],
  ])("stays closed for right-clicks on %s — %s", (elementId) => {
    const host = editorHost()
    const menuHost = mount(createElement(ImageContextMenu))
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

  it("opens for right-clicks on images outside the editor surface too (listens on document)", () => {
    const chrome = document.createElement("img")
    chrome.id = "chrome"
    chrome.src = "chrome.png"
    document.body.appendChild(chrome)
    appended.push(chrome)
    const menuHost = mount(createElement(ImageContextMenu))
    act(() => {
      chrome.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
      )
    })
    expect(menuHost.querySelector('[role="menu"]')).not.toBeNull()
  })

  it("isImageTarget only matches images outside tables / misspelled words", () => {
    const host = editorHost()
    expect(isImageTarget(host.querySelector("#pic"))).toBe(true)
    expect(isImageTarget(host.querySelector("#plain"))).toBe(false)
    expect(isImageTarget(host.querySelector("#in-table"))).toBe(false)
    expect(isImageTarget(host.querySelector("#misspelled"))).toBe(false)
    expect(isImageTarget(null)).toBe(false)
  })

  it("closes on Escape and on an outside mousedown", () => {
    const menuHost = openMenuOnImage()
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(menuHost.querySelector('[role="menu"]')).toBeNull()

    const secondHost = openMenuOnImage()
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    })
    expect(secondHost.querySelector('[role="menu"]')).toBeNull()
  })
})

describe("image ctx menu — command rows", () => {
  it.each<[string, string]>([
    ["Align", "alignObjects"],
    ["CombineShapes", "mergeShapes"],
    ["TextWrap", "textWrap"],
    ["Rotate", "rotateImage"],
    ["InsertCaption", "insertCaptionFigure"],
    ["SaveAsImage", "saveAsImage"],
    ["Link", "link"],
    ["Crop", "crop"],
    ["ActualSize", "actualSize"],
    ["ReplaceImage", "replaceImage"],
    ["ImageSettings", "image"],
    ["AI", "aiAssistant"],
  ])("%s dispatches wo-command %s", (rowId, command) => {
    const menu = openMenuOnImage()
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
    const menu = openMenuOnImage()
    act(() => menuItem(menu, rowId).click())
    expect(woCommands).toEqual([{ command, value: undefined }])
  })
})

describe("image ctx menu — browser-side rows (Cut/Copy/Paste/Print)", () => {
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
    const menu = openMenuOnImage()
    act(() => menuItem(menu, rowId).click())
    expect(execCalls).toEqual([action])
    expect(woCommands).toEqual([])
  })

  it("Print Selection prints natively", () => {
    const print = vi.fn()
    const previous = window.print
    window.print = print
    const menu = openMenuOnImage()
    act(() => menuItem(menu, "PrintSelection").click())
    window.print = previous
    expect(print).toHaveBeenCalledTimes(1)
    expect(woCommands).toEqual([])
  })

  it("command rows use wo-command, not execCommand", () => {
    const menu = openMenuOnImage()
    act(() => menuItem(menu, "Rotate").click())
    expect(execCalls).toEqual([])
    expect(woCommands).toEqual([{ command: "rotateImage", value: undefined }])
  })
})

describe("rotate / actual size / replace — model change", () => {
  const editors: Editor[] = []

  afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy()
  })

  function selectImage(editor: Editor): void {
    editor.commands.setNodeSelection(imagePosition(editor))
  }

  it("rotateImage turns the selected image by 90° (attr + CSS transform)", () => {
    const editor = buildEditor('<p>intro</p><img src="x.png" alt="pic" />')
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectImage(editor)

    expect(dispatchRichTextCommand("rotateImage")).toBe(true)

    expect(editor.getHTML()).toContain('data-rotation="90"')
    expect(editor.getHTML()).toContain("transform: rotate(90deg)")
    expect(nodesOfType(editor.state.doc.toJSON(), "image")[0].attrs?.rotation).toBe(90)
  })

  it("rotateImage honors an explicit value and wraps around 360°", () => {
    const editor = buildEditor('<img src="x.png" />')
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectImage(editor)

    expect(dispatchRichTextCommand("rotateImage", "180")).toBe(true)
    expect(nodesOfType(editor.state.doc.toJSON(), "image")[0].attrs?.rotation).toBe(180)

    expect(dispatchRichTextCommand("rotateImage", "270")).toBe(true)
    expect(nodesOfType(editor.state.doc.toJSON(), "image")[0].attrs?.rotation).toBe(90)

    expect(dispatchRichTextCommand("rotateImage", "-90")).toBe(true)
    expect(nodesOfType(editor.state.doc.toJSON(), "image")[0].attrs?.rotation).toBe(0)
    expect(editor.getHTML()).not.toContain("data-rotation")
  })

  it("rotation round-trips through the rendered HTML (save/load)", () => {
    const editor = buildEditor('<img src="x.png" />')
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectImage(editor)

    dispatchRichTextCommand("rotateImage")
    const html = editor.getHTML()
    expect(html).toContain('data-rotation="90"')

    editor.commands.setContent(html)
    expect(nodesOfType(editor.state.doc.toJSON(), "image")[0].attrs?.rotation).toBe(90)
  })

  it("actualSize clears the resized width/height (intrinsic rendering)", () => {
    const editor = buildEditor('<img src="x.png" />')
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectImage(editor)
    editor.commands.updateAttributes("image", { width: 200, height: 150 })

    expect(dispatchRichTextCommand("actualSize")).toBe(true)

    const attrs = nodesOfType(editor.state.doc.toJSON(), "image")[0].attrs ?? {}
    expect(attrs.width).toBeNull()
    expect(attrs.height).toBeNull()
  })

  it("actualSize restores a captured naturalWidth/naturalHeight", () => {
    const editor = buildEditor('<img src="x.png" />')
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectImage(editor)
    editor.commands.updateAttributes("image", {
      width: 200,
      height: 150,
      naturalWidth: 640,
      naturalHeight: 480,
    })

    expect(dispatchRichTextCommand("actualSize")).toBe(true)

    const attrs = nodesOfType(editor.state.doc.toJSON(), "image")[0].attrs ?? {}
    expect(attrs.width).toBe(640)
    expect(attrs.height).toBe(480)
    expect(editor.getHTML()).toContain('data-natural-width="640"')
    expect(editor.getHTML()).toContain('data-natural-height="480"')
  })

  it("actualSize round-trips the captured natural size through HTML", () => {
    const editor = buildEditor('<img src="x.png" data-natural-width="640" />')
    editors.push(editor)
    expect(nodesOfType(editor.state.doc.toJSON(), "image")[0].attrs?.naturalWidth).toBe(640)

    editor.commands.updateAttributes("image", { width: 320, naturalHeight: 480 })
    setActiveRichTextEditor(editor)
    selectImage(editor)
    dispatchRichTextCommand("actualSize")

    const attrs = nodesOfType(editor.state.doc.toJSON(), "image")[0].attrs ?? {}
    expect(attrs.width).toBe(640)
    expect(attrs.height).toBe(480)
  })

  it("replaceImage swaps the src and keeps the other attributes", () => {
    const editor = buildEditor('<img src="old.png" width="200" data-rotation="90" />')
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectImage(editor)

    expect(dispatchRichTextCommand("replaceImage", "new.png")).toBe(true)

    const attrs = nodesOfType(editor.state.doc.toJSON(), "image")[0].attrs ?? {}
    expect(attrs.src).toBe("new.png")
    expect(attrs.width).toBe(200)
    expect(attrs.rotation).toBe(90)
  })

  it("replaceImage without a value opens the image file picker", () => {
    const editor = buildEditor('<img src="old.png" />')
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectImage(editor)

    const picked: HTMLInputElement[] = []
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function (this: HTMLInputElement) {
        picked.push(this)
      })

    expect(dispatchRichTextCommand("replaceImage")).toBe(true)
    click.mockRestore()

    expect(picked).toHaveLength(1)
    expect(picked[0].type).toBe("file")
    expect(picked[0].accept).toBe("image/*")
    expect(nodesOfType(editor.state.doc.toJSON(), "image")[0].attrs?.src).toBe("old.png")
  })

  it("saveAsImage downloads the selected image's src", () => {
    const editor = buildEditor('<img src="https://example.test/pic.png" />')
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectImage(editor)

    const downloads: Array<{ href: string; download: string }> = []
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ href: this.href, download: this.download })
      })

    expect(dispatchRichTextCommand("saveAsImage")).toBe(true)
    click.mockRestore()

    expect(downloads).toEqual([{ href: "https://example.test/pic.png", download: "pic.png" }])
  })

  it("image rows return false when no image is selected", () => {
    const editor = buildEditor("<p>no image here</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)

    expect(dispatchRichTextCommand("rotateImage")).toBe(false)
    expect(dispatchRichTextCommand("actualSize")).toBe(false)
    expect(dispatchRichTextCommand("replaceImage", "new.png")).toBe(false)
    expect(dispatchRichTextCommand("saveAsImage")).toBe(false)
  })

  it("findSelectedImage works from a node selection and a covering range", () => {
    const editor = buildEditor('<p>intro</p><img src="x.png" /><p>outro</p>')
    editors.push(editor)

    editor.commands.setNodeSelection(imagePosition(editor))
    expect(findSelectedImage(editor)?.node.type.name).toBe("image")

    editor.commands.selectAll()
    expect(findSelectedImage(editor)?.node.type.name).toBe("image")
  })

  it("helpers stay safe without an active editor image", () => {
    const editor = buildEditor("<p>plain</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)

    expect(rotateSelectedImage(editor, 90)).toBe(false)
    expect(resetImageToActualSize(editor)).toBe(false)
  })
})

describe("image ctx menu — word-commands routing", () => {
  function handler(onRichTextCommand = vi.fn()) {
    return {
      handler: createWordCommandHandler({ editorRef: { current: null }, onRichTextCommand }),
      onRichTextCommand,
    }
  }

  it("routes the image model rows to the rich-text bridge", () => {
    const { handler: h, onRichTextCommand } = handler()
    h({ command: "rotateImage", value: "180" })
    h({ command: "actualSize" })
    h({ command: "replaceImage", value: "new.png" })
    h({ command: "saveAsImage" })
    h({ command: "insertCaptionFigure" })
    expect(onRichTextCommand).toHaveBeenNthCalledWith(1, "rotateImage", "180")
    expect(onRichTextCommand).toHaveBeenNthCalledWith(2, "actualSize", undefined)
    expect(onRichTextCommand).toHaveBeenNthCalledWith(3, "replaceImage", "new.png")
    expect(onRichTextCommand).toHaveBeenNthCalledWith(4, "saveAsImage", undefined)
    expect(onRichTextCommand).toHaveBeenNthCalledWith(5, "insertCaptionFigure", undefined)
  })

  it("Image Settings / Text Wrap / Crop open their settings surfaces", () => {
    const { handler: h } = handler()

    documentStore.activeRightPanel = null
    h({ command: "image" })
    expect(documentStore.activeRightPanel).toBe("image")

    documentStore.activeRightPanel = null
    h({ command: "textWrap" })
    expect(documentStore.activeRightPanel).toBe("paragraph")

    documentStore.activeRightPanel = null
    h({ command: "crop" })
    expect(documentStore.activeRightPanel).toBe("plugins")
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
