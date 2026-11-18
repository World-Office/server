// @vitest-environment jsdom
/**
 * List Settings + List Types — numbering-format picker and per-level
 * indent commands (OO dialogs "List Settings" and "List Types").
 *
 * Mirrors editor-contract.spec.tsx: a real TipTap editor is registered as
 * the active rich-text surface, commands go through the real
 * `dispatchRichTextCommand` entry point, and assertions run against the
 * ProseMirror document state (no layout).
 */
import type { ReactNode } from "react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { Editor } from "@tiptap/core"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { StylesPanel } from "../components/StylesPanel"
import {
  LIST_NUMBERING_FORMATS,
  type ListNumberingFormatId,
  dispatchRichTextCommand,
  normalizeListNumberingFormat,
  setActiveRichTextEditor,
} from "../lib/rte-command"
import { createWordCommandHandler } from "../lib/word-commands"

const wasmMocks = vi.hoisted(() => ({
  getWasmApi: vi.fn((): unknown => null),
}))

vi.mock("../lib/wasm-renderer", () => ({ getWasmApi: wasmMocks.getWasmApi }))

/**
 * Build a TipTap editor with the list-relevant production extensions
 * (StarterKit lists + task lists — the commands under test only touch
 * orderedList/bulletList/taskList/listItem nodes).
 */
function buildEditor(content: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content,
  })
}

/** Cursor position just inside the text of the nth list item (any kind). */
function textPos(editor: Editor, itemIndex: number): number {
  let item = 0
  let result = -1
  editor.state.doc.descendants((node, pos) => {
    if (result !== -1) return false
    if (node.type.name === "listItem" || node.type.name === "taskItem") {
      if (item === itemIndex) {
        node.descendants((child, cp) => {
          if (result !== -1) return false
          if (child.isText) result = pos + cp + 2
          return result === -1
        })
        return false
      }
      item += 1
    }
    return true
  })
  return result
}

/** Depth-first `type` values of every orderedList in the JSON doc. */
function orderedListTypes(node: { type?: string; attrs?: { type?: string | null }; content?: unknown[] }): Array<string | null> {
  const found: Array<string | null> = []
  const walk = (n: typeof node): void => {
    if (n.type === "orderedList") found.push(n.attrs?.type ?? null)
    for (const child of n.content ?? []) walk(child as typeof node)
  }
  for (const child of node.content ?? []) walk(child as typeof node)
  return found
}

describe("list settings — numbering format command", () => {
  const editors: Editor[] = []

  afterEach(() => {
    for (const ed of editors.splice(0)) ed.destroy()
    setActiveRichTextEditor(null)
  })

  it.each<[ListNumberingFormatId, string]>([
    ["decimal", "1"],
    ["lowerAlpha", "a"],
    ["upperAlpha", "A"],
    ["lowerRoman", "i"],
    ["upperRoman", "I"],
  ])("orderedList gets attrs.type %s → %s", (formatId, marker) => {
    const editor = buildEditor("<ol><li>first</li><li>second</li></ol>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setTextSelection(3)

    expect(dispatchRichTextCommand("listNumberingStyle", formatId)).toBe(true)

    const json = editor.state.doc.toJSON().content[0]
    expect(json.type).toBe("orderedList")
    expect(json.attrs.type).toBe(marker)
  })

  it("rendered ol reflects the numbering format", () => {
    const editor = buildEditor("<ol><li>first</li><li>second</li></ol>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setTextSelection(3)

    dispatchRichTextCommand("listNumberingStyle", "lowerAlpha")

    expect(editor.getHTML()).toContain('<ol type="a">')
  })

  it("converts a bullet list to a numbered list with the chosen format", () => {
    const editor = buildEditor("<ul><li>first</li><li>second</li></ul>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setTextSelection(3)

    expect(dispatchRichTextCommand("listNumberingStyle", "lowerRoman")).toBe(true)

    const json = editor.state.doc.toJSON().content[0]
    expect(json.type).toBe("orderedList")
    expect(json.attrs.type).toBe("i")
    expect(editor.getHTML()).toContain('<ol type="i">')
  })

  it("converts a task list to a numbered list with the chosen format", () => {
    const editor = buildEditor(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>todo</p></div></li></ul>',
    )
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setTextSelection(textPos(editor, 0))

    expect(dispatchRichTextCommand("listNumberingStyle", "decimal")).toBe(true)

    const json = editor.state.doc.toJSON().content[0]
    expect(json.type).toBe("orderedList")
    expect(json.attrs.type).toBe("1")
  })

  it("starts a numbered list from a plain paragraph", () => {
    const editor = buildEditor("<p>plain text</p>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setTextSelection(2)

    expect(dispatchRichTextCommand("listNumberingStyle", "decimal")).toBe(true)

    const json = editor.state.doc.toJSON().content[0]
    expect(json.type).toBe("orderedList")
    expect(json.attrs.type).toBe("1")
  })

  it("sets the format on the nested (per-level) orderedList only", () => {
    const editor = buildEditor("<ol><li>outer<ol><li>inner</li></ol></li><li>outer2</li></ol>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setTextSelection(textPos(editor, 1))

    dispatchRichTextCommand("listNumberingStyle", "upperAlpha")

    // outer list keeps the default, the nested (per-level) list gets "A"
    expect(orderedListTypes(editor.state.doc.toJSON())).toEqual([null, "A"])
  })

  it("returns false for an unknown numbering format", () => {
    const editor = buildEditor("<ol><li>first</li></ol>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setTextSelection(3)

    expect(dispatchRichTextCommand("listNumberingStyle", "emoji")).toBe(false)
    expect(editor.state.doc.toJSON().content[0].attrs.type).toBeNull()
  })
})

describe("list settings — level indent command", () => {
  const editors: Editor[] = []

  afterEach(() => {
    for (const ed of editors.splice(0)) ed.destroy()
    setActiveRichTextEditor(null)
  })

  it("indent down nests the selected item under the previous one", () => {
    const editor = buildEditor("<ul><li>first</li><li>second</li></ul>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setTextSelection(textPos(editor, 1))

    expect(dispatchRichTextCommand("listIndent", "down")).toBe(true)

    const json = editor.state.doc.toJSON().content[0]
    // "second" is now a nested list inside the first list item
    expect(json.type).toBe("bulletList")
    const firstItem = json.content[0]
    expect(firstItem.content).toHaveLength(2)
    expect(firstItem.content[1].type).toBe("bulletList")
    expect(firstItem.content[1].content[0].content[0].content[0].text).toBe("second")
  })

  it("indent up lifts a nested item back to the top level", () => {
    const editor = buildEditor("<ul><li>first<ul><li>second</li></ul></li></ul>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setTextSelection(textPos(editor, 1))

    expect(dispatchRichTextCommand("listIndent", "up")).toBe(true)

    const json = editor.state.doc.toJSON().content[0]
    expect(json.content).toHaveLength(2)
    expect(json.content.every((n: { type: string }) => n.type === "listItem")).toBe(true)
  })

  it("indent down on the first item is a safe no-op returning false", () => {
    const editor = buildEditor("<ol><li>first</li><li>second</li></ol>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setTextSelection(textPos(editor, 0))

    expect(dispatchRichTextCommand("listIndent", "down")).toBe(false)
    expect(editor.state.doc.toJSON().content[0].content).toHaveLength(2)
  })

  it("returns false for an unknown indent direction", () => {
    const editor = buildEditor("<ul><li>first</li></ul>")
    editors.push(editor)
    setActiveRichTextEditor(editor)
    editor.commands.setTextSelection(3)

    expect(dispatchRichTextCommand("listIndent", "sideways")).toBe(false)
  })
})

describe("list types — StylesPanel picker", () => {
  const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
      act(() => root.unmount())
      container.remove()
    }
  })

  function mount(node: ReactNode): HTMLDivElement {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(node))
    mounted.push({ root, container })
    return container
  }

  it("renders the list-style buttons (Bulleted / Numbered / Task + indents)", () => {
    const container = mount(createElement(StylesPanel, { visible: true, onCommand: () => {} }))
    const text = container.textContent ?? ""
    expect(text).toContain("List Styles")
    expect(text).toContain("Bulleted")
    expect(text).toContain("Numbered")
    expect(text).toContain("Task")
    expect(text).toContain("Numbering format")
    expect(text).toContain("Increase Indent")
    expect(text).toContain("Decrease Indent")
  })

  it("renders every numbering-format marker", () => {
    const container = mount(createElement(StylesPanel, { visible: true, onCommand: () => {} }))
    const text = container.textContent ?? ""
    for (const id of Object.keys(LIST_NUMBERING_FORMATS) as ListNumberingFormatId[]) {
      expect(text).toContain(LIST_NUMBERING_FORMATS[id].example)
    }
  })

  it("clicking Numbered dispatches listNumberingStyle decimal", () => {
    const onCommand = vi.fn()
    const container = mount(createElement(StylesPanel, { visible: true, onCommand }))
    const numbered = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Numbered",
    )
    expect(numbered).toBeDefined()
    act(() => numbered!.click())
    expect(onCommand).toHaveBeenCalledWith("listNumberingStyle", "decimal")
  })

  it("clicking a numbering-format marker dispatches listNumberingStyle with its id", () => {
    const onCommand = vi.fn()
    const container = mount(createElement(StylesPanel, { visible: true, onCommand }))
    const roman = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === LIST_NUMBERING_FORMATS.lowerRoman.example,
    )
    expect(roman).toBeDefined()
    act(() => roman!.click())
    expect(onCommand).toHaveBeenCalledWith("listNumberingStyle", "lowerRoman")
  })

  it("clicking the indent buttons dispatches listIndent down/up", () => {
    const onCommand = vi.fn()
    const container = mount(createElement(StylesPanel, { visible: true, onCommand }))
    const buttons = [...container.querySelectorAll("button")]
    act(() => buttons.find((b) => b.textContent === "Increase Indent")!.click())
    act(() => buttons.find((b) => b.textContent === "Decrease Indent")!.click())
    expect(onCommand).toHaveBeenCalledWith("listIndent", "down")
    expect(onCommand).toHaveBeenCalledWith("listIndent", "up")
  })

  it("clicking Bulleted / Task dispatches the list-type toggles", () => {
    const onCommand = vi.fn()
    const container = mount(createElement(StylesPanel, { visible: true, onCommand }))
    const buttons = [...container.querySelectorAll("button")]
    act(() => buttons.find((b) => b.textContent === "Bulleted")!.click())
    act(() => buttons.find((b) => b.textContent === "Task")!.click())
    expect(onCommand).toHaveBeenCalledWith("bulletList", undefined)
    expect(onCommand).toHaveBeenCalledWith("taskList", undefined)
  })

  it("is hidden when not visible", () => {
    const container = mount(createElement(StylesPanel, { visible: false, onCommand: () => {} }))
    expect(container.textContent ?? "").toBe("")
  })
})

describe("list settings — format metadata + normalizer", () => {
  it("exposes five numbering formats with markers and examples", () => {
    const ids = Object.keys(LIST_NUMBERING_FORMATS)
    expect(ids).toHaveLength(5)
    for (const id of ids as ListNumberingFormatId[]) {
      expect(LIST_NUMBERING_FORMATS[id].id).toBe(id)
      expect(LIST_NUMBERING_FORMATS[id].marker).toMatch(/^(1|a|A|i|I)$/)
      expect(LIST_NUMBERING_FORMATS[id].example.length).toBeGreaterThan(0)
    }
  })

  it("normalizeListNumberingFormat accepts ids, css names and raw markers", () => {
    expect(normalizeListNumberingFormat("lowerAlpha")).toBe("lowerAlpha")
    expect(normalizeListNumberingFormat("lower-alpha")).toBe("lowerAlpha")
    expect(normalizeListNumberingFormat("a")).toBe("lowerAlpha")
    expect(normalizeListNumberingFormat("decimal")).toBe("decimal")
    expect(normalizeListNumberingFormat("upper-roman")).toBe("upperRoman")
    expect(normalizeListNumberingFormat("I")).toBe("upperRoman")
    expect(normalizeListNumberingFormat(undefined)).toBeNull()
    expect(normalizeListNumberingFormat("nope")).toBeNull()
  })
})

describe("list settings — word-commands routing", () => {
  it("routes listNumberingStyle / listIndent to the rich-text bridge", () => {
    const onRichTextCommand = vi.fn()
    const handler = createWordCommandHandler({
      editorRef: { current: null },
      onRichTextCommand,
      onFind: vi.fn(),
    })

    handler({ command: "listNumberingStyle", value: "lowerAlpha" })
    handler({ command: "listIndent", value: "down" })

    expect(onRichTextCommand).toHaveBeenCalledTimes(2)
    expect(onRichTextCommand).toHaveBeenNthCalledWith(1, "listNumberingStyle", "lowerAlpha")
    expect(onRichTextCommand).toHaveBeenNthCalledWith(2, "listIndent", "down")
  })
})
