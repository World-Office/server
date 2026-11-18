import { Mark, mergeAttributes } from "@tiptap/core"
import type { Editor } from "@tiptap/core"

export const EndnoteMark = Mark.create({
  name: "endnote",

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-endnote-id"),
        renderHTML: (attrs) => ({ "data-endnote-id": attrs.id }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "sup[data-endnote-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { class: "endnote-ref" }), 0]
  },
})

export function insertEndnoteCommand(editor: Editor) {
  const id = `en-${String(Date.now())}`
  return editor
    .chain()
    .focus()
    .insertContent({
      type: "text",
      marks: [{ type: EndnoteMark.name, attrs: { id } }],
      text: id.slice(-3),
    })
    .run()
}

// ── Notes Remove (PGP-2) ──
//
// The implementation lives in remove-notes.ts (it shares its mark/section
// traversal with the footnote removal); re-exported here so the whole
// endnote API is reachable from endnote-mark.ts.

export { removeAllEndnotesCommand, removeAllNotesCommand } from "./remove-notes"
