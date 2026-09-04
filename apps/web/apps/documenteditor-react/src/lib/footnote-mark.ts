/**
 * Complete footnote system for World-Office document editor.
 *
 * Provides:
 *  - FootnoteReference (inline Mark) — the superscript number in body text
 *  - FootnoteSection (block Node) — the footnotes area at document bottom
 *  - FootnoteItem (block Node) — a single footnote's content
 *  - Automatic numbering based on document position
 *  - Cleanup of orphaned footnote content when references are removed
 */

import { Mark, Node, mergeAttributes } from "@tiptap/core"
import type { Editor } from "@tiptap/core"
import type { Node as PmNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"

// ── Shared key for the auto-numbering plugin ──

const footnotePluginKey = new PluginKey("footnotes")

// ── Helpers ──

/**
 * Collect all footnote references from the document in order,
 * returning their IDs.
 */
function collectReferenceIds(doc: PmNode): string[] {
  const ids: string[] = []
  doc.descendants((node) => {
    if (node.isInline && node.marks) {
      for (const mark of node.marks) {
        if (mark.type.name === "footnoteReference") {
          const id = mark.attrs.id as string | undefined
          if (id) ids.push(id)
        }
      }
    }
    return true
  })
  return ids
}

/**
 * Collect all footnoteItems from the footnoteSection at document end.
 */
function collectContentIds(doc: PmNode): string[] {
  const ids: string[] = []
  doc.descendants((node) => {
    if (node.type.name === "footnoteItem") {
      const id = node.attrs.id as string | undefined
      if (id) ids.push(id)
    }
    return node.type.name !== "footnoteItem" // don't descend into footnote items
  })
  return ids
}

/**
 * Find the footnoteSection node and its position in the document.
 */
function findFootnoteSection(doc: PmNode): { node: PmNode; pos: number } | null {
  let result: { node: PmNode; pos: number } | null = null
  doc.descendants((node, pos) => {
    if (node.type.name === "footnoteSection") {
      result = { node, pos }
      return false
    }
    return true
  })
  return result
}

// ── FootnoteReference (inline Mark) ──
//
// Renders as `<sup data-footnote-id="<id>"><span class="fn-ref-num">N</span></sup>`
// The number inside is set by the auto-numbering plugin via DOM update.
// Content is empty (atom = true) since the number is rendered by the plugin.

export const FootnoteReference = Mark.create({
  name: "footnoteReference",

  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-footnote-id"),
        renderHTML: (attrs) => ({ "data-footnote-id": attrs.id }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "sup[data-footnote-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "sup",
      mergeAttributes(HTMLAttributes, { class: "footnote-ref", "data-footnote-ref": "" }),
      0,
    ]
  },
})

// ── FootnoteItem (block Node) ──
//
// A single footnote's content. Appears inside a footnoteSection.
// Renders as `<li data-footnote-id="<id>">...</li>` with numbering on ::before.

export const FootnoteItem = Node.create({
  name: "footnoteItem",

  group: "footnoteItem",
  content: "inline*",
  defining: true,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-footnote-id"),
        renderHTML: (attrs) => ({ "data-footnote-id": attrs.id }),
      },
      number: {
        default: 1,
        parseHTML: (el) => Number(el.getAttribute("data-footnote-number")) || 1,
        renderHTML: (attrs) => ({ "data-footnote-number": attrs.number }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "li[data-footnote-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(HTMLAttributes, {
        class: "footnote-item",
        "data-footnote-item": "",
      }),
      [
        "span",
        { class: "footnote-item-number", "data-fn-num": "" },
        `${(HTMLAttributes as Record<string, unknown>).number ?? 1}.`,
      ],
      ["span", { class: "footnote-item-text", "data-fn-text": "" }, 0],
    ]
  },
})

// ── FootnoteSection (block Node) ──
//
// A container at the end of the document holding all footnote items.
// Renders as a `<div class="footnote-section">` with an `<ol>` list.

export const FootnoteSection = Node.create({
  name: "footnoteSection",

  group: "block",
  content: "footnoteItem*", // zero or more — allows empty section for cleanup
  defining: true,
  draggable: false,
  selectable: false,
  atom: false,
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-footnote-section]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-footnote-section": "",
        class: "footnote-section",
      }),
      ["hr", { class: "footnote-separator" }],
      ["ol", { class: "footnote-list", "data-footnote-list": "" }, 0],
    ]
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        // Prevent inserting new items in the section directly — footnotes
        // are only created by the insertFootnote command
        return true
      },
    }
  },
})

// ── Commands ──

/**
 * Insert a new footnote at the cursor position.
 *
 * Creates the reference mark in the body text and adds a footnoteItem
 * inside the footnoteSection (creating the section if needed).
 */
export function insertFootnoteCommand(editor: Editor): boolean {
  const { state } = editor
  const { selection, schema } = state

  const id = `fn-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`

  // Get selected text or use cursor position for insertion point
  const { from, to } = selection
  const hasSelection = from !== to
  const selectedText = hasSelection
    ? state.doc.textBetween(from, to, "\n", " ")
    : "Footnote content"

  // Step 1: Insert footnote reference at cursor position
  if (hasSelection) {
    editor.chain().focus().setMark("footnoteReference", { id }).run()
  } else {
    insertFootnoteReferenceAtCursor(editor, id)
  }

  // Step 2: Add footnoteItem to footnoteSection (create if needed)
  const tr = editor.state.tr
  const section = findFootnoteSection(tr.doc)

  const footnoteItem = schema.nodes.footnoteItem.create(
    { id, number: 999 },
    schema.text(hasSelection ? selectedText : "Footnote content"),
  )

  if (section) {
    // Append after existing items
    const endPos = section.pos + section.node.nodeSize - 1
    tr.insert(endPos, footnoteItem)
  } else {
    // Create section at end of document
    const sectionNode = schema.nodes.footnoteSection.create({}, footnoteItem)
    tr.insert(tr.doc.content.size, sectionNode)
  }

  editor.view.dispatch(tr)
  return true
}

/**
 * Insert a footnote reference at the cursor position when nothing is selected.
 * Inserts a superscript number with the footnoteReference mark.
 */
function insertFootnoteReferenceAtCursor(editor: Editor, id: string): void {
  const { state, view } = editor
  const { selection, schema } = state
  const pos = selection.from

  const refText = schema.text("\u200B", [schema.marks.footnoteReference.create({ id })])

  const tr = state.tr.insert(pos, refText)
  view.dispatch(tr)
}

/**
 * Remove orphaned footnoteItems whose references no longer exist.
 */
export function cleanupOrphanedFootnotes(editor: Editor): boolean {
  const doc = editor.state.doc
  const refIds = new Set(collectReferenceIds(doc))
  const contentIds = collectContentIds(doc)
  const orphaned = contentIds.filter((id) => !refIds.has(id))

  if (orphaned.length === 0) return true

  const section = findFootnoteSection(doc)
  if (!section) return true

  const tr = editor.state.tr
  const childrenToRemove: number[] = []

  tr.doc.nodesBetween(section.pos, section.pos + section.node.nodeSize, (node, pos) => {
    if (node.type.name === "footnoteItem") {
      const nodeId = node.attrs.id as string
      if (orphaned.includes(nodeId)) {
        childrenToRemove.push(pos)
      }
    }
    return true // continue traversing into child nodes
  })

  // Remove from end to start to preserve positions
  for (let i = childrenToRemove.length - 1; i >= 0; i--) {
    const pos = childrenToRemove[i]
    const node = tr.doc.nodeAt(pos)
    if (node) {
      tr.delete(pos, pos + node.nodeSize)
    }
  }

  if (tr.steps.length > 0) {
    editor.view.dispatch(tr)
  }
  return true
}

/**
 * Remove a footnote section entirely if it's empty.
 */
export function removeEmptySection(editor: Editor): boolean {
  const doc = editor.state.doc
  const section = findFootnoteSection(doc)
  if (!section) return true
  if (section.node.childCount > 0) return true

  const tr = editor.state.tr
  tr.delete(section.pos, section.pos + section.node.nodeSize)
  editor.view.dispatch(tr)
  return true
}

// ── Auto-numbering Plugin ──
//
// After every document change, re-numbers all footnote references
// and content items sequentially based on their position in the
// document, and removes orphaned content.

export const footnoteAutoNumberPlugin = new Plugin({
  key: footnotePluginKey,

  appendTransaction(transactions, _oldState, newState) {
    // Only re-run if the document changed
    const docChanged = transactions.some((tr) => tr.docChanged)
    if (!docChanged) return null

    const doc = newState.doc
    const refIds = collectReferenceIds(doc)
    const contentIds = collectContentIds(doc)

    const tr = newState.tr

    // 1. Remove orphaned footnoteItems
    const orphaned = contentIds.filter((id) => !refIds.includes(id))
    if (orphaned.length > 0) {
      const section = findFootnoteSection(doc)
      if (section) {
        const removePositions: number[] = []
        tr.doc.nodesBetween(section.pos, section.pos + section.node.nodeSize, (node, pos) => {
          if (node.type.name === "footnoteItem" && orphaned.includes(node.attrs.id as string)) {
            removePositions.push(pos)
          }
          return true // continue traversing into child nodes
        })
        for (let i = removePositions.length - 1; i >= 0; i--) {
          const pos = removePositions[i]
          const node = tr.doc.nodeAt(pos)
          if (node) tr.delete(pos, pos + node.nodeSize)
        }
      }
    }

    // 2. Remove empty footnoteSection
    const currentSection = findFootnoteSection(tr.doc)
    if (currentSection && currentSection.node.childCount === 0) {
      tr.delete(currentSection.pos, currentSection.pos + currentSection.node.nodeSize)
    }

    return tr.steps.length > 0 ? tr : null
  },
})

/**
 * Update the DOM numbers for footnote references and items.
 * Called from the editor's `onUpdate` or via a separate MutationObserver.
 */
export function updateFootnoteDisplayNumbers(editor: Editor): void {
  const doc = editor.state.doc
  const refIds = collectReferenceIds(doc)

  // Map each unique footnote ID to its sequential number (1-based)
  const numberMap = new Map<string, number>()
  for (let i = 0; i < refIds.length; i++) {
    const id = refIds[i]
    if (!numberMap.has(id)) {
      numberMap.set(id, i + 1)
    }
  }

  // Update reference numbers in the DOM
  for (const el of editor.view.dom.querySelectorAll<HTMLElement>("sup[data-footnote-id]")) {
    const id = el.getAttribute("data-footnote-id")
    if (id && numberMap.has(id)) {
      const num = numberMap.get(id)
      if (num !== undefined) el.textContent = String(num)
    }
  }

  // Update content item numbers in the DOM
  for (const el of editor.view.dom.querySelectorAll<HTMLElement>("li[data-footnote-id]")) {
    const id = el.getAttribute("data-footnote-id")
    if (id && numberMap.has(id)) {
      const num = numberMap.get(id)
      const numEl = el.querySelector("[data-fn-num]")
      if (numEl && num !== undefined) {
        numEl.textContent = `${num}.`
      }
    }
  }
}

// ── Backward-compatible alias ──

/** @deprecated Use FootnoteReference instead */
export const FootnoteMark = FootnoteReference
