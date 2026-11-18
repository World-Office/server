/**
 * PGP-9 — Form fill status ("Filling status").
 *
 * Scans the document for placed form controls (content controls) and
 * reports which ones are filled and which are still empty — the parity
 * counterpart of the OO Form panel's "Filling status" view.
 *
 * Fill semantics per control kind:
 *  - plain-text: filled iff its text is non-empty and differs from the
 *    placeholder the insert commands pre-fill ("Enter text" / the node's
 *    `placeholder` attr).
 *  - dropdown: filled iff an option is selected — the picked option is
 *    persisted on the node's `value` attr (the node is an atom, so its
 *    text content cannot carry it; "Select..." is the empty render).
 *  - checkbox: filled iff checked.
 *  - date-picker: filled iff a date `value` attr is set.
 */

import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"

import {
  type FormControlKind,
  FORM_CONTROL_LABELS,
  FORM_CONTROL_NODE_TYPES,
} from "./content-controls"

/** Fill report for a single placed control. */
export interface FormControlFillEntry {
  /** Document position directly before the control node. */
  pos: number
  /** Panel-level control kind, e.g. "dropdown". */
  kind: FormControlKind
  /** Control title/tag when set, else the human kind label. */
  label: string
  /** Whether the control counts as filled. */
  filled: boolean
}

/** Whole-document fill summary. */
export interface FormFillStatus {
  /** Total number of placed form controls. */
  total: number
  /** Number of filled controls. */
  filled: number
  /** Number of still-empty controls. */
  empty: number
  /** Per-control entries in document order. */
  entries: FormControlFillEntry[]
}

/** Status of a document without any form controls. */
export const EMPTY_FORM_FILL_STATUS: FormFillStatus = {
  total: 0,
  filled: 0,
  empty: 0,
  entries: [],
}

/** Placeholder text the insert commands pre-fill new text controls with. */
export const TEXT_PLACEHOLDER = "Enter text"

/**
 * Whether a single control counts as filled, given its attrs and text
 * content. Pure so both the doc scan and tests can use it directly.
 */
export function isFormControlFilled(
  kind: FormControlKind,
  attrs: Record<string, unknown>,
  textContent: string,
): boolean {
  const text = textContent.trim()
  switch (kind) {
    case "plain-text":
      if (!text) return false
      // The insert commands pre-fill "Enter text"; a control still showing
      // its placeholder (attr or default) is not answered yet.
      return text !== TEXT_PLACEHOLDER && text !== String(attrs.placeholder ?? "").trim()
    case "dropdown":
      return String(attrs.value ?? "").trim() !== ""
    case "checkbox":
      return attrs.checked === true
    case "date-picker":
      return String(attrs.value ?? "").trim() !== ""
  }
}

/**
 * Scan a ProseMirror document for form-control nodes and compute the
 * filled/empty totals plus a per-control list (document order).
 */
export function computeFormFillStatus(doc: PMNode): FormFillStatus {
  const entries: FormControlFillEntry[] = []
  doc.descendants((node, pos) => {
    const kind = FORM_CONTROL_NODE_TYPES[node.type.name]
    if (!kind) return true
    const attrs = node.attrs as Record<string, unknown>
    const title = String(attrs.title ?? "").trim()
    entries.push({
      pos,
      kind,
      label: title || FORM_CONTROL_LABELS[kind],
      filled: isFormControlFilled(kind, attrs, node.textContent),
    })
    return true
  })
  const filled = entries.filter((entry) => entry.filled).length
  return { total: entries.length, filled, empty: entries.length - filled, entries }
}

/** Fill status of the editor's current document. */
export function getFormFillStatus(editor: Editor): FormFillStatus {
  return computeFormFillStatus(editor.state.doc)
}

/** Short human summary for the panel header, e.g. "2 of 5 filled". */
export function formatFormFillSummary(status: FormFillStatus): string {
  if (status.total === 0) return "No form controls"
  return `${status.filled} of ${status.total} filled`
}
