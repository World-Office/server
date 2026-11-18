// @vitest-environment jsdom
/**
 * PGP-2 — Notes Remove: remove all footnotes/endnotes.
 *
 * Covers:
 *   removeAllFootnotesCommand — drops every footnoteSection/footnoteItem and
 *                               every footnoteReference mark (reference run
 *                               deleted, text that only carried the mark kept)
 *   removeAllEndnotesCommand  — drops every endnote mark with its reference
 *                               text, leaves footnotes alone
 *   removeAllNotesCommand     — both, as a single undo step
 *   rte-command               — the "removeAll*" commands are part of the
 *                               RichTextCommand surface and dispatchable
 *   word-commands             — routes the commands to the rich-text bridge
 *   CrossReferencePanel       — the "Notes Remove" buttons dispatch wo-command
 *
 * Mirrors lib-marks.test.ts / list-settings.test.ts: a real headless TipTap
 * editor (StarterKit + the note extensions), no mocking of the extension layer.
 * The fixture document is built through the production insert commands.
 */
import type { ReactNode } from "react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CrossReferencePanel } from "../components/CrossReferencePanel"
import { EndnoteMark, insertEndnoteCommand, removeAllEndnotesCommand } from "../lib/endnote-mark"
import {
  FootnoteItem,
  FootnoteReference,
  FootnoteSection,
  insertFootnoteCommand,
  removeAllFootnotesCommand,
} from "../lib/footnote-mark"
import { removeAllNotesCommand } from "../lib/remove-notes"
import {
  RICH_TEXT_COMMANDS,
  dispatchRichTextCommand,
  setActiveRichTextEditor,
} from "../lib/rte-command"
import { createWordCommandHandler } from "../lib/word-commands"

const wasmMocks = vi.hoisted(() => ({
  getWasmApi: vi.fn((): unknown => null),
}))

vi.mock("../lib/wasm-renderer", () => ({ getWasmApi: wasmMocks.getWasmApi }))

// ── Helpers ────────────────────────────────────────────────────────

const editors: Editor[] = []

function makeEditor(content = "<p>hello world</p>"): Editor {
  const ed = new Editor({
    extensions: [StarterKit, FootnoteReference, FootnoteItem, FootnoteSection, EndnoteMark],
    content,
  })
  editors.push(ed)
  return ed
}

afterEach(() => {
  for (const ed of editors.splice(0)) ed.destroy()
  setActiveRichTextEditor(null)
})

/** Number of nodes of a type name in the document. */
function countNodes(ed: Editor, typeName: string): number {
  let count = 0
  ed.state.doc.descendants((node) => {
    if (node.type.name === typeName) count += 1
    return true
  })
  return count
}

/** Number of inline runs carrying the given mark type name. */
function countMarkedRuns(ed: Editor, markName: string): number {
  let count = 0
  ed.state.doc.descendants((node) => {
    if (node.isInline && node.marks.some((mark) => mark.type.name === markName)) count += 1
    return true
  })
  return count
}

/** Text of the first inline run carrying the given mark type name. */
function markedRunText(ed: Editor, markName: string): string | null {
  let text: string | null = null
  ed.state.doc.descendants((node) => {
    if (text !== null) return false
    if (node.isInline && node.marks.some((mark) => mark.type.name === markName)) {
      text = node.text ?? ""
      return false
    }
    return true
  })
  return text
}

/**
 * Document with two footnotes (one reference inserted at a collapsed cursor,
 * one mark applied over a real selection) and one endnote — the fixture the
 * OO "Notes Remove" dialog wipes. Built through the production insert
 * commands, so the shapes match what the editor really produces.
 */
function makeNoteEditor(): Editor {
  const ed = makeEditor("<p>hello world</p>")

  // endnote — reference mark carrying its own (generated) text
  ed.chain().focus().setTextSelection({ from: 12, to: 12 }).run()
  expect(insertEndnoteCommand(ed)).toBe(true)

  // footnote #1 — collapsed cursor → zero-width-space reference run
  ed.chain().focus().setTextSelection({ from: 6, to: 6 }).run()
  expect(insertFootnoteCommand(ed)).toBe(true)

  // footnote #2 — reference mark applied over the selection "hello"
  ed.chain().focus().setTextSelection({ from: 1, to: 6 }).run()
  expect(insertFootnoteCommand(ed)).toBe(true)

  expect(countNodes(ed, "footnoteSection")).toBe(1)
  expect(countNodes(ed, "footnoteItem")).toBe(2)
  expect(countMarkedRuns(ed, "footnoteReference")).toBe(2)
  expect(countMarkedRuns(ed, "endnote")).toBe(1)
  return ed
}

// ── removeAllFootnotesCommand ──────────────────────────────────────

describe("removeAllFootnotesCommand", () => {
  it("removes every footnote section, item and reference mark", () => {
    const ed = makeNoteEditor()

    expect(removeAllFootnotesCommand(ed)).toBe(true)

    expect(countNodes(ed, "footnoteSection")).toBe(0)
    expect(countNodes(ed, "footnoteItem")).toBe(0)
    expect(countMarkedRuns(ed, "footnoteReference")).toBe(0)
    const html = ed.getHTML()
    expect(html).not.toContain("footnote")
    expect(html).not.toContain("Footnote content")
  })

  it("keeps body text that only carried the mark, deletes the reference run", () => {
    const ed = makeNoteEditor()
    const endnoteText = markedRunText(ed, "endnote")

    removeAllFootnotesCommand(ed)

    // "hello" only carried the mark → its text stays; the zero-width-space
    // reference run disappears together with the mark.
    const text = ed.state.doc.textContent
    expect(text).toContain("hello")
    expect(text).toContain("world")
    expect(text).not.toContain("\u200B")
    expect(text).toContain(endnoteText ?? "")
  })

  it("leaves endnotes alone", () => {
    const ed = makeNoteEditor()
    removeAllFootnotesCommand(ed)

    expect(countMarkedRuns(ed, "endnote")).toBe(1)
    expect(ed.getHTML()).toContain("data-endnote-id")
  })

  it("deletes a reference number run (a parsed document's stored number)", () => {
    const ed = makeEditor()
    ed.commands.setContent(
      ed.schema.nodes.doc.create({}, [
        ed.schema.nodes.paragraph.create({}, [
          ed.schema.text("see"),
          ed.schema.text("3", [ed.schema.marks.footnoteReference.create({ id: "fn-9" })]),
          ed.schema.text(" above"),
        ]),
        ed.schema.nodes.footnoteSection.create({}, [
          ed.schema.nodes.footnoteItem.create(
            { id: "fn-9", number: 3 },
            ed.schema.text("Third note"),
          ),
        ]),
      ]),
    )
    expect(countMarkedRuns(ed, "footnoteReference")).toBe(1)

    removeAllFootnotesCommand(ed)

    expect(countMarkedRuns(ed, "footnoteReference")).toBe(0)
    expect(countNodes(ed, "footnoteSection")).toBe(0)
    // the stored "3" belongs to the reference, not to the body text
    expect(ed.state.doc.textContent).toBe("see above")
  })

  it("is a no-op (no dispatch) on a document without footnotes", () => {
    const ed = makeEditor("<p>plain</p>")
    const before = ed.state.doc.toJSON()

    expect(removeAllFootnotesCommand(ed)).toBe(true)
    expect(ed.state.doc.toJSON()).toEqual(before)
  })

  it("removes everything in a single transaction (one undo step)", () => {
    const ed = makeNoteEditor()
    const dispatch = vi.spyOn(ed.view, "dispatch")

    removeAllFootnotesCommand(ed)

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]?.[0].steps.length).toBeGreaterThan(0)
    dispatch.mockRestore()
  })

  it("undo brings the removed footnotes back", () => {
    const ed = makeNoteEditor()

    removeAllFootnotesCommand(ed)
    expect(countMarkedRuns(ed, "footnoteReference")).toBe(0)

    ed.chain().focus().undo().run()
    expect(countMarkedRuns(ed, "footnoteReference")).toBeGreaterThan(0)
    expect(countNodes(ed, "footnoteSection")).toBe(1)
    expect(countNodes(ed, "footnoteItem")).toBeGreaterThan(0)
  })
})

// ── removeAllEndnotesCommand ───────────────────────────────────────

describe("removeAllEndnotesCommand", () => {
  it("removes every endnote mark together with its reference text", () => {
    const ed = makeNoteEditor()
    const endnoteText = markedRunText(ed, "endnote")
    expect(endnoteText).toBeTruthy()

    expect(removeAllEndnotesCommand(ed)).toBe(true)

    expect(countMarkedRuns(ed, "endnote")).toBe(0)
    const html = ed.getHTML()
    expect(html).not.toContain("data-endnote-id")
    expect(html).not.toContain("endnote-ref")
    // the superscript text was the reference; the anchor text is body content
    expect(ed.state.doc.textContent).not.toContain(endnoteText ?? "")
    expect(ed.state.doc.textContent).toContain("world")
  })

  it("leaves footnotes alone", () => {
    const ed = makeNoteEditor()
    removeAllEndnotesCommand(ed)

    expect(countNodes(ed, "footnoteSection")).toBe(1)
    expect(countNodes(ed, "footnoteItem")).toBe(2)
    expect(countMarkedRuns(ed, "footnoteReference")).toBe(2)
  })

  it("is a no-op (no dispatch) on a document without endnotes", () => {
    const ed = makeEditor("<p>plain</p>")
    const before = ed.state.doc.toJSON()

    expect(removeAllEndnotesCommand(ed)).toBe(true)
    expect(ed.state.doc.toJSON()).toEqual(before)
  })
})

// ── removeAllNotesCommand ──────────────────────────────────────────

describe("removeAllNotesCommand", () => {
  it("removes footnotes and endnotes in one transaction", () => {
    const ed = makeNoteEditor()
    const dispatch = vi.spyOn(ed.view, "dispatch")

    expect(removeAllNotesCommand(ed)).toBe(true)
    expect(countMarkedRuns(ed, "footnoteReference")).toBe(0)
    expect(countMarkedRuns(ed, "endnote")).toBe(0)
    expect(countNodes(ed, "footnoteSection")).toBe(0)
    expect(countNodes(ed, "footnoteItem")).toBe(0)

    // both note kinds go in a single transaction → a single undo step
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]?.[0].steps.length).toBeGreaterThan(0)
    dispatch.mockRestore()
  })

  it("undo brings the removed notes back", () => {
    const ed = makeNoteEditor()

    removeAllNotesCommand(ed)
    expect(countMarkedRuns(ed, "endnote")).toBe(0)

    ed.chain().focus().undo().run()
    expect(countMarkedRuns(ed, "footnoteReference")).toBeGreaterThan(0)
    expect(countMarkedRuns(ed, "endnote")).toBeGreaterThan(0)
  })
})

// ── rte-command surface ────────────────────────────────────────────

describe("rich-text command bridge", () => {
  it("registers the three commands in RICH_TEXT_COMMANDS", () => {
    expect(RICH_TEXT_COMMANDS).toContain("removeAllFootnotes")
    expect(RICH_TEXT_COMMANDS).toContain("removeAllEndnotes")
    expect(RICH_TEXT_COMMANDS).toContain("removeAllNotes")
  })

  it("dispatchRichTextCommand('removeAllFootnotes') clears every footnote", () => {
    const ed = makeNoteEditor()
    setActiveRichTextEditor(ed)

    expect(dispatchRichTextCommand("removeAllFootnotes")).toBe(true)
    expect(countMarkedRuns(ed, "footnoteReference")).toBe(0)
    expect(countNodes(ed, "footnoteSection")).toBe(0)
  })

  it("dispatchRichTextCommand('removeAllEndnotes') clears every endnote", () => {
    const ed = makeNoteEditor()
    setActiveRichTextEditor(ed)

    expect(dispatchRichTextCommand("removeAllEndnotes")).toBe(true)
    expect(countMarkedRuns(ed, "endnote")).toBe(0)
    expect(countMarkedRuns(ed, "footnoteReference")).toBe(2)
  })

  it("dispatchRichTextCommand('removeAllNotes') clears both note kinds", () => {
    const ed = makeNoteEditor()
    setActiveRichTextEditor(ed)

    expect(dispatchRichTextCommand("removeAllNotes")).toBe(true)
    expect(countMarkedRuns(ed, "footnoteReference")).toBe(0)
    expect(countMarkedRuns(ed, "endnote")).toBe(0)
  })
})

// ── word-commands routing ──────────────────────────────────────────

describe("word-commands routing", () => {
  it("routes the Notes Remove commands to the rich-text bridge", () => {
    const onRichTextCommand = vi.fn()
    const handler = createWordCommandHandler({
      editorRef: { current: null },
      onRichTextCommand,
      onFind: vi.fn(),
    })

    handler({ command: "removeAllFootnotes" })
    handler({ command: "removeAllEndnotes" })
    handler({ command: "removeAllNotes" })

    expect(onRichTextCommand).toHaveBeenCalledTimes(3)
    expect(onRichTextCommand).toHaveBeenNthCalledWith(1, "removeAllFootnotes", undefined)
    expect(onRichTextCommand).toHaveBeenNthCalledWith(2, "removeAllEndnotes", undefined)
    expect(onRichTextCommand).toHaveBeenNthCalledWith(3, "removeAllNotes", undefined)
  })

  it("does not fall through to the unhandled-command warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const handler = createWordCommandHandler({
      editorRef: { current: null },
      onRichTextCommand: vi.fn(),
      onFind: vi.fn(),
    })

    handler({ command: "removeAllFootnotes" })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

// ── CrossReferencePanel surface ────────────────────────────────────

describe("CrossReferencePanel notes-remove buttons", () => {
  const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []
  const woCommands: Array<{ command: string; value?: string }> = []

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    woCommands.length = 0
    window.addEventListener("wo-command", recordWoCommand)
  })

  afterEach(() => {
    window.removeEventListener("wo-command", recordWoCommand)
    for (const { root, container } of mounted.splice(0)) {
      act(() => root.unmount())
      container.remove()
    }
  })

  function recordWoCommand(e: Event): void {
    const detail = (e as CustomEvent<{ command: string; value?: string }>).detail
    woCommands.push({ command: detail.command, value: detail.value })
  }

  function mount(node: ReactNode): HTMLDivElement {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(node))
    mounted.push({ root, container })
    return container
  }

  function button(container: HTMLElement, label: string): HTMLButtonElement {
    const found = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === label,
    ) as HTMLButtonElement | undefined
    expect(found, `button ${label}`).toBeDefined()
    return found!
  }

  it("renders the Notes Remove buttons", () => {
    const container = mount(
      createElement(CrossReferencePanel, { visible: true, onInsertCrossReference: () => {} }),
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Notes")
    expect(text).toContain("Remove All Footnotes")
    expect(text).toContain("Remove All Endnotes")
    expect(text).toContain("Remove All Notes")
  })

  it("dispatches wo-command for each Notes Remove button", () => {
    const container = mount(
      createElement(CrossReferencePanel, { visible: true, onInsertCrossReference: () => {} }),
    )

    act(() => {
      button(container, "Remove All Footnotes").click()
    })
    act(() => {
      button(container, "Remove All Endnotes").click()
    })
    act(() => {
      button(container, "Remove All Notes").click()
    })

    expect(woCommands.map((c) => c.command)).toEqual([
      "removeAllFootnotes",
      "removeAllEndnotes",
      "removeAllNotes",
    ])
  })

  it("renders nothing when hidden", () => {
    const container = mount(
      createElement(CrossReferencePanel, { visible: false, onInsertCrossReference: () => {} }),
    )
    expect(container.textContent ?? "").toBe("")
  })
})
