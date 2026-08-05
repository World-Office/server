/**
 * SectionBreak — structural document divider.
 *
 * Section breaks delimit portions of a document that can have independent
 * page layout settings (margins, orientation, columns, headers/footers,
 * page numbering).
 *
 * Types:
 *   - next-page:   New section starts at the top of the next page
 *   - continuous:  New section starts immediately on the same page
 *   - even-page:   New section starts at the next even-numbered page
 *   - odd-page:    New section starts at the next odd-numbered page
 *
 * In the editor, each section break is rendered as a visible horizontal
 * rule with a label ("Section Break (Next Page)"). During print/export,
 * they map to CSS page-break rules.
 */

import { Node, mergeAttributes } from "@tiptap/core"

export type SectionBreakType = "next-page" | "continuous" | "even-page" | "odd-page"

const SECTION_BREAK_LABELS: Record<SectionBreakType, string> = {
  "next-page": "Section Break (Next Page)",
  continuous: "Section Break (Continuous)",
  "even-page": "Section Break (Even Page)",
  "odd-page": "Section Break (Odd Page)",
}

const SECTION_BREAK_CSS: Record<SectionBreakType, string> = {
  "next-page": "border-top: 2px dashed #0078d4; page-break-before: always;",
  continuous: "border-top: 1px dashed #999;",
  "even-page": "border-top: 2px dashed #2ecc71; page-break-before: always;",
  "odd-page": "border-top: 2px dashed #e67e22; page-break-before: always;",
}

export const SectionBreak = Node.create({
  name: "sectionBreak",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      type: {
        default: "next-page" as SectionBreakType,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-section-type") ?? "next-page",
        renderHTML: (attrs) => ({
          "data-section-type": attrs.type as string,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-section-break]" }]
  },

  renderHTML({ HTMLAttributes }) {
    const type = (HTMLAttributes.type ?? "next-page") as SectionBreakType
    const label = SECTION_BREAK_LABELS[type] ?? "Section Break"
    const css = SECTION_BREAK_CSS[type] ?? SECTION_BREAK_CSS["next-page"]

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-section-break": "",
        "data-section-type": type,
        contenteditable: "false",
        style: [
          css,
          "display: flex",
          "align-items: center",
          "gap: 8px",
          "margin: 12px 0",
          "padding: 4px 0",
          "user-select: none",
        ].join(";"),
      }),
      [
        "span",
        {
          style: ["flex: 1", "height: 0", css, "margin: 0 !important"].join(";"),
        },
      ],
      [
        "span",
        {
          style: [
            "font-size: 11px",
            "color: #888",
            "white-space: nowrap",
            "padding: 2px 8px",
            "background: #f5f5f5",
            "border-radius: 3px",
            "border: 1px solid #ddd",
          ].join(";"),
        },
        label,
      ],
      [
        "span",
        {
          style: ["flex: 1", "height: 0", css, "margin: 0 !important"].join(";"),
        },
      ],
    ]
  },
})

/**
 * Map section break type to a CSS page-break rule for export/print.
 */
export function sectionBreakToCss(type: SectionBreakType): string {
  switch (type) {
    case "next-page":
      return "page-break-before: always; break-before: page;"
    case "continuous":
      return ""
    case "even-page":
      return "page-break-before: always; break-before: page;"
    case "odd-page":
      return "page-break-before: always; break-before: page;"
  }
}
