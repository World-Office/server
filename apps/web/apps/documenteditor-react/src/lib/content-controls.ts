/**
 * Interactive content controls — click handlers for dropdown, checkbox,
 * and date-picker content controls.
 *
 * Each control node stores its state in ProseMirror attributes and
 * responds to click events to toggle or update that state.
 *
 * PGP-4 — post-insert editing: placed controls can be edited through the
 * FormPanel (dropdown option list, control title/tag, placeholder, …).
 * The helpers below locate the control at the selection (or a click),
 * snapshot its attrs and write updates back via chain.updateAttributes.
 * The edit path never blocks on window.prompt.
 */

import { type Editor, Node } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { mergeAttributes } from "@tiptap/react"
import { documentStore } from "../stores/DocumentStore"

/** Panel-level control kinds (mirrors the data-content-control values). */
export type FormControlKind = "plain-text" | "dropdown" | "checkbox" | "date-picker"

/** TipTap node type name → panel-level control kind. */
export const FORM_CONTROL_NODE_TYPES: Record<string, FormControlKind> = {
  plainTextControl: "plain-text",
  dropdownControl: "dropdown",
  checkboxControl: "checkbox",
  datePickerControl: "date-picker",
}

/** Human labels for each control kind (used by the FormPanel edit section). */
export const FORM_CONTROL_LABELS: Record<FormControlKind, string> = {
  "plain-text": "Plain Text",
  dropdown: "Dropdown",
  checkbox: "Checkbox",
  "date-picker": "Date Picker",
}

/** A form-control node located in the document, with an attr snapshot. */
export interface SelectedFormControl {
  /** Document position directly before the control node. */
  pos: number
  /** TipTap node type name, e.g. "dropdownControl". */
  nodeTypeName: string
  /** Panel-level kind, e.g. "dropdown". */
  kind: FormControlKind
  /** Snapshot of the node attributes (copied). */
  attrs: Record<string, unknown>
}

/* -------------------------------------------------------------------------
 * PGP-4 helpers: option-list conversion + control lookup/update.
 * ---------------------------------------------------------------------- */

/** Split the stored comma-separated options attribute into clean items. */
export function splitDropdownOptions(options: string): string[] {
  return options
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Comma-separated options attr → one-option-per-line textarea text. */
export function dropdownOptionsToLines(options: string): string {
  return splitDropdownOptions(options).join("\n")
}

/** Textarea lines → comma-separated options attr (blanks dropped, kept order). */
export function linesToDropdownOptions(lines: string): string {
  return lines
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ")
}

function controlFromNode(
  node: PMNode | null | undefined,
  pos: number,
): SelectedFormControl | null {
  const name = (node as { type?: { name?: string } } | null | undefined)?.type?.name
  if (!node || !name) return null
  const kind = FORM_CONTROL_NODE_TYPES[name]
  if (!kind) return null
  return {
    pos,
    nodeTypeName: name,
    kind,
    attrs: { ...(node.attrs as Record<string, unknown>) },
  }
}

/** nodeAt that tolerates bogus positions (returns null instead of throwing). */
function safeNodeAt(editor: Editor, pos: number): PMNode | null {
  try {
    return editor.state.doc.nodeAt(pos)
  } catch {
    return null
  }
}

/**
 * Prefer the live node attrs at the control position; fall back to the
 * snapshot taken when the control was located.
 */
function controlAttrs(
  editor: Editor,
  control: SelectedFormControl,
): Record<string, unknown> {
  return (safeNodeAt(editor, control.pos)?.attrs as Record<string, unknown>) ?? control.attrs
}

/**
 * Locate the form control at (or immediately around) a document position —
 * used by the click handler: the node directly at the position, the inline
 * node just before/after it (clicks on atom spans resolve one past their
 * start), or any ancestor control (cursor inside a plain-text control).
 */
export function findFormControlAt(editor: Editor, pos: number): SelectedFormControl | null {
  const doc = editor.state.doc

  const direct = controlFromNode(safeNodeAt(editor, pos), pos)
  if (direct) return direct

  let resolved: ReturnType<typeof doc.resolve>
  try {
    resolved = doc.resolve(pos)
  } catch {
    return null
  }

  const before = resolved.nodeBefore
  if (before) {
    const found = controlFromNode(before, pos - before.nodeSize)
    if (found) return found
  }
  const after = resolved.nodeAfter
  if (after) {
    const found = controlFromNode(after, pos)
    if (found) return found
  }
  // Ancestors (innermost first); depth 0 is the doc itself, skip it.
  for (let depth = resolved.depth; depth >= 1; depth--) {
    const found = controlFromNode(resolved.node(depth), resolved.before(depth))
    if (found) return found
  }
  // Legacy/mock surfaces only expose `parent`.
  return controlFromNode((resolved as unknown as { parent?: PMNode }).parent, pos)
}

/**
 * The form control the editor selection currently sits on: either a
 * NodeSelection on a control, or a cursor inside one (plain-text). Returns
 * null when the selection is not on a control.
 */
export function getSelectedFormControl(editor: Editor): SelectedFormControl | null {
  const { selection } = editor.state
  const selectedNode = (selection as unknown as { node?: PMNode }).node
  if (selectedNode) {
    const found = controlFromNode(selectedNode, selection.from)
    if (found) return found
  }
  // Cursor-based selection: only a control *containing* the cursor counts
  // (merely sitting next to one does not open the editor).
  const { $from } = selection
  for (let depth = $from.depth; depth >= 1; depth--) {
    const found = controlFromNode($from.node(depth), $from.before(depth))
    if (found) return found
  }
  return null
}

/**
 * Write new attributes to the control node at `target.pos`. Returns false
 * (and changes nothing) when the node no longer matches, e.g. it was
 * deleted or replaced while the panel was open.
 */
export function updateFormControl(
  editor: Editor,
  target: { pos: number; nodeTypeName: string },
  attrs: Record<string, unknown>,
): boolean {
  const node = safeNodeAt(editor, target.pos)
  if (!node || node.type.name !== target.nodeTypeName) return false
  const updated = editor
    .chain()
    .focus()
    .setNodeSelection(target.pos)
    .updateAttributes(target.nodeTypeName, attrs)
    .run()
  // updateAttributes replaces the node, which drops the NodeSelection —
  // re-select so panel/state keep pointing at the (still placed) control.
  editor.commands.setNodeSelection(target.pos)
  return updated
}

/**
 * PGP-4 — open the Form panel editor for a placed control: selects the node
 * (so FormPanel picks it up) and reveals the Form Controls panel. Pass a
 * `pos` to target a clicked control, or omit it to edit the selection.
 * Returns the control, or null when there is nothing to edit.
 */
export function editFormControl(editor: Editor, pos?: number): SelectedFormControl | null {
  const control =
    pos === undefined ? getSelectedFormControl(editor) : findFormControlAt(editor, pos)
  if (!control) return null
  editor.chain().focus().setNodeSelection(control.pos).run()
  // Reveal the Form Controls panel (without toggling an open one closed).
  if (documentStore.activeRightPanel !== "form") documentStore.rightMenuVisible = true
  documentStore.setActiveRightPanel("form")
  return control
}

/* -------------------------------------------------------------------------
 * Click interactions (dropdown popup, checkbox toggle, date prompt).
 * ---------------------------------------------------------------------- */

/**
 * Dropdown click: show a quick-pick popup for a configured list; for a
 * control without options yet, open the Form panel editor instead of
 * blocking on a window.prompt (PGP-4 edit path).
 */
function promptDropdown(editor: Editor, control: SelectedFormControl) {
  const attrs = controlAttrs(editor, control)
  const options = splitDropdownOptions(String(attrs.options ?? ""))
  const pos = control.pos
  const current = safeNodeAt(editor, pos)?.textContent ?? ""

  if (options.length === 0) {
    editFormControl(editor, pos)
    return
  }

  // Keep the control selected so the Form panel reflects what was clicked.
  editor.chain().focus().setNodeSelection(pos).run()

  // Create a quick select-like popup
  const select = document.createElement("select")
  select.style.cssText =
    "position: fixed; z-index: 10000; padding: 4px; font-size: 13px; border: 1px solid #999; border-radius: 3px; background: #fff;"

  // Add blank option
  const blankOption = document.createElement("option")
  blankOption.value = ""
  blankOption.textContent = current || "Select..."
  select.appendChild(blankOption)

  for (const opt of options) {
    const el = document.createElement("option")
    el.value = opt
    el.textContent = opt
    if (opt === current) el.selected = true
    select.appendChild(el)
  }

  select.addEventListener("change", () => {
    const val = select.value
    if (val) {
      editor.chain().focus().setNodeSelection(pos).insertContentAt(pos, val).run()
    }
    document.body.removeChild(select)
  })

  select.addEventListener("blur", () => {
    if (document.body.contains(select)) {
      document.body.removeChild(select)
    }
  })

  // Position near the clicked element
  const selection = window.getSelection()
  if (selection?.rangeCount) {
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    select.style.left = `${rect.left}px`
    select.style.top = `${rect.bottom + 4}px`
  } else {
    select.style.left = "100px"
    select.style.top = "200px"
  }

  document.body.appendChild(select)
  select.focus()
}

function toggleCheckbox(editor: Editor, control: SelectedFormControl) {
  const checked = controlAttrs(editor, control).checked === true
  editor
    .chain()
    .focus()
    .setNodeSelection(control.pos)
    .updateAttributes("checkboxControl", { checked: !checked })
    .run()
}

function promptDate(editor: Editor, control: SelectedFormControl) {
  const current = String(controlAttrs(editor, control).value ?? "")
  const dateStr = window.prompt(
    "Enter date (YYYY-MM-DD):",
    current || new Date().toISOString().slice(0, 10),
  )
  if (dateStr) {
    editor
      .chain()
      .focus()
      .setNodeSelection(control.pos)
      .updateAttributes("datePickerControl", { value: dateStr })
      .run()
  }
}

/** Shared `title` (control tag) attribute — editable in the Form panel. */
function titleAttribute() {
  return {
    title: {
      default: "",
      parseHTML: (el: HTMLElement) => el.getAttribute("data-title") ?? "",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.title ? { "data-title": String(attrs.title) } : {},
    },
  }
}

/**
 * PlainTextControl — editable inline text with dashed-underline styling.
 */
export const PlainTextControl = Node.create({
  name: "plainTextControl",
  group: "inline",
  inline: true,
  content: "inline*",
  draggable: true,

  addAttributes() {
    return {
      placeholder: {
        default: "Enter text",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-placeholder") ?? "Enter text",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-placeholder": String(attrs.placeholder ?? ""),
        }),
      },
      ...titleAttribute(),
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-content-control="plain-text"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-content-control": "plain-text",
        style:
          "border-bottom: 1px dotted #999; padding: 0 4px; min-width: 80px; display: inline-block;",
      }),
      0,
    ]
  },
})

/**
 * DropdownControl — interactive dropdown that shows a select popup on click.
 */
export const DropdownControl = Node.create({
  name: "dropdownControl",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      options: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-options") ?? "",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-options": String(attrs.options ?? ""),
        }),
      },
      ...titleAttribute(),
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-content-control="dropdown"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const value = node.textContent || "Select..."
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-content-control": "dropdown",
        style:
          "border: 1px solid #999; padding: 2px 6px; display: inline-block; min-width: 80px; cursor: pointer; border-radius: 3px; background: #f9f9f9;",
      }),
      value,
    ]
  },
})

/**
 * CheckboxControl — toggleable checkbox that responds to clicks.
 */
export const CheckboxControl = Node.create({
  name: "checkboxControl",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      checked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-checked") === "true",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-checked": attrs.checked ? "true" : "false",
        }),
      },
      ...titleAttribute(),
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-content-control="checkbox"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const checked = node.attrs.checked as boolean
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-content-control": "checkbox",
        contenteditable: "false",
        style: [
          "display: inline-flex",
          "align-items: center",
          "justify-content: center",
          "width: 18px",
          "height: 18px",
          "border: 2px solid #555",
          "border-radius: 3px",
          "vertical-align: middle",
          "cursor: pointer",
          "font-size: 12px",
          "line-height: 1",
          "user-select: none",
          checked ? "background: #2ecc71; color: #fff;" : "background: #fff;",
        ].join(";"),
      }),
      checked ? "✓" : "",
    ]
  },
})

/**
 * DatePickerControl — click to edit date value via prompt.
 */
export const DatePickerControl = Node.create({
  name: "datePickerControl",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      value: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-value") ?? "",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-value": String(attrs.value ?? ""),
        }),
      },
      format: { default: "YYYY-MM-DD" },
      ...titleAttribute(),
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-content-control="date-picker"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const value = (node.attrs.value as string) || new Date().toISOString().slice(0, 10)
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-content-control": "date-picker",
        contenteditable: "false",
        style:
          "border-bottom: 1px dotted #999; padding: 0 6px; display: inline-block; min-width: 100px; cursor: pointer; color: #333;",
      }),
      value,
    ]
  },
})

/**
 * Register click handlers on the editor for all interactive content controls.
 * Call this after the editor is created (e.g. in the RichTextEditor's onCreate).
 */
export function registerContentControlHandlers(editor: Editor): void {
  editor.view.dom.addEventListener("click", (event: MouseEvent) => {
    if (!event.target) return

    const target = event.target as HTMLElement
    const controlType = target.getAttribute("data-content-control")
    if (!controlType) return

    // Find the ProseMirror position of the clicked node
    const { view } = editor
    const domPos = view.posAtDOM(target, 0)
    if (domPos === undefined || domPos === null) return

    const control = findFormControlAt(editor, domPos)
    if (!control) return

    switch (control.kind) {
      case "dropdown":
        event.preventDefault()
        promptDropdown(editor, control)
        break
      case "checkbox":
        event.preventDefault()
        toggleCheckbox(editor, control)
        break
      case "date-picker":
        event.preventDefault()
        promptDate(editor, control)
        break
      // Plain-text controls are editable inline content — let the caret land.
      case "plain-text":
        break
    }
  })
}
