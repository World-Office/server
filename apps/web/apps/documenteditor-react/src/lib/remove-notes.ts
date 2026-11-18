/**
 * PGP-2 — Notes Remove ("remove all footnotes / endnotes").
 *
 * OO's References ▸ "Notes Remove" dialog deletes every note in the
 * document: the reference mark in the body text and the note content
 * collected at the document bottom. Each command below builds a single
 * transaction so the whole removal is one undo step.
 *
 * Footnote reference marks live in two shapes (see footnote-mark.ts):
 *   - a zero-width-space run inserted at a collapsed cursor (or the generated
 *     reference number of a parsed document) — the reference itself, deleted
 *     with the mark
 *   - a mark applied over a real selection — the body text stays, only the
 *     mark goes away
 * Endnote references are the marked run itself (insertEndnoteCommand writes
 * the id suffix as the superscript text), so fully-marked runs are deleted.
 */

import type { Editor } from "@tiptap/core"
import type { MarkType, Node as PmNode } from "@tiptap/pm/model"
import type { Transaction } from "@tiptap/pm/state"

/** True when a text run holds nothing but invisible placeholder characters. */
const PLACEHOLDER_ONLY = /^[\s\u200B\uFEFF\u00A0]*$/
/** A generated reference number (what the numbering plugin writes into a ref). */
const NUMBER_ONLY = /^\d{1,3}$/

/**
 * A footnote reference run: either the zero-width-space placeholder
 * `insertFootnoteCommand` writes at a collapsed cursor, or the (generated)
 * reference number a parsed document carries. Real text that merely carries
 * the mark — a mark applied over a selection — is kept.
 */
function isFootnoteReferenceRun(node: PmNode): boolean {
  if (!node.isText) return false
  const text = node.text ?? ""
  return PLACEHOLDER_ONLY.test(text) || NUMBER_ONLY.test(text)
}

/** Every inline run is a reference (endnote reference text). */
function isEndnoteReferenceRun(): boolean {
  return true
}

/**
 * Delete every node of the given type name from `doc` inside `tr`.
 * Ranges are removed back-to-front so earlier positions stay valid.
 */
function deleteNodesNamed(tr: Transaction, doc: PmNode, typeName: string): void {
  const ranges: Array<[number, number]> = []
  doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      ranges.push([pos, pos + node.nodeSize])
      return false
    }
    return true
  })
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i]
    if (range) tr.delete(range[0], range[1])
  }
}

/**
 * Strip every occurrence of `markType` from `doc` inside `tr`.
 *
 * Runs for which `isReferenceRun` is true are the reference itself and are
 * deleted; other runs only lose the mark (their text is real body content).
 */
function removeReferenceMarks(
  tr: Transaction,
  doc: PmNode,
  markType: MarkType,
  isReferenceRun: (node: PmNode) => boolean,
): void {
  const deletions: Array<[number, number]> = []
  doc.descendants((node, pos) => {
    if (!node.isInline) return true
    if (!node.marks.some((mark) => mark.type === markType)) return true
    const from = pos
    const to = pos + node.nodeSize
    if (isReferenceRun(node)) {
      deletions.push([from, to])
    } else {
      // No size change → positions collected so far stay valid.
      tr.removeMark(from, to, markType)
    }
    return true
  })
  for (let i = deletions.length - 1; i >= 0; i--) {
    const range = deletions[i]
    if (range) tr.delete(range[0], range[1])
  }
}

/** Which note kinds a removal command targets. */
interface NoteKinds {
  footnotes: boolean
  endnotes: boolean
}

/** Collect the whole removal in one transaction (nothing is dispatched). */
function buildRemovalTransaction(editor: Editor, kinds: NoteKinds): Transaction {
  const { state } = editor
  const tr = state.tr

  if (kinds.footnotes) {
    // Note content: a footnoteSection carries every footnoteItem.
    deleteNodesNamed(tr, tr.doc, "footnoteSection")
    const markType = state.schema.marks.footnoteReference
    if (markType) removeReferenceMarks(tr, tr.doc, markType, isFootnoteReferenceRun)
  }

  if (kinds.endnotes) {
    if (state.schema.nodes.endnoteSection) {
      deleteNodesNamed(tr, tr.doc, "endnoteSection")
    }
    const markType = state.schema.marks.endnote
    if (markType) removeReferenceMarks(tr, tr.doc, markType, isEndnoteReferenceRun)
  }

  return tr
}

function runRemoval(editor: Editor, kinds: NoteKinds): boolean {
  const tr = buildRemovalTransaction(editor, kinds)
  if (tr.steps.length > 0) editor.view.dispatch(tr)
  return true
}

/**
 * Remove every footnote: all footnoteSection nodes (which hold every
 * footnoteItem, i.e. the note content) and all footnoteReference marks.
 * Endnotes are untouched.
 */
export function removeAllFootnotesCommand(editor: Editor): boolean {
  return runRemoval(editor, { footnotes: true, endnotes: false })
}

/**
 * Remove every endnote: all endnote marks (the reference text goes with
 * them) and any endnoteSection node a schema may define. Footnotes are
 * untouched.
 */
export function removeAllEndnotesCommand(editor: Editor): boolean {
  return runRemoval(editor, { footnotes: false, endnotes: true })
}

/** OO "Notes Remove": remove every footnote and endnote in the document. */
export function removeAllNotesCommand(editor: Editor): boolean {
  return runRemoval(editor, { footnotes: true, endnotes: true })
}
