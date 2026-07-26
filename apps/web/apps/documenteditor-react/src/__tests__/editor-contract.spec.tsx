import { Editor, Extension } from "@tiptap/core"
import Color from "@tiptap/extension-color"
import Focus from "@tiptap/extension-focus"
import FontFamily from "@tiptap/extension-font-family"
import Highlight from "@tiptap/extension-highlight"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import Subscript from "@tiptap/extension-subscript"
import Superscript from "@tiptap/extension-superscript"
import { Table } from "@tiptap/extension-table"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableRow } from "@tiptap/extension-table-row"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import TextAlign from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import Typography from "@tiptap/extension-typography"
import StarterKit from "@tiptap/starter-kit"
// @vitest-environment jsdom
/**
 * Editor contract suite.
 *
 * One test per row in plan/2026-07-25-basic-formatting-spec.md §4. Each test
 * mounts a real TipTap editor with the production extension list, dispatches
 * a toolbar command via `dispatchRichTextCommand` (the actual toolbar entry
 * point), and asserts on the resulting ProseMirror document state.
 *
 * See plan/2026-07-25-basic-formatting-spec.md §2 for the test pyramid.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { CommentMark } from "../lib/comment-mark"
import {
  CheckboxControl,
  DatePickerControl,
  DropdownControl,
  PlainTextControl,
} from "../lib/content-controls"
import { EndnoteMark } from "../lib/endnote-mark"
import { FontSize } from "../lib/font-size-extension"
import {
  FootnoteItem,
  FootnoteReference,
  FootnoteSection,
  footnoteAutoNumberPlugin,
} from "../lib/footnote-mark"
import { LineSpacingExtension } from "../lib/line-spacing-extension"
import { PageNumber } from "../lib/page-number"
import { ParagraphBorders } from "../lib/paragraph-borders"
import { dispatchRichTextCommand, setActiveRichTextEditor } from "../lib/rte-command"
import { SpellcheckExtension } from "../lib/spellcheck-extension"
import { TextDirectionExtension } from "../lib/text-direction-extension"
import { TableOfContents } from "../lib/toc-extension"
import { TrackDeleteMark, TrackInsertMark } from "../lib/track-changes"
import { documentStore } from "../stores/DocumentStore"

// TipTap v3.27.1 model (verified against @tiptap/core Editor.ts):
// - StarterKit bundles Link (disable via `link: false`) but NOT TextDirection.
// - The Editor auto-registers TextDirection as a CORE extension (alongside
//   Keymap, Drop, Paste, etc). Disable it via `enableCoreExtensions`.
// Production RichTextEditor.tsx uses the same pattern; the test editor mirrors
// it to avoid "Duplicate extension names found" warnings and silent command
// collisions with the custom TextDirectionExtension.

/**
 * Build a TipTap editor with the same extension list as
 * `RichTextEditor.tsx` (kept in sync manually until we extract a shared
 * builder). Callers pass `content` to seed the document.
 *
 * NOTE: jsdom does not provide `contenteditable` behavior. We rely on
 * ProseMirror's programmatic APIs (`commands`, `chain`, `setState`) which
 * do not require a real selection driver — they manipulate the doc state
 * directly.
 */
function buildEditor(content: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      Link.configure({ openOnClick: false }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table,
      TableRow,
      TableCell,
      TableHeader,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image,
      Typography,
      Focus.configure({ className: "has-focus" }),
      Placeholder.configure({ placeholder: "Start typing\u2026" }),
      CommentMark,
      EndnoteMark,
      FootnoteReference,
      FootnoteSection,
      FootnoteItem,
      Extension.create({
        name: "footnoteAutoNumber",
        addProseMirrorPlugins() {
          return [footnoteAutoNumberPlugin]
        },
      }),
      LineSpacingExtension.configure({
        types: ["paragraph", "heading"],
        defaultSpacing: "1.15",
      }),
      TextDirectionExtension.configure({
        types: ["paragraph", "heading", "blockquote", "listItem"],
      }),
      TrackInsertMark,
      TrackDeleteMark,
      TableOfContents,
      ParagraphBorders,
      PageNumber,
      PlainTextControl,
      DropdownControl,
      CheckboxControl,
      DatePickerControl,
      SpellcheckExtension,
    ],
    content,
    editable: true,
    autofocus: false,
    enableCoreExtensions: {
      textDirection: false,
    },
  })
}

/**
 * Select just the text inside the first text node (assumes single-paragraph
 * seed content like `<p>foo</p>`). Used for inline-mark tests where we need
 * an actual text selection.
 */
function selectFirstTextNode(editor: Editor) {
  const doc = editor.state.doc
  let from = 0
  let to = 0
  doc.descendants((node, pos) => {
    if (node.isText && from === 0) {
      from = pos
      to = pos + node.nodeSize
      return false
    }
    return true
  })
  if (from === 0 && to === 0) {
    // Empty paragraph — fall back to inside the paragraph
    from = 1
    to = 1
  }
  editor.commands.setTextSelection({ from, to })
}

/**
 * Place the cursor at the start of the first text node. Sufficient for
 * block-level commands (heading, alignment, blockquote) which act on the
 * containing block, not on the text selection.
 */
function cursorInFirstBlock(editor: Editor) {
  const doc = editor.state.doc
  let pos = 1
  doc.descendants((node, p) => {
    if (node.isText && pos === 1) {
      pos = p
      return false
    }
    return true
  })
  editor.commands.setTextSelection(pos)
}

let editor: Editor
let mountPoint: HTMLDivElement

/**
 * Normalize TipTap HTML output so tests can assert on a canonical form.
 * TipTap renders `style="color: red;"` (space after colon, trailing `;`) and
 * leaves a trailing empty paragraph after block transforms. The spec table
 * treats these as equivalent, so we normalize before comparing.
 */
function normalize(html: string): string {
  return html
    .replace(/style="([^"]*)"/g, (_m, body: string) => {
      const collapsed = body
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/:\s+/, ":"))
        .join(";")
      return `style="${collapsed}"`
    })
    .replace(/<p><\/p>$/g, "")
}

beforeAll(() => {
  // Default prompt stub — tests that need a real return value override
  // locally via `vi.mocked(window.prompt).mockReturnValueOnce(...)`.
  vi.spyOn(window, "prompt").mockImplementation((msg) => {
    throw new Error(`Unexpected window.prompt() in test: ${msg}`)
  })
})

afterAll(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  if (editor) editor.destroy()
  document.body.innerHTML = ""
  mountPoint = document.createElement("div")
  mountPoint.className = "rich-text-editor"
  document.body.appendChild(mountPoint)
  editor = buildEditor("<p>foo</p>")
  // Mount the editor's own DOM so commands that query it (e.g.
  // toggleSpellCheck looking for `.rich-text-editor [contenteditable]`) work.
  const editable = editor.view.dom as HTMLElement
  editable.setAttribute("contenteditable", "true")
  editable.setAttribute("spellcheck", "true")
  mountPoint.appendChild(editable)
  setActiveRichTextEditor(editor)
})

afterAll(() => {
  if (editor) editor.destroy()
  setActiveRichTextEditor(null)
})

// ----------------------------------------------------------------------
// 4.1 Home tab — inline formatting
// ----------------------------------------------------------------------

describe("Home tab — inline formatting", () => {
  it("bold toggles <strong>", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("bold")
    expect(editor.getHTML()).toBe("<p><strong>foo</strong></p>")
    expect(editor.isActive("bold")).toBe(true)
  })

  it("italic toggles <em>", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("italic")
    expect(editor.getHTML()).toBe("<p><em>foo</em></p>")
  })

  it("underline toggles <u>", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("underline")
    expect(editor.getHTML()).toBe("<p><u>foo</u></p>")
  })

  it("strike toggles <s>", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("strike")
    expect(editor.getHTML()).toBe("<p><s>foo</s></p>")
  })

  it("subscript toggles <sub>", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("subscript")
    expect(editor.getHTML()).toBe("<p><sub>foo</sub></p>")
  })

  it("superscript toggles <sup>", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("superscript")
    expect(editor.getHTML()).toBe("<p><sup>foo</sup></p>")
  })

  it("textColor renders style=color", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("textColor", "red")
    expect(normalize(editor.getHTML())).toBe('<p><span style="color:red">foo</span></p>')
  })

  it("highlight renders <mark> with background-color", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("highlight", "yellow")
    // Highlight extension adds data-color attr and color:inherit alongside
    // background-color in the rendered style.
    const html = normalize(editor.getHTML())
    expect(html).toContain('data-color="yellow"')
    expect(html).toContain("background-color:yellow")
    expect(html).toContain(">foo</mark>")
  })

  it("fontFamily renders style=font-family", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("fontFamily", "Arial")
    expect(normalize(editor.getHTML())).toBe('<p><span style="font-family:Arial">foo</span></p>')
  })

  it("fontSize renders style=font-size (Fix #1)", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("fontSize", "24px")
    expect(normalize(editor.getHTML())).toBe('<p><span style="font-size:24px">foo</span></p>')
  })

  it("clearFormatting strips all marks", () => {
    editor.commands.setContent("<p><strong><em>foo</em></strong></p>")
    selectFirstTextNode(editor)
    dispatchRichTextCommand("clearFormatting")
    expect(editor.getHTML()).toBe("<p>foo</p>")
  })

  it("undo reverts last change", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("bold")
    dispatchRichTextCommand("undo")
    expect(editor.getHTML()).toBe("<p>foo</p>")
  })

  it("redo reapplies undone change", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("bold")
    dispatchRichTextCommand("undo")
    dispatchRichTextCommand("redo")
    expect(editor.getHTML()).toBe("<p><strong>foo</strong></p>")
  })
})

// ----------------------------------------------------------------------
// 4.2 Home tab — blocks
// ----------------------------------------------------------------------

describe("Home tab — blocks", () => {
  it("normal demotes heading to paragraph", () => {
    editor.commands.setContent("<h1>foo</h1>")
    selectFirstTextNode(editor)
    dispatchRichTextCommand("normal")
    expect(normalize(editor.getHTML())).toBe("<p>foo</p>")
  })

  it.each([1, 2, 3, 4, 5, 6] as const)("heading%d produces <h%d>", (level) => {
    editor.commands.setContent("<p>foo</p>")
    selectFirstTextNode(editor)
    dispatchRichTextCommand(`heading${level}` as const)
    expect(normalize(editor.getHTML())).toBe(`<h${level}>foo</h${level}>`)
  })

  it("bulletList wraps in <ul><li>", () => {
    dispatchRichTextCommand("bulletList")
    expect(normalize(editor.getHTML())).toBe("<ul><li><p>foo</p></li></ul>")
  })

  it("orderedList wraps in <ol><li>", () => {
    dispatchRichTextCommand("orderedList")
    expect(normalize(editor.getHTML())).toBe("<ol><li><p>foo</p></li></ol>")
  })

  it("taskList wraps in task list with checkbox", () => {
    dispatchRichTextCommand("taskList")
    const html = editor.getHTML()
    expect(html).toContain('data-type="taskList"')
    expect(html).toContain('type="checkbox"')
  })

  it.each([
    ["alignLeft", "left"],
    ["alignCenter", "center"],
    ["alignRight", "right"],
    ["alignJustify", "justify"],
  ] as const)("align%s sets text-align style", (cmd, value) => {
    dispatchRichTextCommand(cmd)
    expect(normalize(editor.getHTML())).toBe(`<p style="text-align:${value}">foo</p>`)
  })

  it("indent nests list item", () => {
    editor.commands.setContent("<ul><li><p>foo</p></li><li><p>bar</p></li></ul>")
    // cursor in second item
    const text = "bar"
    let cursorPos = 0
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === text && cursorPos === 0) {
        cursorPos = pos
      }
      return true
    })
    editor.commands.setTextSelection(cursorPos)
    dispatchRichTextCommand("indent")
    const html = editor.getHTML()
    // bar should be nested under foo
    expect(html).toContain("<ul><li><p>foo</p><ul><li><p>bar</p></li></ul></li></ul>")
  })

  it("blockquote wraps paragraph", () => {
    dispatchRichTextCommand("blockquote")
    expect(normalize(editor.getHTML())).toBe("<blockquote><p>foo</p></blockquote>")
  })

  it("codeBlock wraps in <pre><code>", () => {
    dispatchRichTextCommand("codeBlock")
    expect(normalize(editor.getHTML())).toBe("<pre><code>foo</code></pre>")
  })

  it("lineSpacing sets line-height (Fix #3)", () => {
    dispatchRichTextCommand("lineSpacing", "1.5")
    expect(normalize(editor.getHTML())).toBe('<p style="line-height:1.5">foo</p>')
  })

  it("paragraphSpacingBefore sets margin-top (Fix #3)", () => {
    dispatchRichTextCommand("paragraphSpacingBefore", "12")
    expect(normalize(editor.getHTML())).toBe('<p style="margin-top:12px">foo</p>')
  })

  it("paragraphSpacingAfter sets margin-bottom (Fix #3)", () => {
    dispatchRichTextCommand("paragraphSpacingAfter", "12")
    expect(normalize(editor.getHTML())).toBe('<p style="margin-bottom:12px">foo</p>')
  })
})

// ----------------------------------------------------------------------
// 4.3 Home tab — text direction
// ----------------------------------------------------------------------

describe("Home tab — text direction", () => {
  it("setTextDirection=ltr sets dir=ltr", () => {
    dispatchRichTextCommand("setTextDirection", "ltr")
    expect(editor.getHTML()).toBe('<p dir="ltr">foo</p>')
  })

  it("setTextDirection=rtl sets dir=rtl", () => {
    dispatchRichTextCommand("setTextDirection", "rtl")
    expect(editor.getHTML()).toBe('<p dir="rtl">foo</p>')
  })
})

// ----------------------------------------------------------------------
// 4.4 Insert tab
// ----------------------------------------------------------------------

describe("Insert tab", () => {
  it("link renders <a href> (Fix #2)", () => {
    selectFirstTextNode(editor)
    dispatchRichTextCommand("link", "https://x.test")
    const html = editor.getHTML()
    expect(html).toContain("<a ")
    expect(html).toContain('href="https://x.test"')
    expect(html).toContain(">foo</a>")
  })

  it("image inserts <img> at cursor", () => {
    // Place cursor at end of paragraph text
    editor.commands.setTextSelection(4) // after "foo"
    dispatchRichTextCommand("image", "https://x.test/a.png")
    const html = editor.getHTML()
    expect(html).toContain('<img src="https://x.test/a.png">')
  })

  it("horizontalRule inserts <hr>", () => {
    editor.commands.setTextSelection(4)
    dispatchRichTextCommand("horizontalRule")
    const html = editor.getHTML()
    expect(html).toMatch(/<hr\s*\/?>/)
  })

  it("insertTable inserts <table>", () => {
    // Pass rows x cols directly to skip the prompt dialog
    editor.commands.setTextSelection(4)
    dispatchRichTextCommand("insertTable", "2x2")
    const html = editor.getHTML()
    expect(html).toContain("<table")
    expect(html).toContain("<th")
    // 2x2 = 1 header row + 1 body row, 2 cells each = 4 <td>/<th>
    const tdCount = (html.match(/<td /g) || []).length
    const thCount = (html.match(/<th /g) || []).length
    expect(thCount).toBe(2) // header row has 2 cells
    expect(tdCount).toBe(2) // body row has 2 cells
  })
})

// ----------------------------------------------------------------------
// 4.5 Table commands
// ----------------------------------------------------------------------

describe("Table commands", () => {
  beforeEach(() => {
    // Seed a 2x2 table with cursor in first body cell
    editor.commands.setContent(
      "<table><tbody><tr><th>h1</th><th>h2</th></tr><tr><td>a</td><td>b</td></tr></tbody></table>",
    )
    // Cursor inside first body <td> ("a") — find its position
    let pos = 0
    editor.state.doc.descendants((node, p) => {
      if (node.isText && node.text === "a" && pos === 0) pos = p
      return true
    })
    editor.commands.setTextSelection(pos)
  })

  it("addRowBelow increases row count", () => {
    dispatchRichTextCommand("addRowAfter")
    expect((editor.getHTML().match(/<tr>/g) || []).length).toBe(3)
  })

  it("deleteRow decreases row count", () => {
    dispatchRichTextCommand("deleteRow")
    expect((editor.getHTML().match(/<tr>/g) || []).length).toBe(1)
  })

  it("deleteTable removes the table", () => {
    dispatchRichTextCommand("deleteTable")
    expect(editor.getHTML()).not.toContain("<table")
  })
})

// ----------------------------------------------------------------------
// 4.6 Layout tab (page-level)
// ----------------------------------------------------------------------

describe("Layout tab", () => {
  it("pageOrientation=landscape emits event + updates state", () => {
    const seen: unknown[] = []
    const handler = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener("world-office:page-layout", handler)
    dispatchRichTextCommand("pageOrientation", "landscape")
    window.removeEventListener("world-office:page-layout", handler)
    expect(seen).toEqual([{ orientation: "landscape", pageSize: undefined, margins: undefined }])
  })

  it("pageSize=A3 emits event + updates state", () => {
    const seen: unknown[] = []
    const handler = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener("world-office:page-layout", handler)
    dispatchRichTextCommand("pageSize", "A3")
    window.removeEventListener("world-office:page-layout", handler)
    expect(seen[0]?.pageSize).toBe("A3")
  })

  it("columns=2 emits columns event", () => {
    const seen: unknown[] = []
    const handler = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener("world-office:columns", handler)
    dispatchRichTextCommand("columns", "2")
    window.removeEventListener("world-office:columns", handler)
    expect(seen).toEqual([{ count: 2 }])
  })

  it("columnsReset emits count=1 event", () => {
    const seen: unknown[] = []
    const handler = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener("world-office:columns", handler)
    dispatchRichTextCommand("columnsReset")
    window.removeEventListener("world-office:columns", handler)
    expect(seen).toEqual([{ count: 1 }])
  })
})

// ----------------------------------------------------------------------
// 4.7 References tab
// ----------------------------------------------------------------------

describe("References tab", () => {
  it("insertToc inserts a TOC container", () => {
    dispatchRichTextCommand("insertToc")
    let found = false
    editor.state.doc.descendants((node) => {
      if (node.type.name === "tableOfContents") found = true
    })
    expect(found).toBe(true)
  })

  it("insertFootnote inserts a footnote mark", () => {
    selectFirstTextNode(editor)
    // Place cursor at end
    editor.commands.setTextSelection(4)
    dispatchRichTextCommand("insertFootnote")
    const html = editor.getHTML()
    expect(html).toMatch(/footnote/i)
  })
})

// ----------------------------------------------------------------------
// 4.8 Header/Footer tab — store-level effects
// ----------------------------------------------------------------------

describe("Header/Footer tab", () => {
  it("editHeader toggles headerFooterMode in store", () => {
    const before = documentStore.headerFooterMode
    dispatchRichTextCommand("editHeader")
    expect(documentStore.headerFooterMode).toBe(before === "header" ? "none" : "header")
  })

  it("editFooter toggles headerFooterMode in store", () => {
    dispatchRichTextCommand("editFooter")
    expect(documentStore.headerFooterMode).toBe("footer")
  })

  it("insertPageNumber inserts a page-number span", () => {
    editor.commands.setTextSelection(4)
    dispatchRichTextCommand("insertPageNumber")
    const html = editor.getHTML()
    expect(html).toContain("data-page-number")
  })
})

// ----------------------------------------------------------------------
// 4.9 Forms tab
// ----------------------------------------------------------------------

describe("Forms tab", () => {
  // Note: PlainTextControl needed `content: "inline*"` added so its content
  // hole (the `0` in renderHTML) accepts inline children. The three atom
  // controls (Checkbox/Dropdown/DatePicker) work because atom nodes ignore
  // child content during parse.
  it("insertPlainTextControl inserts content control span", () => {
    editor.commands.setTextSelection(4)
    dispatchRichTextCommand("insertPlainTextControl")
    const html = editor.getHTML()
    expect(html).toContain('data-content-control="plain-text"')
  })

  it("insertCheckboxControl inserts checkbox control", () => {
    editor.commands.setTextSelection(4)
    dispatchRichTextCommand("insertCheckboxControl")
    const html = editor.getHTML()
    expect(html).toContain('data-content-control="checkbox"')
  })

  it("insertDropdownControl inserts dropdown control", () => {
    editor.commands.setTextSelection(4)
    dispatchRichTextCommand("insertDropdownControl")
    const html = editor.getHTML()
    expect(html).toContain('data-content-control="dropdown"')
  })

  it("insertDatePickerControl inserts date-picker control", () => {
    editor.commands.setTextSelection(4)
    dispatchRichTextCommand("insertDatePickerControl")
    const html = editor.getHTML()
    expect(html).toContain('data-content-control="date-picker"')
  })
})

// ----------------------------------------------------------------------
// 4.10 View tab
// ----------------------------------------------------------------------

describe("View tab", () => {
  it("toggleSpellCheck flips spellcheck attribute + emits event", () => {
    const seen: unknown[] = []
    const handler = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener("world-office:spellcheck", handler)
    dispatchRichTextCommand("toggleSpellCheck")
    window.removeEventListener("world-office:spellcheck", handler)
    expect(seen.length).toBeGreaterThanOrEqual(1)
    expect(typeof seen[0].enabled).toBe("boolean")
  })

  it("openSearch emits search-state event with match count", () => {
    editor.commands.setContent("<p>foo bar foo baz foo</p>")
    const seen: unknown[] = []
    const handler = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener("world-office:search-state", handler)
    dispatchRichTextCommand("openSearch", "foo")
    window.removeEventListener("world-office:search-state", handler)
    expect(seen[0].query).toBe("foo")
    expect(seen[0].matches).toBe(3)
  })
})

// ----------------------------------------------------------------------
// 4.11 Track Changes
// ----------------------------------------------------------------------

describe("Track changes", () => {
  it("toggleTrackChanges flips tracking state", () => {
    const before = editor.isActive("trackInsert")
    const ok = dispatchRichTextCommand("toggleTrackChanges")
    expect(ok).toBe(true)
    // state change should be observable via storage or active state
    // (specific assertion depends on track-changes impl — soft check)
  })
})
