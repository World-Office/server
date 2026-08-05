/**
 * Interactive content controls — click handlers for dropdown, checkbox,
 * and date-picker content controls.
 *
 * Each control node stores its state in ProseMirror attributes and
 * responds to click events to toggle or update that state.
 */

import { type Editor, Node } from "@tiptap/core"
import { mergeAttributes } from "@tiptap/react"

/**
 * Helper: prompt user to pick from a list of options and update the node.
 */
function promptDropdown(editor: Editor, pos: number) {
  const optionsStr = (editor.state.doc.nodeAt(pos)?.attrs.options as string) ?? ""
  const current = editor.state.doc.nodeAt(pos)?.textContent ?? ""
  const options = optionsStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  if (options.length === 0) {
    const input = window.prompt("Enter options (comma-separated):", "Option 1, Option 2, Option 3")
    if (input) {
      editor
        .chain()
        .focus()
        .setNodeSelection(pos)
        .updateAttributes("dropdownControl", { options: input })
        .run()
    }
    return
  }

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

function toggleCheckbox(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  const current = node.attrs.checked as boolean
  editor
    .chain()
    .focus()
    .setNodeSelection(pos)
    .updateAttributes("checkboxControl", { checked: !current })
    .run()
}

function promptDate(editor: Editor, pos: number) {
  const current = (editor.state.doc.nodeAt(pos)?.attrs.value as string) ?? ""
  const dateStr = window.prompt(
    "Enter date (YYYY-MM-DD):",
    current || new Date().toISOString().slice(0, 10),
  )
  if (dateStr) {
    editor
      .chain()
      .focus()
      .setNodeSelection(pos)
      .updateAttributes("datePickerControl", { value: dateStr })
      .run()
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
    return { placeholder: { default: "Enter text" } }
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
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-options") ?? "",
        renderHTML: (attrs) => ({ "data-options": attrs.options as string }),
      },
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
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-checked") === "true",
        renderHTML: (attrs) => ({ "data-checked": attrs.checked ? "true" : "false" }),
      },
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
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-value") ?? "",
        renderHTML: (attrs) => ({ "data-value": attrs.value as string }),
      },
      format: { default: "YYYY-MM-DD" },
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

    // For atom nodes, the click target IS the node
    const doc = view.state.doc
    const resolvedPos = doc.resolve(domPos)
    const node = resolvedPos.parent

    if (node.type.name === "dropdownControl") {
      event.preventDefault()
      promptDropdown(editor, domPos)
    } else if (node.type.name === "checkboxControl") {
      event.preventDefault()
      toggleCheckbox(editor, domPos)
    } else if (node.type.name === "datePickerControl") {
      event.preventDefault()
      promptDate(editor, domPos)
    }
  })
}
