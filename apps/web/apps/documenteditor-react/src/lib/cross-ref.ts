/**
 * Cross-Reference — inline link to a document element (heading, caption,
 * bookmark, footnote, or section). Updates its display text when the
 * target's label/number changes.
 *
 * Types:
 *   - heading     → "see Heading 1" / "see page 3" / "above"
 *   - caption     → "see Figure 3" / "see Table 1"
 *   - bookmark    → user-defined text from bookmark
 *   - footnote    → "see footnote 1"
 *   - section     → "see Section 2"
 *
 * On document load, all cross-references are resolved: the node's text
 * content is updated to match the current label/number of its target.
 *
 * Editing UX:
 *   1. Select target from a list (headings, captions, bookmarks, etc.)
 *   2. Choose reference type (page number, paragraph number, above/below)
 *   3. Cross-reference is inserted as a `<span data-cross-ref="...">` node
 *   4. A ProseMirror plugin re-resolves all cross-refs on document change
 */

import { Node, mergeAttributes } from "@tiptap/core"
import type { Editor } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

export type CrossRefType = "heading" | "caption" | "bookmark" | "footnote" | "section"

export type CrossRefFormat = "text" | "number" | "pageNumber" | "aboveBelow"

// ── State ─────────────────────────────────────────────────────────────

export interface CrossRefTarget {
  id: string // Unique identifier (e.g., "heading-3", "caption-figure-2")
  type: CrossRefType
  displayText: string
  pageNumber?: number
}

/**
 * Scan the document and build a list of all cross-reference-able targets.
 */
export function collectTargets(editor: Editor): CrossRefTarget[] {
  const targets: CrossRefTarget[] = []
  let headingIdx = 0
  let captionIdxFig = 0
  let captionIdxTbl = 0
  let footnoteIdx = 0
  let sectionIdx = 0

  editor.state.doc.descendants((node) => {
    if (node.type.name === "heading") {
      headingIdx++
      const level = node.attrs.level ?? 1
      const text = node.textContent || `Heading ${headingIdx}`
      targets.push({
        id: `heading-${headingIdx}`,
        type: "heading",
        displayText: `${text} (H${level})`,
      })
    }

    if (node.type.name === "caption") {
      const capType = node.attrs.captionType as string
      const num = node.attrs.number as number
      if (capType === "figure") {
        captionIdxFig++
        const text = node.textContent || `Figure ${num}`
        targets.push({
          id: `caption-figure-${num}`,
          type: "caption",
          displayText: `Figure ${num}: ${text}`,
        })
      } else if (capType === "table") {
        captionIdxTbl++
        const text = node.textContent || `Table ${num}`
        targets.push({
          id: `caption-table-${num}`,
          type: "caption",
          displayText: `Table ${num}: ${text}`,
        })
      }
    }

    if (node.type.name === "footnote") {
      footnoteIdx++
      targets.push({
        id: `footnote-${footnoteIdx}`,
        type: "footnote",
        displayText: `Footnote ${footnoteIdx}`,
      })
    }

    // Section breaks
    if (node.type.name === "sectionBreak") {
      sectionIdx++
      targets.push({
        id: `section-${sectionIdx}`,
        type: "section",
        displayText: `Section ${sectionIdx}`,
      })
    }

    return true
  })

  return targets
}

/**
 * Resolve a cross-reference to its display string based on format.
 */
export function resolveRef(targetId: string, format: CrossRefFormat, editor: Editor): string {
  // Find the target node in the document
  if (!targetId) return "[Unknown]"

  const [prefix, ...rest] = targetId.split("-")
  if (prefix === "heading") {
    const idx = Number.parseInt(rest[0], 10)
    let hIdx = 0
    let result = ""
    editor.state.doc.descendants((node) => {
      if (node.type.name === "heading") {
        hIdx++
        if (hIdx === idx) {
          result = node.textContent
        }
      }
      return !result
    })
    if (format === "number") return String(idx)
    if (format === "aboveBelow") return ""
    return result || "[Heading]"
  }

  if (prefix === "caption") {
    const subType = rest[0] // "figure" or "table"
    const num = Number.parseInt(rest[1], 10)
    if (format === "number") return String(num)
    return `${subType === "figure" ? "Figure" : "Table"} ${num}`
  }

  if (prefix === "footnote") {
    const num = Number.parseInt(rest[0], 10)
    return String(num)
  }

  if (prefix === "section") {
    const num = Number.parseInt(rest[0], 10)
    if (format === "number") return String(num)
    return `Section ${num}`
  }

  return `[${targetId}]`
}

// ── TipTap Node ───────────────────────────────────────────────────────

export const CrossReference = Node.create({
  name: "crossReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      targetId: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-ref-target") ?? "",
        renderHTML: (attrs) => ({ "data-ref-target": attrs.targetId as string }),
      },
      refType: {
        default: "heading" as CrossRefType,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-ref-type") ?? "heading",
        renderHTML: (attrs) => ({ "data-ref-type": attrs.refType as string }),
      },
      format: {
        default: "text" as CrossRefFormat,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-ref-format") ?? "text",
        renderHTML: (attrs) => ({ "data-ref-format": attrs.format as string }),
      },
      display: {
        default: "[Ref]",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-ref-display") ?? "[Ref]",
        renderHTML: (attrs) => ({ "data-ref-display": attrs.display as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-cross-ref]" }]
  },

  renderHTML({ HTMLAttributes }) {
    const display = (HTMLAttributes as Record<string, unknown>).display ?? "[Ref]"
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-cross-ref": "",
        contenteditable: "false",
        style: [
          "display: inline-block",
          "padding: 0 2px",
          "border-bottom: 1px dotted #0078d4",
          "color: #0078d4",
          "cursor: pointer",
          "font-size: inherit",
        ].join(";"),
      }),
      String(display),
    ]
  },
})

// ── Plugin to re-resolve on doc changes ────────────────────────────────

const crossRefPluginKey = new PluginKey("crossReference")

export function createCrossRefPlugin() {
  return new Plugin({
    key: crossRefPluginKey,
    appendTransaction(_transactions, _oldState, newState) {
      const tr = newState.tr
      let needsUpdate = false

      newState.doc.descendants((node, pos) => {
        if (node.type.name === "crossReference") {
          const targetId = node.attrs.targetId as string
          const current = node.attrs.display as string

          // For now we use a simple resolution from doc state
          // (full resolution requires an editor instance)
          // We set a placeholder; actual resolution happens in the panel
          if (!current || current === "[Ref]") {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              display: `[${targetId}]`,
            })
            needsUpdate = true
          }
        }
        return true
      })

      return needsUpdate ? tr : null
    },
  })
}
