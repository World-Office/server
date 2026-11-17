/**
 * FieldSpan — inline field placeholder (PAGE, NUMPAGES, DATE, TIME, …).
 *
 * The Insert ▸ Field dialog inserts a named field at the cursor. Until the
 * engine computes live field values, the span renders the field name as its
 * text (OO shows the field code view the same way). Export maps the attr to
 * a w:fldSimple/instrText later; the visible text keeps the document honest.
 */

import { Node, mergeAttributes } from "@tiptap/core"

export const FieldSpan = Node.create({
  name: "fieldSpan",
  group: "inline",
  inline: true,
  content: "text*",

  addAttributes() {
    return {
      field: {
        default: "PAGE",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-wo-field") ?? "PAGE",
        renderHTML: (attrs) => ({ "data-wo-field": attrs.field as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-wo-field]" }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes),
      node.textContent || (node.attrs.field as string),
    ]
  },
})
