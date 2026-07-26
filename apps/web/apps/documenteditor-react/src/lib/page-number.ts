/**
 * PageNumber — an inline node that renders as a stable page number.
 *
 * Each PageNumber instance is numbered sequentially based on its position
 * in the document. The numbering is computed by a ProseMirror plugin that
 * counts all PageNumber nodes in document order, ensuring proper sequence
 * even after insertions, deletions, or reordering.
 *
 * The raw attribute `position` stores the render-index at node creation time
 * for backward compatibility; the actual displayed number comes from the
 * plugin's sequential count.
 */

import { Node, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

const pageNumberPluginKey = new PluginKey("pageNumber")

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
    }
  },

  parseHTML() {
    return [{ tag: "span[data-page-number]" }]
  },

  renderHTML({ HTMLAttributes }) {
    const num = (HTMLAttributes as Record<string, unknown>).position ?? 1
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-page-number": "",
        "data-pn-num": String(num),
        contenteditable: "false",
        style: "display: inline-block; min-width: 2ch; user-select: none; color: #888;",
      }),
      String(num),
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pageNumberPluginKey,
        appendTransaction(_transactions, _oldState, newState) {
          // Check if renumbering is needed
          let needsUpdate = false
          let idx = 0
          newState.doc.descendants((node, _pos) => {
            if (node.type.name === "pageNumber") {
              idx++
              const storedNum = node.attrs.position as number
              if (storedNum !== idx) needsUpdate = true
            }
            return true
          })

          if (!needsUpdate) return null

          // Renumber all page numbers
          const tr = newState.tr
          let seq = 0
          tr.doc.descendants((node, pos) => {
            if (node.type.name === "pageNumber") {
              seq++
              if ((node.attrs.position as number) !== seq) {
                tr.setNodeMarkup(pos, undefined, { position: seq })
              }
            }
            return true
          })

          return tr.steps.length > 0 ? tr : null
        },
      }),
    ]
  },
})
