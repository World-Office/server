/**
 * Document Index — index entry marks and index compilation.
 *
 * Features:
 *   • IndexEntry inline node → marks a word for the index ("Rust", see "systems")
 *   • Index node → block placeholder where the compiled index is inserted
 *   • generateIndex() → scans all IndexEntry nodes, groups by first letter,
 *     and replaces the Index node content with the compiled listing
 *   • Sub-entries: "Rust:borrow checker" → nested under "Rust"
 *
 * Usage (from Insert ribbon tab):
 *   1. Select text → click "Mark Entry" → creates IndexEntry covering the selection
 *   2. Place cursor where index should appear → click "Insert Index"
 *   3. Click "Update Index" → compiles all entries into the index node
 */

import { Node, mergeAttributes } from "@tiptap/core"
import type { Editor } from "@tiptap/core"

// ── Index Entry (inline mark, wraps selection) ────────────────────────

export const IndexEntry = Node.create({
  name: "indexEntry",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      term: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-index-term") ?? "",
        renderHTML: (attrs) => ({ "data-index-term": attrs.term as string }),
      },
      subTerm: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-index-sub") ?? "",
        renderHTML: (attrs) => ({ "data-index-sub": attrs.subTerm as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-index-entry]" }]
  },

  renderHTML({ HTMLAttributes }) {
    const term = (HTMLAttributes as Record<string, unknown>).term ?? "entry"
    const sub = (HTMLAttributes as Record<string, unknown>).subTerm ?? ""
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-index-entry": "",
        contenteditable: "false",
        style: [
          "display: inline-block",
          "padding: 0 2px",
          "border-bottom: 1px dashed #e67e22",
          "color: #e67e22",
          "font-size: 10px",
          "font-weight: 600",
          "vertical-align: super",
          "cursor: pointer",
        ].join(";"),
      }),
      sub ? `${term}:${sub}` : term,
    ]
  },
})

// ── Index Block ───────────────────────────────────────────────────────

export const IndexListNode = Node.create({
  name: "indexList",
  group: "block",
  content: "inline*",
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      updated: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-index-updated") ?? "",
        renderHTML: (attrs) => ({ "data-index-updated": attrs.updated as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-index-list]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-index-list": "",
        style: [
          "margin: 16px 0",
          "padding: 8px 12px",
          "border: 1px solid #e0e0e0",
          "border-radius: 4px",
          "column-count: 2",
          "column-gap: 24px",
        ].join(";"),
      }),
      0,
    ]
  },
})

// ── Compilation ───────────────────────────────────────────────────────

interface IndexedTerm {
  term: string
  subTerm: string
  pageNumber: number
}

/**
 * Scan the document, collect all IndexEntry nodes, and return sorted terms.
 */
export function collectIndexEntries(editor: Editor): IndexedTerm[] {
  const entries: IndexedTerm[] = []

  editor.state.doc.descendants((node) => {
    if (node.type.name === "indexEntry") {
      entries.push({
        term: (node.attrs.term as string) || node.textContent,
        subTerm: (node.attrs.subTerm as string) || "",
        pageNumber: 0,
      })
    }
    return true
  })

  return entries
}

/**
 * Group indexed terms by first letter, sorted alphabetically.
 * Returns HTML that can be set as the content of an IndexListNode.
 */
export function generateIndexHtml(entries: IndexedTerm[]): string {
  if (entries.length === 0) return "<p>No index entries found.</p>"

  // Group by letter
  const groups = new Map<string, { term: string; subTerms: string[] }[]>()
  const seen = new Set<string>()

  for (const entry of entries) {
    const firstLetter = entry.term.charAt(0).toUpperCase()
    if (!groups.has(firstLetter)) groups.set(firstLetter, [])

    const key = entry.subTerm ? `${entry.term}\x00${entry.subTerm}` : entry.term
    if (seen.has(key)) continue
    seen.add(key)

    const existing = groups.get(firstLetter)?.find((g) => g.term === entry.term)
    if (existing) {
      if (entry.subTerm && !existing.subTerms.includes(entry.subTerm)) {
        existing.subTerms.push(entry.subTerm)
      }
    } else {
      groups.get(firstLetter)?.push({
        term: entry.term,
        subTerms: entry.subTerm ? [entry.subTerm] : [],
      })
    }
  }

  // Sort within each group
  for (const [, terms] of groups) {
    terms.sort((a, b) => a.term.localeCompare(b.term))
    for (const t of terms) {
      t.subTerms.sort()
    }
  }

  // Build HTML
  const sortedLetters = Array.from(groups.keys()).sort()
  let html = `<div style="column-count: 2; column-gap: 24px;">`

  for (const letter of sortedLetters) {
    const terms = groups.get(letter)
    if (!terms) continue
    html += `<div style="margin-bottom: 12px;">`
    html += `<div style="font-weight: 700; font-size: 14px; color: #0078d4; border-bottom: 1px solid #ddd; margin-bottom: 4px;">${letter}</div>`

    for (const term of terms) {
      html += `<div style="margin: 2px 0; font-size: 12px;">`
      html += `<span style="font-weight: 600;">${term.term}</span>`
      if (term.subTerms.length > 0) {
        for (const sub of term.subTerms) {
          html += `<div style="padding-left: 16px; font-size: 11px; color: #555;">${sub}</div>`
        }
      }
      html += "</div>"
    }

    html += "</div>"
  }

  html += "</div>"
  return html
}

/**
 * Generate the index and update the first IndexListNode in the document.
 */
export function updateIndex(editor: Editor): boolean {
  const entries = collectIndexEntries(editor)

  // Find the first indexList node
  let indexPos = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "indexList" && indexPos === -1) {
      indexPos = pos
    }
    return indexPos === -1
  })

  if (indexPos === -1) return false

  const html = generateIndexHtml(entries)
  editor.chain().focus().setNodeSelection(indexPos).setContent(html).run()

  return true
}
