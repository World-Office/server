/**
 * PageNumber — inline node for page numbers in document headers/footers.
 *
 * Each PageNumber instance shows its sequential position in the document.
 * `PageCount` shows the total number of page-number nodes. Together they
 * can form "Page X of Y" in footers.
 *
 * Renumbering happens automatically via a ProseMirror appendTransaction
 * plugin on the PageNumber node. PageCount is a separate Atom node that
 * shows the total from the plugin state.
 *
 * The ribbon "Insert > Page Number" flow:
 *   1. User clicks "Page Number" in Layout tab (or Insert > Header & Footer)
 *   2. The command inserts the page-number inline + a "Page Count" node
 *      surrounded by "Page " and " of " boilerplate text.
 */

import { Node, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

const pageNumberPluginKey = new PluginKey("pageNumber")

/**
 * Count all page-number nodes in the doc and return total + update tr.
 */
function renumber(tr: import("@tiptap/pm/state").Transaction): boolean {
  let seq = 0
  let total = 0

  // First pass: count total
  tr.doc.descendants((node) => {
    if (node.type.name === "pageNumber") total++
    return true
  })

  // Second pass: update positions + store total in meta
  seq = 0
  tr.doc.descendants((node, pos) => {
    if (node.type.name === "pageNumber") {
      seq++
      if ((node.attrs.position as number) !== seq) {
        tr.setNodeMarkup(pos, undefined, { position: seq, total })
      }
    }
    return true
  })

  // Also update total on all existing nodes even if positions didn't change
  seq = 0
  tr.doc.descendants((node, pos) => {
    if (node.type.name === "pageNumber") {
      seq++
      if ((node.attrs.total as number) !== total) {
        tr.setNodeMarkup(pos, undefined, { position: seq, total })
      }
    }
    return true
  })

  return true
}

export const PageNumber = Node.create({
  name: "pageNumber",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      position: { default: 1 },
      total: { default: 1 },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-page-number]" }]
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>
    const num = attrs.position ?? 1
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-page-number": "",
        "data-pn-num": String(num),
        contenteditable: "false",
        style:
          "display: inline-block; min-width: 1.5ch; user-select: none; color: currentColor; font-variant-numeric: tabular-nums;",
      }),
      String(num),
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pageNumberPluginKey,
        appendTransaction(_transactions, _oldState, newState) {
          const tr = newState.tr
          const changed = renumber(tr)
          return changed ? tr : null
        },
      }),
    ]
  },
})

/**
 * PageCount — renders the total number of pages in the document.
 * Useful for "Page X of Y" footer text.
 */
export const PageCount = Node.create({
  name: "pageCount",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      total: { default: 1 },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-page-count]" }]
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>
    const total = attrs.total ?? 1
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-page-count": "",
        "data-pc-total": String(total),
        contenteditable: "false",
        style:
          "display: inline-block; min-width: 1.5ch; user-select: none; color: currentColor; font-variant-numeric: tabular-nums;",
      }),
      String(total),
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("pageCount"),
        appendTransaction(_transactions, _oldState, newState) {
          // Re-read total from first pageNumber and update all PageCount nodes
          let total = 0
          newState.doc.descendants((node) => {
            if (node.type.name === "pageNumber") total++
            return true
          })
          if (total === 0) total = 1

          const tr = newState.tr
          let needsUpdate = false
          tr.doc.descendants((node, pos) => {
            if (node.type.name === "pageCount") {
              if ((node.attrs.total as number) !== total) {
                tr.setNodeMarkup(pos, undefined, { total })
                needsUpdate = true
              }
            }
            return true
          })

          return needsUpdate ? tr : null
        },
      }),
    ]
  },
})
