// @vitest-environment jsdom
/**
 * PGP-A1 — text context menu (OO ctx-contracts, text rows).
 *
 * Covers the OO text context contract (11 live-verified rows), the
 * wo-command / browser-side dispatches behind each row, and the new
 * PageBreakBefore / KeepLines paragraph pagination model changes
 * (rte-command.ts).
 */
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { act, createElement } from "react"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  TEXT_CONTEXT_CONTRACT_ROWS,
  TEXT_CONTEXT_ROWS,
  TextContextMenu,
  isTextTarget,
} from "../components/TextContextMenu"
import {
  ParagraphPaginationExtension,
  dispatchRichTextCommand,
  normalizePaginationToggle,
  setActiveRichTextEditor,
} from "../lib/rte-command"
import { createWordCommandHandler } from "../lib/word-commands"
import { documentStore } from "../stores/DocumentStore"

const wasmMocks = vi.hoisted(() => ({
  getWasmApi: vi.fn((): unknown => null),
}))

vi.mock("../lib/wasm-renderer", () => ({ getWasmApi: wasmMocks.getWasmApi }))

/**
 * Inline copy of the OO ctx-contract text rows (live-verified OO 9.4.0,
 * see census/ctx-contracts.json → text / config/port-graph-parity/tasks.json
 * → PGP-A1). Keeping the copy here makes a contract change fail loudly
 * instead of silently dropping rows.
 */
const OO_TEXT_CONTRACT_ROWS = [
  "Cut",
  "Copy",
  "Paste",
  "PrintSelection",
  "PageBreakBefore",
  "KeepLines",
  "ParagraphSettings",
  "AddComment",
  "Link",
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

/**
 * Editor surface hosting plain text, a table, an image and a misspelled
 * word — one element per context-menu target type.
 */
function editorHost(): HTMLDivElement {
  const host = document.createElement("div")
  host.className = "rich-text-editor"
  host.innerHTML =
    '<p id="plain">plain paragraph</p>' +
    '<table><tbody><tr><td id="in-table">cell text</td></tr></tbody></table>' +
    '<p><img id="pic" src="x.png" alt="pic" /> trailing text</p>' +
    '<p><span class="spellcheck-error" data-word="mispeld" id="misspelled">mispeld</span></p>'
  document.body.appendChild(host)
  appended.push(host)
  return host
}

/** Mount the menu and right-click on the plain paragraph. */
function openMenuOnText(): HTMLDivElement {
  const host = editorHost()
  const menuHost = mount(createElement(TextContextMenu))
  const para = host.querySelector("#plain") as HTMLElement
  act(() => {
    para.dispatchEvent(
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
    extensions: [StarterKit.configure({ link: false }), ParagraphPaginationExtension],
    content: html,
  })
}

/** Cursor position of the first occurrence of `text`. */
function textPosition(editor: Editor, text: string): number {
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
  return found
}

/** Put the cursor on the first occurrence of `text`. */
function selectText(editor: Editor, text: string): void {
  editor.commands.setTextSelection(textPosition(editor, text))
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

describe("text ctx menu — OO contract coverage", () => {
  it("declares exactly the 11 live-verified OO text rows", () => {
    expect(OO_TEXT_CONTRACT_ROWS).toHaveLength(11)
    expect(TEXT_CONTEXT_CONTRACT_ROWS).toEqual([...OO_TEXT_CONTRACT_ROWS])
    expect(TEXT_CONTEXT_ROWS.filter((row) => row.contract).map((row) => row.id)).toEqual([
      ...OO_TEXT_CONTRACT_ROWS,
    ])
  })

  it("renders every contract row (missing rows are listed, not dropped)", () => {
    const menu = openMenuOnText()
    const ids = rowIds(menu)
    const missing = OO_TEXT_CONTRACT_ROWS.filter((id) => !ids.includes(id))
    expect(missing).toEqual([])
  })

  it("renders the contract rows in OO's order", () => {
    const menu = openMenuOnText()
    expect(rowIds(menu)).toEqual([...OO_TEXT_CONTRACT_ROWS])
  })

  it("shows the labels OO uses", () => {
    const menu = openMenuOnText()
    const text = menu.textContent ?? ""
    for (const label of [
      "Cut",
      "Copy",
      "Paste",
      "Print Selection",
      "Page Break Before",
      "Keep Lines Together",
      "Paragraph Settings",
      "Add Comment",
      "Link",
      "Formatting as Style",
      "AI",
    ]) {
      expect(text).toContain(label)
    }
  })
})

describe("text ctx menu — trigger", () => {
  it("opens at the pointer position on right-click over text", () => {
    const menu = openMenuOnText().querySelector('[role="menu"]') as HTMLElement
    expect(menu.style.left).toBe("12px")
    expect(menu.style.top).toBe("34px")
  })

  it.each<[string, string]>([
    ["in-table", "table cells (table menu owns them)"],
    ["pic", "images (image menu owns them)"],
    ["misspelled", "misspelled words (spellcheck menu owns them)"],
  ])("stays closed for right-clicks on %s — %s", (elementId) => {
    const host = editorHost()
    const menuHost = mount(createElement(TextContextMenu))
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

  it("stays closed for right-clicks outside the editor surface", () => {
    const chrome = document.createElement("p")
    chrome.id = "chrome"
    chrome.textContent = "app chrome text"
    document.body.appendChild(chrome)
    appended.push(chrome)
    const menuHost = mount(createElement(TextContextMenu))
    act(() => {
      chrome.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
      )
    })
    expect(menuHost.querySelector('[role="menu"]')).toBeNull()
  })

  it("isTextTarget only matches plain text in the editor surface", () => {
    const host = editorHost()
    expect(isTextTarget(host.querySelector("#plain"))).toBe(true)
    expect(isTextTarget(host.querySelector("#in-table"))).toBe(false)
    expect(isTextTarget(host.querySelector("#pic"))).toBe(false)
    expect(isTextTarget(host.querySelector("#misspelled"))).toBe(false)
    expect(isTextTarget(null)).toBe(false)
  })

  it("closes on Escape and on an outside mousedown", () => {
    const menuHost = openMenuOnText()
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(menuHost.querySelector('[role="menu"]')).toBeNull()

    const secondHost = openMenuOnText()
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    })
    expect(secondHost.querySelector('[role="menu"]')).toBeNull()
  })
})

describe("text ctx menu — command rows", () => {
  it.each<[string, string]>([
    ["PageBreakBefore", "pageBreakBefore"],
    ["KeepLines", "keepLines"],
    ["ParagraphSettings", "paragraphSettings"],
    ["AddComment", "addComment"],
    ["Link", "link"],
    ["FormattingAsStyle", "formattingAsStyle"],
    ["AI", "aiAssistant"],
  ])("%s dispatches wo-command %s", (rowId, command) => {
    const menu = openMenuOnText()
    act(() => menuItem(menu, rowId).click())
    expect(woCommands).toEqual([{ command, value: undefined }])
    // choosing an action closes the menu (OO dismisses on select)
    expect(menu.querySelector('[role="menu"]')).toBeNull()
  })
})

describe("text ctx menu — browser-side rows (Cut/Copy/Paste/Print)", () => {
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
    const menu = openMenuOnText()
    act(() => menuItem(menu, rowId).click())
    expect(execCalls).toEqual([action])
    expect(woCommands).toEqual([])
  })

  it("Print Selection prints natively", () => {
    const print = vi.fn()
    const previous = window.print
    window.print = print
    const menu = openMenuOnText()
    act(() => menuItem(menu, "PrintSelection").click())
    window.print = previous
    expect(print).toHaveBeenCalledTimes(1)
    expect(woCommands).toEqual([])
  })

  it("command rows use wo-command, not execCommand", () => {
    const menu = openMenuOnText()
    act(() => menuItem(menu, "KeepLines").click())
    expect(execCalls).toEqual([])
    expect(woCommands).toEqual([{ command: "keepLines", value: undefined }])
  })
})

describe("pageBreakBefore / keepLines — model change", () => {
  const editors: Editor[] = []

  afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy()
  })

  it("keepLines marks the paragraph as keep-together (attr + CSS hint)", () => {
    const editor = buildEditor("<p>one</p><p>two</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "one")

    expect(dispatchRichTextCommand("keepLines")).toBe(true)

    expect(editor.getHTML()).toContain('data-keep-lines="true"')
    expect(editor.getHTML()).toContain("break-inside: avoid")
    const paragraphs = nodesOfType(editor.state.doc.toJSON(), "paragraph")
    expect(paragraphs.map((p) => p.attrs?.keepLines)).toEqual([true, false])
  })

  it("pageBreakBefore marks the paragraph (attr + CSS hint)", () => {
    const editor = buildEditor("<p>one</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "one")

    expect(dispatchRichTextCommand("pageBreakBefore")).toBe(true)

    expect(editor.getHTML()).toContain('data-page-break-before="true"')
    expect(editor.getHTML()).toContain("break-before: page")
    expect(nodesOfType(editor.state.doc.toJSON(), "paragraph")[0].attrs?.pageBreakBefore).toBe(true)
  })

  it("both rows are toggles — a second dispatch turns them off", () => {
    const editor = buildEditor("<p>one</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "one")

    expect(dispatchRichTextCommand("keepLines")).toBe(true)
    expect(dispatchRichTextCommand("keepLines")).toBe(true)
    expect(editor.getHTML()).not.toContain("data-keep-lines")

    expect(dispatchRichTextCommand("pageBreakBefore")).toBe(true)
    expect(dispatchRichTextCommand("pageBreakBefore")).toBe(true)
    expect(editor.getHTML()).not.toContain("data-page-break-before")
  })

  it("applies to every paragraph covered by a range selection", () => {
    const editor = buildEditor("<p>one</p><p>two</p><p>three</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setTextSelection({
      from: textPosition(editor, "one"),
      to: textPosition(editor, "two"),
    })

    expect(dispatchRichTextCommand("keepLines")).toBe(true)

    const paragraphs = nodesOfType(editor.state.doc.toJSON(), "paragraph")
    expect(paragraphs.map((p) => p.attrs?.keepLines)).toEqual([true, true, false])
  })

  it("an explicit value forces the state instead of toggling", () => {
    const editor = buildEditor("<p>one</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "one")

    expect(dispatchRichTextCommand("keepLines", "true")).toBe(true)
    expect(dispatchRichTextCommand("keepLines", "true")).toBe(true)
    expect(editor.getHTML()).toContain('data-keep-lines="true"')
    expect(dispatchRichTextCommand("keepLines", "false")).toBe(true)
    expect(editor.getHTML()).not.toContain("data-keep-lines")
  })

  it("round-trips through the rendered HTML (save/load)", () => {
    const editor = buildEditor("<p>fresh</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setContent('<p data-keep-lines="true" data-page-break-before="true">kept</p>')
    selectText(editor, "kept")

    const paragraphs = nodesOfType(editor.state.doc.toJSON(), "paragraph")
    expect(paragraphs[0].attrs?.keepLines).toBe(true)
    expect(paragraphs[0].attrs?.pageBreakBefore).toBe(true)

    // toggling a parsed-on paragraph turns it back off
    expect(dispatchRichTextCommand("keepLines")).toBe(true)
    expect(editor.getHTML()).not.toContain("data-keep-lines")
    expect(editor.getHTML()).toContain('data-page-break-before="true"')
  })

  it("returns false where no paragraph context exists (code block)", () => {
    const editor = buildEditor("<pre><code>code block</code></pre>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    selectText(editor, "code")

    expect(dispatchRichTextCommand("keepLines")).toBe(false)
    expect(dispatchRichTextCommand("pageBreakBefore")).toBe(false)
  })

  it("normalizePaginationToggle maps explicit values and falls back to toggle", () => {
    expect(normalizePaginationToggle("true")).toBe(true)
    expect(normalizePaginationToggle("ON")).toBe(true)
    expect(normalizePaginationToggle("false")).toBe(false)
    expect(normalizePaginationToggle("off")).toBe(false)
    expect(normalizePaginationToggle(undefined)).toBeNull()
    expect(normalizePaginationToggle("banana")).toBeNull()
  })
})

describe("text ctx menu — word-commands routing", () => {
  function handler(onRichTextCommand = vi.fn()) {
    return {
      handler: createWordCommandHandler({ editorRef: { current: null }, onRichTextCommand }),
      onRichTextCommand,
    }
  }

  it("routes Page Break Before / Keep Lines to the rich-text bridge", () => {
    const { handler: h, onRichTextCommand } = handler()
    h({ command: "pageBreakBefore", value: "true" })
    h({ command: "keepLines" })
    expect(onRichTextCommand).toHaveBeenNthCalledWith(1, "pageBreakBefore", "true")
    expect(onRichTextCommand).toHaveBeenNthCalledWith(2, "keepLines", undefined)
  })

  it("Paragraph Settings / Add Comment open their settings panels", () => {
    const { handler: h } = handler()
    documentStore.activeRightPanel = null

    h({ command: "paragraphSettings" })
    expect(documentStore.activeRightPanel).toBe("paragraph")

    documentStore.activeRightPanel = null
    h({ command: "addComment" })
    expect(documentStore.activeRightPanel).toBe("comments")
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
