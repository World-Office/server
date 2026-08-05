/**
 * Caption — auto-numbered label for figures, tables, equations, and code listings.
 *
 * Each caption consists of a label prefix ("Figure", "Table", "Equation", "Listing")
 * followed by a sequential number and an optional description.
 *
 * Captions are stored as a single inline node that auto-numbers based on position
 * within the document (like footnotes). A ProseMirror plugin renumbers all captions
 * on each document change.
 *
 * Usage:
 *   editor.commands.insertCaption("figure", "A beautiful chart")
 *   → 「Figure 1: A beautiful chart」
 */

import { Node, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

export type CaptionType = "figure" | "table" | "equation" | "listing"

const CAPTION_LABELS: Record<CaptionType, string> = {
  figure: "Figure",
  table: "Table",
  equation: "Equation",
  listing: "Listing",
}

const CAPTION_COLORS: Record<CaptionType, string> = {
  figure: "#0078d4",
  table: "#2ecc71",
  equation: "#e67e22",
  listing: "#9b59b6",
}

const captionPluginKey = new PluginKey("captionNumbering")

export const Caption = Node.create({
  name: "caption",
  group: "block",
  content: "inline*",
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      captionType: {
        default: "figure" as CaptionType,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-caption-type") ?? "figure",
        renderHTML: (attrs) => ({
          "data-caption-type": attrs.captionType as string,
        }),
      },
      number: {
        default: 1,
        parseHTML: (el) =>
          Number.parseInt((el as HTMLElement).getAttribute("data-caption-num") ?? "1", 10),
        renderHTML: (attrs) => ({
          "data-caption-num": String(attrs.number ?? 1),
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-caption]" }]
  },

  renderHTML({ HTMLAttributes }) {
    const type = (HTMLAttributes.captionType ?? "figure") as CaptionType
    const num = HTMLAttributes.number ?? 1
    const label = CAPTION_LABELS[type] ?? "Figure"
    const color = CAPTION_COLORS[type] ?? "#0078d4"

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-caption": "",
        "data-caption-type": type,
        "data-caption-num": String(num),
        style: [
          "display: flex",
          "align-items: baseline",
          "gap: 4px",
          "margin: 8px 0 4px 0",
          "padding: 4px 8px",
          `border-left: 3px solid ${color}`,
          "font-size: 12px",
          "color: #555",
          "line-height: 1.4",
        ].join(";"),
      }),
      [
        "span",
        {
          "data-caption-label": "",
          style: ["font-weight: 600", `color: ${color}`, "white-space: nowrap"].join(";"),
        },
        `${label} ${num}:`,
      ],
      [
        "span",
        {
          "data-caption-text": "",
          style: "flex: 1;",
        },
        0,
      ],
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: captionPluginKey,
        appendTransaction(_transactions, _oldState, newState) {
          const tr = newState.tr
          const counts = new Map<CaptionType, number>()

          // First pass: count captions by type
          newState.doc.descendants((node) => {
            if (node.type.name === "caption") {
              const capType = node.attrs.captionType as CaptionType
              counts.set(capType, (counts.get(capType) ?? 0) + 1)
            }
            return true
          })

          // Second pass: renumber
          const currentCounts = new Map<CaptionType, number>()
          let needsUpdate = false

          tr.doc.descendants((node, pos) => {
            if (node.type.name === "caption") {
              const capType = node.attrs.captionType as CaptionType
              const seq = (currentCounts.get(capType) ?? 0) + 1
              currentCounts.set(capType, seq)

              if ((node.attrs.number as number) !== seq) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  number: seq,
                })
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

export { CAPTION_LABELS, CAPTION_COLORS }
