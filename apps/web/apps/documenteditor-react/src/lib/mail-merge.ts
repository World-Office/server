/**
 * Mail Merge — merge field node for document personalization.
 *
 * Usage:
 *   1. User inserts merge fields (e.g. «FirstName», «LastName») into the document
 *   2. User provides a data source (CSV text pasted or uploaded)
 *   3. Preview renders the document with actual values from each record
 *   4. Merge to new document creates a new doc with all records expanded
 */

import { Node, mergeAttributes } from "@tiptap/core"

// ── Merge Field Node ──────────────────────────────────────────────────

export const MergeField = Node.create({
  name: "mergeField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      name: {
        default: "Field",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-field-name") ?? "Field",
        renderHTML: (attrs) => ({ "data-field-name": attrs.name as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-merge-field]" }]
  },

  renderHTML({ HTMLAttributes }) {
    const name = (HTMLAttributes as Record<string, unknown>).name ?? "Field"
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-merge-field": "",
        "data-field-name": name,
        contenteditable: "false",
        style: [
          "display: inline-block",
          "padding: 0 3px",
          "border: 1px solid #6a6aff",
          "border-radius: 3px",
          "background: #eef",
          "color: #6a6aff",
          "font-size: 10px",
          "font-weight: 600",
          "text-transform: uppercase",
          "letter-spacing: 0.5px",
          "cursor: pointer",
          "user-select: none",
          "line-height: 1.4",
        ].join(";"),
      }),
      `\u00AB${name}\u00BB`,
    ]
  },
})

// ── Data Types ────────────────────────────────────────────────────────

export interface MergeRecord {
  [field: string]: string
}

export interface MailMergeData {
  fields: string[]
  records: MergeRecord[]
}

// ── Merge Logic ───────────────────────────────────────────────────────

/**
 * Parse CSV text into structured data.
 * First row is treated as header (field names).
 */
export function parseCsv(text: string): MailMergeData {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return { fields: [], records: [] }
  }

  const fields = parseCsvLine(lines[0])
  const records: MergeRecord[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    const record: MergeRecord = {}
    fields.forEach((f, idx) => {
      record[f] = values[idx] ?? ""
    })
    records.push(record)
  }

  return { fields, records }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

/**
 * Extract all merge field names from a TipTap HTML string.
 */
export function extractMergeFields(html: string): string[] {
  const fieldSet = new Set<string>()
  const regex = /data-field-name="([^"]+)"/g
  let match: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
  while ((match = regex.exec(html)) !== null) {
    fieldSet.add(match[1])
  }
  return Array.from(fieldSet)
}

/**
 * Replace merge field markers with actual values for preview.
 */
export function previewMerge(html: string, record: MergeRecord): string {
  return html.replace(
    /<span[^>]*data-merge-field[^>]*data-field-name="([^"]*)"[^>]*>.*?<\/span>/g,
    (_match, fieldName: string) => {
      return record[fieldName] ?? `\u00AB${fieldName}\u00BB`
    },
  )
}

/**
 * Generate the full merged document (all records).  Each record's content
 * is wrapped in a page-break div, so the result can be inserted as a new doc.
 */
export function mergeAllRecords(baseHtml: string, data: MailMergeData): string {
  return data.records
    .map((record, i) => {
      const merged = previewMerge(baseHtml, record)
      if (i === 0) return merged
      return `<div style="page-break-before: always;">${merged}</div>`
    })
    .join("\n")
}

// ── React component state (shared via store reference) ────────────────

interface MailMergeState {
  data: MailMergeData
  visible: boolean
  currentRecordIndex: number
}

const defaultState: MailMergeState = {
  data: { fields: [], records: [] },
  visible: false,
  currentRecordIndex: 0,
}

// Use a simple module-level mutable state rather than MobX to avoid circular deps
// The panel component imports and mutates this directly.
export const mailMergeState: MailMergeState = { ...defaultState }

export function resetMailMerge(): void {
  mailMergeState.data = { fields: [], records: [] }
  mailMergeState.currentRecordIndex = 0
}
