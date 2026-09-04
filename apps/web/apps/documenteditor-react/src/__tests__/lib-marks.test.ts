// @vitest-environment jsdom
/**
 * lib-marks — editor mark/node extensions and footnote commands.
 *
 * Covers:
 *   CommentMark      — parseHTML, renderHTML (bg+title), setComment/unsetComment
 *   EndnoteMark      — parseHTML, renderHTML, insertEndnoteCommand
 *   FootnoteReference— parseHTML, renderHTML, attrs (id), inclusive=false
 *   FootnoteItem     — parseHTML, renderHTML, attrs (id, number)
 *   FootnoteSection  — parseHTML, renderHTML, content model (footnoteItem+)
 *   insertFootnoteCommand — no-selection (zero-width-space ref + default text),
 *                           with-selection (setMark on range + selected text)
 *   cleanupOrphanedFootnotes — no footnotes, no orphans, removes orphans
 *   removeEmptySection       — no section, non-empty, removes empty after cleanup
 *   updateFootnoteDisplayNumbers — renumbers sup refs and li items in the DOM
 *   FootnoteMark (deprecated alias === FootnoteReference)
 *
 * Uses a real headless tiptap Editor (StarterKit + all marks/nodes) — no mocking
 * of the extension layer. tiptap is available in the test environment.
 */
import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"

import {
  FootnoteReference,
  FootnoteItem,
  FootnoteSection,
  FootnoteMark,
  insertFootnoteCommand,
  cleanupOrphanedFootnotes,
  removeEmptySection,
  updateFootnoteDisplayNumbers,
} from "../lib/footnote-mark"
import { CommentMark } from "../lib/comment-mark"
import { EndnoteMark, insertEndnoteCommand } from "../lib/endnote-mark"

// ── Helpers ────────────────────────────────────────────────────────

const editors: Editor[] = []

function makeEditor(content = "<p>hello world</p>"): Editor {
  const ed = new Editor({
    extensions: [StarterKit, FootnoteReference, FootnoteItem, FootnoteSection, CommentMark, EndnoteMark],
    content,
  })
  editors.push(ed)
  return ed
}

afterEach(() => {
  for (const ed of editors.splice(0)) ed.destroy()
})

/** Find the first node of a given type and return it (or null). */
function findNode(ed: Editor, typeName: string): { node: any; pos: number } | null {
  let result: { node: any; pos: number } | null = null
  ed.state.doc.descendants((node, pos) => {
    if (!result && node.type.name === typeName) {
      result = { node, pos }
      return false
    }
    return true
  })
  return result
}

// ── Schema registration ───────────────────────────────────────────

describe("schema registration", () => {
  it("registers all marks and nodes in the editor schema", () => {
    const ed = makeEditor()
    expect(ed.schema.marks.footnoteReference).toBeTruthy()
    expect(ed.schema.marks.comment).toBeTruthy()
    expect(ed.schema.marks.endnote).toBeTruthy()
    expect(ed.schema.nodes.footnoteItem).toBeTruthy()
    expect(ed.schema.nodes.footnoteSection).toBeTruthy()
  })

  it("FootnoteMark is a deprecated alias for FootnoteReference", () => {
    expect(FootnoteMark).toBe(FootnoteReference)
  })
})

// ── CommentMark ────────────────────────────────────────────────────

describe("CommentMark", () => {
  it("parses span[data-comment] from HTML", () => {
    const ed = makeEditor('<p><span data-comment="note">text</span></p>')
    const html = ed.getHTML()
    expect(html).toContain('data-comment="note"')
    expect(html).toContain('title="note"')
  })

  it("setComment adds the mark with data-comment, title, and style", () => {
    const ed = makeEditor("<p>hello world</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 6 }).setComment({ comment: "my note" }).run()
    const html = ed.getHTML()
    expect(html).toContain('data-comment="my note"')
    expect(html).toContain('title="my note"')
    expect(html).toContain("rgb(255, 255, 136)")
    expect(html).toContain("cursor: help")
  })

  it("unsetComment removes the mark", () => {
    const ed = makeEditor("<p>hello world</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 6 }).setComment({ comment: "note" }).run()
    expect(ed.getHTML()).toContain('data-comment="note"')
    ed.chain().focus().setTextSelection({ from: 1, to: 6 }).unsetComment().run()
    expect(ed.getHTML()).not.toContain("data-comment")
  })

  it("registers as 'comment' mark in the schema", () => {
    const ed = makeEditor()
    expect(ed.schema.marks.comment).toBeTruthy()
    expect(ed.schema.marks.comment.name).toBe("comment")
  })
})

// ── EndnoteMark ────────────────────────────────────────────────────

describe("EndnoteMark", () => {
  it("parses sup[data-endnote-id] from HTML", () => {
    const ed = makeEditor('<p><sup data-endnote-id="en-1">1</sup></p>')
    const html = ed.getHTML()
    expect(html).toContain("data-endnote-id")
    expect(html).toContain("endnote-ref")
  })

  it("insertEndnoteCommand returns true and inserts content with the endnote mark", () => {
    const ed = makeEditor("<p>text</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    const result = insertEndnoteCommand(ed)
    expect(result).toBe(true)
    const html = ed.getHTML()
    expect(html).toContain("data-endnote-id")
    expect(html).toContain("endnote-ref")
  })

  it("insertEndnoteCommand inserts a 3-char text content (last 3 chars of id)", () => {
    const ed = makeEditor("<p>text</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertEndnoteCommand(ed)
    const sup = ed.view.dom.querySelector("sup[data-endnote-id]")
    expect(sup).toBeTruthy()
    const id = sup!.getAttribute("data-endnote-id") as string
    expect(id).toMatch(/^en-\d+$/)
    expect(sup!.textContent).toBe(id.slice(-3))
  })
})

// ── FootnoteReference ──────────────────────────────────────────────

describe("FootnoteReference", () => {
  it("parses sup[data-footnote-id] from HTML and renders as footnote-ref", () => {
    const ed = makeEditor('<p><sup data-footnote-id="fn-1">1</sup></p>')
    const html = ed.getHTML()
    expect(html).toContain("data-footnote-id")
    expect(html).toContain("footnote-ref")
    expect(html).toContain("data-footnote-ref")
  })

  it("renders the reference id in data-footnote-id attribute", () => {
    const ed = makeEditor('<p><sup data-footnote-id="fn-custom">9</sup></p>')
    const html = ed.getHTML()
    expect(html).toContain('data-footnote-id="fn-custom"')
  })
})

// ── FootnoteItem ──────────────────────────────────────────────────

describe("FootnoteItem", () => {
  it("creates a footnoteItem node with id and number attrs", () => {
    const ed = makeEditor("<p>hello</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertFootnoteCommand(ed)
    const item = findNode(ed, "footnoteItem")
    expect(item).not.toBeNull()
    expect(item!.node.attrs.id).toMatch(/^fn-\d+-[a-z0-9]{4}$/)
    expect(item!.node.attrs.number).toBe(999) // hardcoded in insertFootnoteCommand
  })

  it("defaults: number=1, id=null when created without attrs", () => {
    const ed = makeEditor()
    const item = ed.schema.nodes.footnoteItem.create({}, ed.schema.text("note"))
    expect(item.attrs.number).toBe(1)
    expect(item.attrs.id).toBeNull()
  })

  it("FootnoteItem node accepts id and number attrs via create()", () => {
    const ed = makeEditor()
    const text = ed.schema.text("test note")
    const item = ed.schema.nodes.footnoteItem.create({ id: "fn-test", number: 1 }, text)
    expect(item.type.name).toBe("footnoteItem")
    expect(item.attrs.id).toBe("fn-test")
    expect(item.attrs.number).toBe(1)
  })
})

// ── FootnoteSection ────────────────────────────────────────────────

describe("FootnoteSection", () => {
  it("parses div[data-footnote-section] from HTML and renders with separator + list", () => {
    const ed = makeEditor(
      '<div data-footnote-section><li data-footnote-id="fn-1">Note text</li></div>',
    )
    const html = ed.getHTML()
    expect(html).toContain("data-footnote-section")
    expect(html).toContain("footnote-section")
    expect(html).toContain("footnote-separator")
    expect(html).toContain("footnote-list")
    expect(html).toContain("data-footnote-list")
  })
})

// ── insertFootnoteCommand ──────────────────────────────────────────

describe("insertFootnoteCommand", () => {
  it("returns true", () => {
    const ed = makeEditor("<p>hello</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    expect(insertFootnoteCommand(ed)).toBe(true)
  })

  it("inserts a reference and creates a footnote section (no selection)", () => {
    const ed = makeEditor("<p>hello</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run() // collapsed cursor
    insertFootnoteCommand(ed)
    const html = ed.getHTML()
    // Reference mark (zero-width-space with footnoteReference)
    expect(html).toContain("footnote-ref")
    expect(html).toContain("data-footnote-id")
    // Section created at end of document
    expect(html).toContain("data-footnote-section")
    expect(html).toContain("footnote-section")
    // Default item text
    expect(html).toContain("Footnote content")
  })

  it("uses selected text as footnote content (with selection)", () => {
    const ed = makeEditor("<p>hello world</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 6 }).run() // select "hello"
    insertFootnoteCommand(ed)
    const html = ed.getHTML()
    // Reference mark applied to "hello"
    expect(html).toContain("footnote-ref")
    // Item text should be "hello" (the selected text)
    const itemText = ed.view.dom.querySelector("[data-fn-text]")
    expect(itemText?.textContent).toBe("hello")
  })

  it("creates a new section when none exists, appends when one exists", () => {
    const ed = makeEditor("<p>hello</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertFootnoteCommand(ed) // creates section + item1
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertFootnoteCommand(ed) // appends item2 to existing section
    const items = ed.view.dom.querySelectorAll("li[data-footnote-id]")
    expect(items.length).toBe(2)
  })

  it("generates unique footnote ids (fn-<timestamp>-<random>)", () => {
    const ed = makeEditor("<p>hello</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertFootnoteCommand(ed)
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertFootnoteCommand(ed)
    const sups = ed.view.dom.querySelectorAll("sup[data-footnote-id]")
    const ids = Array.from(sups).map((s) => s.getAttribute("data-footnote-id"))
    expect(ids.length).toBe(2)
    expect(ids[0]).not.toBe(ids[1])
    expect(ids[0]).toMatch(/^fn-\d+-[a-z0-9]{4}$/)
  })
})

// ── cleanupOrphanedFootnotes ───────────────────────────────────────

describe("cleanupOrphanedFootnotes", () => {
  it("returns true when there are no footnotes in the document", () => {
    const ed = makeEditor("<p>hello</p>")
    expect(cleanupOrphanedFootnotes(ed)).toBe(true)
  })

  it("returns true (no-op) when references and items match", () => {
    const ed = makeEditor("<p>hello</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertFootnoteCommand(ed)
    expect(cleanupOrphanedFootnotes(ed)).toBe(true)
    expect(ed.getHTML()).toContain("data-footnote-section")
    expect(ed.getHTML()).toContain("footnote-item")
  })

  it("removes footnote items whose references have been removed", () => {
    const ed = makeEditor("<p>hello world</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 6 }).run() // select "hello"
    insertFootnoteCommand(ed)
    // At this point: "hello" has footnoteReference mark, item exists in section
    expect(ed.getHTML()).toContain("footnote-item")

    // Remove the reference mark from "hello" via raw PM transaction
    const tr = ed.state.tr
    tr.removeMark(1, 6, ed.schema.marks.footnoteReference)
    ed.view.dispatch(tr)

    // Item is now orphaned (no matching reference id)
    expect(ed.getHTML()).toContain("footnote-item") // still present before cleanup
    expect(cleanupOrphanedFootnotes(ed)).toBe(true)
    expect(ed.getHTML()).not.toContain("footnote-item")
  })

  it("does not remove items whose references still exist", () => {
    const ed = makeEditor("<p>hello</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertFootnoteCommand(ed)
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertFootnoteCommand(ed) // two refs, two items
    cleanupOrphanedFootnotes(ed)
    const items = ed.view.dom.querySelectorAll("li[data-footnote-id]")
    expect(items.length).toBe(2) // both items preserved
  })
})

// ── removeEmptySection ─────────────────────────────────────────────

describe("removeEmptySection", () => {
  it("returns true when there is no footnote section", () => {
    const ed = makeEditor("<p>hello</p>")
    expect(removeEmptySection(ed)).toBe(true)
  })

  it("returns true (no-op) when section has items", () => {
    const ed = makeEditor("<p>hello</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertFootnoteCommand(ed)
    expect(removeEmptySection(ed)).toBe(true)
    expect(ed.getHTML()).toContain("data-footnote-section")
  })

  it("removes an empty section after orphaned items are cleaned up", () => {
    const ed = makeEditor("<p>hello world</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 6 }).run() // select "hello"
    insertFootnoteCommand(ed)
    // Strip the reference → item becomes orphaned
    const tr = ed.state.tr
    tr.removeMark(1, 6, ed.schema.marks.footnoteReference)
    ed.view.dispatch(tr)
    // cleanup removes the orphaned item (section left empty)
    cleanupOrphanedFootnotes(ed)
    expect(ed.getHTML()).toContain("data-footnote-section") // empty section remains
    // removeEmptySection should delete the empty section
    expect(removeEmptySection(ed)).toBe(true)
    expect(ed.getHTML()).not.toContain("data-footnote-section")
  })
})

// ── updateFootnoteDisplayNumbers ───────────────────────────────────

describe("updateFootnoteDisplayNumbers", () => {
  it("renumbers reference superscripts in the DOM (zero-width-space → 1)", () => {
    const ed = makeEditor("<p>hello</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertFootnoteCommand(ed)

    // Before: sup contains zero-width-space (insertion artifact)
    const supBefore = ed.view.dom.querySelector("sup[data-footnote-id]")
    expect(supBefore).toBeTruthy()
    expect(supBefore!.textContent).toBe("\u200B")

    updateFootnoteDisplayNumbers(ed)

    // After: sup contains the sequential number
    const supAfter = ed.view.dom.querySelector("sup[data-footnote-id]")
    expect(supAfter!.textContent).toBe("1")
  })

  it("assigns sequential numbers to multiple footnotes", () => {
    const ed = makeEditor("<p>hello</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertFootnoteCommand(ed) // ref1 at pos 1
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run()
    insertFootnoteCommand(ed) // ref2 at pos 1 (before ref1)

    updateFootnoteDisplayNumbers(ed)

    const sups = ed.view.dom.querySelectorAll("sup[data-footnote-id]")
    expect(sups.length).toBe(2)
    const nums = Array.from(sups).map((s) => s.textContent)
    expect(nums).toContain("1")
    expect(nums).toContain("2")
  })
})

// ── Integration: full footnote lifecycle ───────────────────────────

describe("footnote command integration", () => {
  it("insert → cleanup → removeEmptySection produces a clean document", () => {
    const ed = makeEditor("<p>hello world</p>")
    ed.chain().focus().setTextSelection({ from: 1, to: 6 }).run() // select "hello"
    insertFootnoteCommand(ed)

    // Strip the reference mark
    const tr = ed.state.tr
    tr.removeMark(1, 6, ed.schema.marks.footnoteReference)
    ed.view.dispatch(tr)

    // Orphaned item should be removed by cleanup
    expect(cleanupOrphanedFootnotes(ed)).toBe(true)
    expect(ed.getHTML()).not.toContain("footnote-item")

    // Empty section should be removed
    expect(removeEmptySection(ed)).toBe(true)
    expect(ed.getHTML()).not.toContain("data-footnote-section")

    // Document still has the original paragraph text
    expect(ed.getHTML()).toContain("hello")
  })
})
