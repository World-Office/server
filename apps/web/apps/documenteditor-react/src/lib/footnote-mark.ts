import { Mark, mergeAttributes } from "@tiptap/core"
import type { Editor } from "@tiptap/core"

export const FootnoteMark = Mark.create({
  name: "footnote",

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
    return [{ tag: 'sup[data-footnote-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { class: "footnote-ref" }), 0]
  },
})

export function insertFootnoteCommand(editor: Editor) {
  const id = String(Date.now())
  return editor.chain().focus().insertContent({
    type: "text",
    marks: [{ type: FootnoteMark.name, attrs: { id } }],
    text: id.slice(-3),
  }).run()
}

export const FootnoteContent = Mark.create({
  name: "footnoteContent",

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-footnote-content-id"),
        renderHTML: (attrs) => ({ "data-footnote-content-id": attrs.id }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-footnote-content-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "footnote-content" }), 0]
  },
})
