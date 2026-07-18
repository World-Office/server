import { Node } from "@tiptap/core"
import { mergeAttributes } from "@tiptap/core"

let pageCounter = 0

function nextPageNumber(): number {
  pageCounter++
  return pageCounter
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
      position: { default: "bottom" },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-page-number]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-page-number": "",
        contenteditable: "false",
        style: "display: inline-block; min-width: 2ch; user-select: none; color: #888;",
      }),
      `${nextPageNumber()}`,
    ]
  },
})
