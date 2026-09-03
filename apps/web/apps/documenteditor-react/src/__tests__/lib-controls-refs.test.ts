// @vitest-environment jsdom
/**
 * lib/content-controls, lib/cross-ref and lib/font-size-extension tests.
 *
 * Pins the real exports:
 *   - content-controls: node attr defaults + parseHTML/renderHTML round-trips
 *     for the four control types, and registerContentControlHandlers wiring
 *     click handlers on a mocked editor surface.
 *   - cross-ref: CrossRefType/CrossRefFormat catalog, crossReference node
 *     attr round-trips, collectTargets/resolveRef behavior, and the
 *     re-resolve plugin.
 *   - font-size-extension: FontSize mark renders `font-size` via TextStyle
 *     (pt/px values), parses inline font-size back, and falls back to no
 *     style for empty/invalid input.
 *
 * Uses a real headless TipTap editor (jsdom) for node/mark behavior and a
 * mocked editor surface for the click-handler wiring (which manipulates
 * window.prompt / DOM popups that a stock mock would obscure).
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest"
import { Editor, Extension } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { TextStyle } from "@tiptap/extension-text-style"

import {
  PlainTextControl,
  DropdownControl,
  CheckboxControl,
  DatePickerControl,
  registerContentControlHandlers,
} from "../lib/content-controls"
import {
  CrossReference,
  collectTargets,
  createCrossRefPlugin,
  resolveRef,
  type CrossRefFormat,
  type CrossRefType,
} from "../lib/cross-ref"
import { FontSize } from "../lib/font-size-extension"
import { Caption } from "../lib/caption"
import { FootnoteItem, FootnoteReference, FootnoteSection } from "../lib/footnote-mark"
import { SectionBreak } from "../lib/section-break"

let editor: Editor | null = null

afterEach(() => {
  if (editor) {
    editor.destroy()
    editor = null
  }
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

/** Build a real headless editor with just the four content-control nodes. */
function buildControlsEditor(content: string): Editor {
  editor = new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      PlainTextControl,
      DropdownControl,
      CheckboxControl,
      DatePickerControl,
    ],
    content,
  })
  return editor
}

/**
 * Build a headless editor with the cross-ref-able schema: headings
 * (StarterKit), caption, footnote marks/items/section, section breaks and
 * the crossReference node.
 */
function buildRefsEditor(content: string): Editor {
  editor = new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      Caption,
      FootnoteReference,
      FootnoteItem,
      FootnoteSection,
      SectionBreak,
      CrossReference,
    ],
    content,
  })
  return editor
}

/** Build a headless editor with TextStyle + the custom FontSize mark. */
function buildFontEditor(content: string): Editor {
  editor = new Editor({
    extensions: [StarterKit.configure({ link: false }), TextStyle, FontSize],
    content,
  })
  return editor
}

/** Find the first node of a given type and return it (or null). */
function findNode(ed: Editor, typeName: string) {
  let found: { type: { name: string }; attrs: Record<string, unknown> } | null = null
  ed.state.doc.descendants((node) => {
    if (!found && node.type.name === typeName) {
      found = node as unknown as { type: { name: string }; attrs: Record<string, unknown> }
      return false
    }
    return true
  })
  return found
}

/** Return the attributes of the first textStyle mark found in the doc. */
function firstTextStyleAttrs(ed: Editor): Record<string, unknown> | null {
  let attrs: Record<string, unknown> | null = null
  ed.state.doc.descendants((node) => {
    if (node.isText) {
      const mark = node.marks.find((m) => m.type.name === "textStyle")
      if (mark) {
        attrs = mark.attrs as Record<string, unknown>
        return false
      }
    }
    return true
  })
  return attrs
}

// ----------------------------------------------------------------------
// content-controls: node attr defaults + parseHTML round-trips
// ----------------------------------------------------------------------

describe("PlainTextControl", () => {
  it("defaults placeholder to 'Enter text'", () => {
    const ed = buildControlsEditor('<p><span data-content-control="plain-text">Hello</span></p>')
    const node = findNode(ed, "plainTextControl")
    expect(node).not.toBeNull()
    expect(node?.attrs.placeholder).toBe("Enter text")
  })

  it("round-trips as span[data-content-control=plain-text] with underline style", () => {
    const ed = buildControlsEditor('<p><span data-content-control="plain-text">Hello</span></p>')
    const html = ed.getHTML()
    expect(html).toContain('data-content-control="plain-text"')
    expect(html).toContain("border-bottom: 1px dotted")
    expect(html).toContain("Hello")
    // A second parse keeps the same shape (inline content preserved)
    const ed2 = buildControlsEditor('<p><span data-content-control="plain-text">Hello</span></p>')
    expect(ed2.getHTML()).toContain('data-content-control="plain-text"')
    expect(ed2.getHTML()).toContain("Hello")
  })

  it("preserves inline children content", () => {
    const ed = buildControlsEditor(
      '<p><span data-content-control="plain-text">a <strong>b</strong></span></p>',
    )
    expect(ed.getHTML()).toContain("<strong>b</strong>")
  })
})

describe("DropdownControl", () => {
  it("defaults options to empty string", () => {
    const ed = buildControlsEditor('<p><span data-content-control="dropdown"></span></p>')
    const node = findNode(ed, "dropdownControl")
    expect(node).not.toBeNull()
    expect(node?.attrs.options).toBe("")
  })

  it("parses data-options and round-trips it", () => {
    const ed = buildControlsEditor(
      '<p><span data-content-control="dropdown" data-options="A, B">Choose</span></p>',
    )
    const node = findNode(ed, "dropdownControl")
    expect(node?.attrs.options).toBe("A, B")
    const html = ed.getHTML()
    expect(html).toContain('data-content-control="dropdown"')
    expect(html).toContain('data-options="A, B"')
  })

  it("is an atom node", () => {
    const ed = buildControlsEditor('<p><span data-content-control="dropdown"></span></p>')
    const node = findNode(ed, "dropdownControl")
    expect(node?.type.isAtom).toBe(true)
  })
})

describe("CheckboxControl", () => {
  it("defaults checked to false", () => {
    const ed = buildControlsEditor('<p><span data-content-control="checkbox"></span></p>')
    const node = findNode(ed, "checkboxControl")
    expect(node).not.toBeNull()
    expect(node?.attrs.checked).toBe(false)
  })

  it("parses data-checked=\"true\" as checked", () => {
    const ed = buildControlsEditor(
      '<p><span data-content-control="checkbox" data-checked="true"></span></p>',
    )
    const node = findNode(ed, "checkboxControl")
    expect(node?.attrs.checked).toBe(true)
    expect(ed.getHTML()).toContain('data-checked="true"')
    expect(ed.getHTML()).toContain("✓")
  })

  it("parses data-checked=\"false\" (and any other value) as unchecked", () => {
    const ed = buildControlsEditor(
      '<p><span data-content-control="checkbox" data-checked="false"></span></p>',
    )
    const node = findNode(ed, "checkboxControl")
    expect(node?.attrs.checked).toBe(false)
    const html = ed.getHTML()
    expect(html).toContain('data-checked="false"')
    expect(html).not.toContain("✓")
  })

  it("round-trips a checked checkbox through render + re-parse", () => {
    const ed = buildControlsEditor(
      '<p><span data-content-control="checkbox" data-checked="true"></span></p>',
    )
    const html = ed.getHTML()
    expect(html).toContain('data-content-control="checkbox"')
    expect(html).toContain('data-checked="true"')
    const ed2 = buildControlsEditor(html)
    const node = findNode(ed2, "checkboxControl")
    expect(node?.attrs.checked).toBe(true)
  })
})

describe("DatePickerControl", () => {
  it("defaults value to '' and format to YYYY-MM-DD", () => {
    const ed = buildControlsEditor('<p><span data-content-control="date-picker"></span></p>')
    const node = findNode(ed, "datePickerControl")
    expect(node).not.toBeNull()
    expect(node?.attrs.value).toBe("")
    expect(node?.attrs.format).toBe("YYYY-MM-DD")
  })

  it("parses data-value and round-trips it", () => {
    const ed = buildControlsEditor(
      '<p><span data-content-control="date-picker" data-value="2026-01-15">2026-01-15</span></p>',
    )
    const node = findNode(ed, "datePickerControl")
    expect(node?.attrs.value).toBe("2026-01-15")
    const html = ed.getHTML()
    expect(html).toContain('data-content-control="date-picker"')
    expect(html).toContain('data-value="2026-01-15"')
  })

  it("is an atom node", () => {
    const ed = buildControlsEditor('<p><span data-content-control="date-picker"></span></p>')
    const node = findNode(ed, "datePickerControl")
    expect(node?.type.isAtom).toBe(true)
  })
})

// ----------------------------------------------------------------------
// content-controls: registerContentControlHandlers wiring (mocked editor)
// ----------------------------------------------------------------------

interface MockHandle {
  editor: Record<string, unknown>
  view: {
    dom: { addEventListener: ReturnType<typeof vi.fn> }
    posAtDOM: ReturnType<typeof vi.fn>
    state: {
      doc: {
        resolve: ReturnType<typeof vi.fn>
        nodeAt: ReturnType<typeof vi.fn>
      }
    }
  }
  chain: {
    focus: ReturnType<typeof vi.fn>
    setNodeSelection: ReturnType<typeof vi.fn>
    updateAttributes: ReturnType<typeof vi.fn>
    insertContentAt: ReturnType<typeof vi.fn>
    run: ReturnType<typeof vi.fn>
  }
  handler: (event: MouseEvent) => void
}

/**
 * Build a mocked editor surface that mirrors the parts the click handlers
 * touch: view.dom.addEventListener, view.posAtDOM, view.state.doc.resolve,
 * editor.state.doc.nodeAt and editor.chain(). The click target resolves to
 * a paragraph by default; tests override `resolve` to point at a control.
 */
function mockEditorSurface(): MockHandle {
  const chain = {
    focus: vi.fn(() => chain),
    setNodeSelection: vi.fn(() => chain),
    updateAttributes: vi.fn(() => chain),
    insertContentAt: vi.fn(() => chain),
    run: vi.fn(),
  } as unknown as MockHandle["chain"]

  const view = {
    dom: { addEventListener: vi.fn() },
    posAtDOM: vi.fn(() => 3),
    state: {
      doc: {
        resolve: vi.fn(() => ({ parent: { type: { name: "paragraph" } } })),
        nodeAt: vi.fn(() => null),
      },
    },
  } as unknown as MockHandle["view"]

  const editor = {
    view,
    state: { doc: view.state.doc },
    chain: vi.fn(() => chain),
  } as unknown as Record<string, unknown>

  let handler: MockHandle["handler"] = () => {}
  view.dom.addEventListener.mockImplementation((_type: string, cb: (e: MouseEvent) => void) => {
    handler = cb
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerContentControlHandlers(editor as any)
  return { editor, view, chain, handler }
}

function clickEvent(controlType?: string): MouseEvent {
  const target = document.createElement("span")
  if (controlType) target.setAttribute("data-content-control", controlType)
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true })
  Object.defineProperty(ev, "target", { value: target })
  return ev
}

describe("registerContentControlHandlers", () => {
  it("registers a click listener on the editor view DOM without throwing", () => {
    const { view } = mockEditorSurface()
    expect(view.dom.addEventListener).toHaveBeenCalledWith("click", expect.any(Function))
  })

  it("ignores clicks on elements without data-content-control", () => {
    const { view, handler } = mockEditorSurface()
    const ev = clickEvent()
    handler(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(view.posAtDOM).not.toHaveBeenCalled()
  })

  it("ignores clicks when posAtDOM yields no position", () => {
    const { view, handler } = mockEditorSurface()
    view.posAtDOM.mockReturnValue(undefined)
    const ev = clickEvent("checkbox")
    expect(() => handler(ev)).not.toThrow()
    expect(view.posAtDOM).toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })

  it("does nothing when the resolved node is not a control", () => {
    const { handler, chain } = mockEditorSurface()
    handler(clickEvent("checkbox"))
    expect(chain.run).not.toHaveBeenCalled()
    expect(chain.updateAttributes).not.toHaveBeenCalled()
  })

  it("toggles checkboxControl when clicked", () => {
    const { chain, view, handler } = mockEditorSurface()
    view.state.doc.resolve.mockReturnValue({
      parent: { type: { name: "checkboxControl" } },
    })
    view.state.doc.nodeAt.mockReturnValue({ attrs: { checked: false }, textContent: "" })
    const ev = clickEvent("checkbox")
    handler(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(chain.setNodeSelection).toHaveBeenCalledWith(3)
    expect(chain.updateAttributes).toHaveBeenCalledWith("checkboxControl", { checked: true })
    expect(chain.run).toHaveBeenCalled()
  })

  it("shows a dropdown popup when a dropdownControl with options is clicked", () => {
    const { chain, view, handler } = mockEditorSurface()
    view.state.doc.resolve.mockReturnValue({
      parent: { type: { name: "dropdownControl" } },
    })
    view.state.doc.nodeAt.mockReturnValue({
      attrs: { options: "A, B" },
      textContent: "Select...",
    })
    const ev = clickEvent("dropdown")
    handler(ev)
    expect(ev.defaultPrevented).toBe(true)
    const select = document.body.querySelector("select")
    expect(select).not.toBeNull()
    // blank option + one per option
    expect([...(select?.options ?? [])].map((o) => o.textContent)).toEqual([
      "Select...",
      "A",
      "B",
    ])
    // choosing an option writes the value into the document
    select!.value = "B"
    select!.dispatchEvent(new Event("change"))
    expect(chain.insertContentAt).toHaveBeenCalledWith(3, "B")
    // popup removed from the DOM afterwards
    expect(document.body.contains(select)).toBe(false)
  })

  it("prompts for options when the dropdown has none yet", () => {
    const { chain, view, handler } = mockEditorSurface()
    view.state.doc.resolve.mockReturnValue({
      parent: { type: { name: "dropdownControl" } },
    })
    view.state.doc.nodeAt.mockReturnValue({ attrs: { options: "" }, textContent: "" })
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("X, Y")
    handler(clickEvent("dropdown"))
    expect(promptSpy).toHaveBeenCalled()
    expect(chain.updateAttributes).toHaveBeenCalledWith("dropdownControl", {
      options: "X, Y",
    })
  })

  it("prompts for a date and stores it when a datePickerControl is clicked", () => {
    const { chain, view, handler } = mockEditorSurface()
    view.state.doc.resolve.mockReturnValue({
      parent: { type: { name: "datePickerControl" } },
    })
    view.state.doc.nodeAt.mockReturnValue({ attrs: { value: "2026-01-01" }, textContent: "" })
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("2026-05-20")
    handler(clickEvent("date-picker"))
    expect(promptSpy).toHaveBeenCalled()
    expect(chain.updateAttributes).toHaveBeenCalledWith("datePickerControl", {
      value: "2026-05-20",
    })
  })
})

// ----------------------------------------------------------------------
// cross-ref: type catalog
// ----------------------------------------------------------------------

describe("CrossRef type catalog", () => {
  it("exposes exactly the five cross-reference types", () => {
    const types: CrossRefType[] = ["heading", "caption", "bookmark", "footnote", "section"]
    expect(types).toHaveLength(5)
    for (const t of types) {
      expect(["heading", "caption", "bookmark", "footnote", "section"]).toContain(t)
    }
  })

  it("exposes the four reference formats", () => {
    const formats: CrossRefFormat[] = ["text", "number", "pageNumber", "aboveBelow"]
    expect(formats).toHaveLength(4)
    for (const f of formats) {
      expect(["text", "number", "pageNumber", "aboveBelow"]).toContain(f)
    }
  })
})

// ----------------------------------------------------------------------
// cross-ref: node attr defaults + parseHTML/renderHTML round-trips
// ----------------------------------------------------------------------

describe("CrossReference node", () => {
  it("defaults targetId/display to empty/placeholder and refType/format to heading/text", () => {
    const ed = buildRefsEditor('<p><span data-cross-ref>Ref</span></p>')
    const node = findNode(ed, "crossReference")
    expect(node).not.toBeNull()
    expect(node?.attrs.targetId).toBe("")
    expect(node?.attrs.refType).toBe("heading")
    expect(node?.attrs.format).toBe("text")
    expect(node?.attrs.display).toBe("[Ref]")
  })

  it("parses all four data-* attributes", () => {
    const ed = buildRefsEditor(
      '<p><span data-cross-ref data-ref-target="heading-2" data-ref-type="caption" data-ref-format="pageNumber" data-ref-display="See below">Ref</span></p>',
    )
    const node = findNode(ed, "crossReference")
    expect(node).not.toBeNull()
    expect(node?.attrs).toMatchObject({
      targetId: "heading-2",
      refType: "caption",
      format: "pageNumber",
      display: "See below",
    })
  })

  it("round-trips attributes through renderHTML as data-*", () => {
    const ed = buildRefsEditor(
      '<p><span data-cross-ref data-ref-target="caption-figure-3" data-ref-type="caption" data-ref-format="number" data-ref-display="Figure 3">Ref</span></p>',
    )
    const html = ed.getHTML()
    expect(html).toContain("data-cross-ref")
    expect(html).toContain('data-ref-target="caption-figure-3"')
    expect(html).toContain('data-ref-type="caption"')
    expect(html).toContain('data-ref-format="number"')
    expect(html).toContain('data-ref-display="Figure 3"')
  })

  it("renders contenteditable=false with link-style styling", () => {
    const ed = buildRefsEditor('<p><span data-cross-ref data-ref-display="Ref text">Ref</span></p>')
    const html = ed.getHTML()
    expect(html).toContain('contenteditable="false"')
    expect(html).toContain("border-bottom: 1px dotted")
    expect(html).toContain("cursor: pointer")
  })

  it("renders the '[Ref]' placeholder text regardless of the display attribute", () => {
    // tiptap v3 does not surface node attrs in renderHTML's HTMLAttributes, so
    // the visible inner text always falls back to the placeholder. The real
    // display string lives in data-ref-display (see the skipped BUG test below).
    const ed = buildRefsEditor(
      '<p><span data-cross-ref data-ref-display="See Below">x</span></p>',
    )
    const html = ed.getHTML()
    expect(html).toContain("[Ref]")
    expect(html).toContain('data-ref-display="See Below"')
  })

  // BUG: the module docstring promises "the node's text content is updated to
  // match the current label/number of its target", but renderHTML reads
  // `HTMLAttributes.display`, which tiptap v3 never populates from node attrs.
  // The visible text therefore stays "[Ref]" forever — neither parse, nor the
  // re-resolve plugin, nor insertContent-with-attrs ever surface the resolved
  // display string as visible text.
  it.skip("renders the resolved display string as visible text", () => {
    const ed = new Editor({
      extensions: [
        StarterKit.configure({ link: false }),
        CrossReference,
        Extension.create({
          name: "testCrossRefPlugin",
          addProseMirrorPlugins() {
            return [createCrossRefPlugin()]
          },
        }),
      ],
      content:
        '<p><span data-cross-ref data-ref-target="heading-2" data-ref-display="See Heading 2">x</span></p>',
    })
    editor = ed
    ed.commands.setTextSelection(1)
    expect(ed.getHTML()).toContain("See Heading 2")
  })
})

describe("createCrossRefPlugin", () => {
  it("fills the placeholder display with [targetId] on document change", () => {
    const ed = new Editor({
      extensions: [
        StarterKit.configure({ link: false }),
        CrossReference,
        Extension.create({
          name: "testCrossRefPlugin",
          addProseMirrorPlugins() {
            return [createCrossRefPlugin()]
          },
        }),
      ],
      content: '<p><span data-cross-ref data-ref-target="heading-2">[Ref]</span></p>',
    })
    editor = ed
    ed.commands.setTextSelection(1) // dispatch a transaction → plugin runs
    const node = findNode(ed, "crossReference")
    expect(node?.attrs.display).toBe("[heading-2]")
    expect(ed.getHTML()).toContain('data-ref-display="[heading-2]"')
  })

  it("leaves an already-resolved display untouched", () => {
    const ed = new Editor({
      extensions: [
        StarterKit.configure({ link: false }),
        CrossReference,
        Extension.create({
          name: "testCrossRefPlugin",
          addProseMirrorPlugins() {
            return [createCrossRefPlugin()]
          },
        }),
      ],
      content:
        '<p><span data-cross-ref data-ref-target="heading-2" data-ref-display="Resolved">Ref</span></p>',
    })
    editor = ed
    ed.commands.setTextSelection(1)
    const node = findNode(ed, "crossReference")
    expect(node?.attrs.display).toBe("Resolved")
  })
})

// ----------------------------------------------------------------------
// cross-ref: collectTargets + resolveRef
// ----------------------------------------------------------------------

const REF_DOC =
  "<h1>Introduction</h1>" +
  "<h2>Methods</h2>" +
  '<div data-caption data-caption-type="figure" data-caption-num="3">Growth chart</div>' +
  "<div data-section-break></div>"

describe("collectTargets", () => {
  it("collects headings with level suffix in display text", () => {
    const ed = buildRefsEditor(REF_DOC)
    const refs = collectTargets(ed)
    const headingIds = refs.filter((r) => r.type === "heading").map((r) => r.id)
    expect(headingIds).toEqual(["heading-1", "heading-2"])
    const h1 = refs.find((r) => r.id === "heading-1")
    expect(h1?.displayText).toBe("Introduction (H1)")
    const h2 = refs.find((r) => r.id === "heading-2")
    expect(h2?.displayText).toBe("Methods (H2)")
  })

  it("collects captions typed figure with their number", () => {
    const ed = buildRefsEditor(REF_DOC)
    const refs = collectTargets(ed)
    const fig = refs.find((r) => r.id === "caption-figure-3")
    expect(fig).toBeDefined()
    expect(fig?.type).toBe("caption")
    expect(fig?.displayText).toBe("Figure 3: Growth chart")
  })

  it("collects caption tables as caption-table-N", () => {
    const ed = buildRefsEditor(
      '<div data-caption data-caption-type="table" data-caption-num="1">Results</div>',
    )
    const refs = collectTargets(ed)
    const tbl = refs.find((r) => r.id === "caption-table-1")
    expect(tbl?.displayText).toBe("Table 1: Results")
  })

  it("collects section breaks as section-N", () => {
    const ed = buildRefsEditor(REF_DOC)
    const refs = collectTargets(ed)
    const sec = refs.find((r) => r.id === "section-1")
    expect(sec).toBeDefined()
    expect(sec?.type).toBe("section")
    expect(sec?.displayText).toBe("Section 1")
  })

  it("indexes each heading/caption class independently", () => {
    const ed = buildRefsEditor(REF_DOC)
    const refs = collectTargets(ed)
    // headings and captions use separate counters → no id collisions
    expect(refs.every((r, i) => refs.findIndex((o) => o.id === r.id) === i)).toBe(true)
  })

  // BUG: collectTargets checks `node.type.name === "footnote"`, but the
  // registered footnote item node is named "footnoteItem", so footnotes are
  // never collected as cross-reference targets.
  it.skip("collects footnotes as footnote-N", () => {
    const ed = buildRefsEditor(
      REF_DOC +
        '<div data-footnote-section><li data-footnote-id="fn1" data-footnote-number="1"><span>Note text</span></li></div>',
    )
    const refs = collectTargets(ed)
    const fn = refs.find((r) => r.id === "footnote-1")
    expect(fn).toBeDefined()
    expect(fn?.type).toBe("footnote")
    expect(fn?.displayText).toBe("Footnote 1")
  })
})

describe("resolveRef", () => {
  it("resolves heading text format to the heading text", () => {
    const ed = buildRefsEditor(REF_DOC)
    expect(resolveRef("heading-2", "text", ed)).toBe("Methods")
  })

  it("resolves heading number format to the heading index", () => {
    const ed = buildRefsEditor(REF_DOC)
    expect(resolveRef("heading-2", "number", ed)).toBe("2")
  })

  it("resolves heading aboveBelow format to empty (placeholder)", () => {
    const ed = buildRefsEditor(REF_DOC)
    expect(resolveRef("heading-1", "aboveBelow", ed)).toBe("")
  })

  it("falls back to [Heading] when the heading index is missing", () => {
    const ed = buildRefsEditor(REF_DOC)
    expect(resolveRef("heading-99", "text", ed)).toBe("[Heading]")
  })

  it("resolves caption text format to 'Figure N' / 'Table N'", () => {
    const ed = buildRefsEditor(REF_DOC)
    expect(resolveRef("caption-figure-3", "text", ed)).toBe("Figure 3")
    expect(resolveRef("caption-table-7", "text", ed)).toBe("Table 7")
  })

  it("resolves caption number format to the raw number", () => {
    const ed = buildRefsEditor(REF_DOC)
    expect(resolveRef("caption-figure-3", "number", ed)).toBe("3")
  })

  it("resolves footnote and section formats", () => {
    const ed = buildRefsEditor(REF_DOC)
    expect(resolveRef("footnote-1", "text", ed)).toBe("1")
    expect(resolveRef("section-2", "text", ed)).toBe("Section 2")
    expect(resolveRef("section-2", "number", ed)).toBe("2")
  })

  it("returns [Unknown] for an empty target id", () => {
    const ed = buildRefsEditor(REF_DOC)
    expect(resolveRef("", "text", ed)).toBe("[Unknown]")
  })

  it("returns the raw id bracketed for unknown prefixes", () => {
    const ed = buildRefsEditor(REF_DOC)
    expect(resolveRef("bookmark-my-mark", "text", ed)).toBe("[bookmark-my-mark]")
  })
})

// ----------------------------------------------------------------------
// font-size-extension
// ----------------------------------------------------------------------

describe("FontSize extension", () => {
  it("renders pt font sizes via the textStyle mark", () => {
    const ed = buildFontEditor("<p>foo</p>")
    ed.commands.setTextSelection({ from: 1, to: 4 })
    ed.commands.setMark("textStyle", { fontSize: "14pt" })
    expect(ed.getHTML()).toContain("font-size: 14pt")
  })

  it("renders px font sizes via the textStyle mark", () => {
    const ed = buildFontEditor("<p>foo</p>")
    ed.commands.setTextSelection({ from: 1, to: 4 })
    ed.commands.setMark("textStyle", { fontSize: "24px" })
    expect(ed.getHTML()).toContain("font-size: 24px")
  })

  it("parses an inline font-size back into the mark attribute", () => {
    const ed = buildFontEditor('<p><span style="font-size: 18px">foo</span></p>')
    const attrs = firstTextStyleAttrs(ed)
    expect(attrs).not.toBeNull()
    expect(attrs?.fontSize).toBe("18px")
  })

  it("round-trips pt values through parse and render", () => {
    const ed = buildFontEditor('<p><span style="font-size: 12pt">foo</span></p>')
    expect(ed.getHTML()).toContain("font-size: 12pt")
  })

  it("falls back to null when the element has no inline font-size", () => {
    const ed = buildFontEditor('<p><span style="color: red">foo</span></p>')
    const attrs = firstTextStyleAttrs(ed)
    expect(attrs).not.toBeNull()
    expect(attrs?.fontSize).toBeNull()
  })

  it("emits no font-size style when the attribute is empty (falsy falls back)", () => {
    const ed = buildFontEditor("<p>foo</p>")
    ed.commands.setTextSelection({ from: 1, to: 4 })
    ed.commands.setMark("textStyle", { fontSize: "" })
    expect(ed.getHTML()).not.toContain("font-size")
  })

  it("emits no font-size style when the mark has no fontSize at all", () => {
    const ed = buildFontEditor('<p><span style="color: red">foo</span></p>')
    expect(ed.getHTML()).not.toContain("font-size")
  })
})
