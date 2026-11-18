// @vitest-environment jsdom
/**
 * PGP-4 — Post-insert form-control editing: edit dropdown options and
 * control settings on placed controls.
 *
 * Pins:
 *  - content-controls: option-list converters (comma attr ↔ textarea lines),
 *    control lookup at the selection / a click position, attribute updates
 *    on the placed node, and the `editFormControl` entry point that opens
 *    the Form panel — no window.prompt anywhere on the edit path.
 *  - FormPanel: when a placed control is selected, a contextual
 *    "Edit Form Control" section appears pre-filled with the node attrs
 *    (dropdown options, title/tag, placeholder, checkbox state, date
 *    value/format) and Save writes them back to the node.
 *  - registerContentControlHandlers: clicking a dropdown without options
 *    routes to the panel editor instead of a blocking prompt.
 */
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import type { ReactNode } from "react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FormPanel } from "../components/FormPanel"
import {
  CheckboxControl,
  DatePickerControl,
  DropdownControl,
  PlainTextControl,
  dropdownOptionsToLines,
  editFormControl,
  getSelectedFormControl,
  linesToDropdownOptions,
  registerContentControlHandlers,
  updateFormControl,
} from "../lib/content-controls"
import { setActiveRichTextEditor } from "../lib/rte-command"
import { documentStore } from "../stores/DocumentStore"

/* ------------------------------- helpers --------------------------------- */

let editors: Editor[] = []

function buildEditor(content: string): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      PlainTextControl,
      DropdownControl,
      CheckboxControl,
      DatePickerControl,
    ],
    content,
  })
  editors.push(editor)
  return editor
}

/** Document position of the first node of the given type. */
function nodePos(editor: Editor, typeName: string): number {
  let found: number | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found === null && node.type.name === typeName) {
      found = pos
      return false
    }
    return true
  })
  if (found === null) throw new Error(`no ${typeName} node in doc`)
  return found
}

function attrsAt(editor: Editor, pos: number): Record<string, unknown> {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) throw new Error(`no node at ${pos}`)
  return node.attrs as Record<string, unknown>
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []

function mount(node: ReactNode): HTMLDivElement {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(node))
  mounted.push({ root, container })
  return container
}

function mustQuery<T extends HTMLElement>(container: HTMLElement, selector: string): T {
  const el = container.querySelector(selector)
  if (!el) throw new Error(`element ${selector} not found`)
  return el as T
}

function saveButton(container: HTMLElement): HTMLButtonElement {
  return mustQuery<HTMLButtonElement>(container, 'button[aria-label="Save control settings"]')
}

/** Native setter bypass so React-controlled inputs see the change. */
function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
  act(() => {
    setter?.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

function click(el: HTMLElement): void {
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })))
}

/* --------------------------------- tests --------------------------------- */

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  setActiveRichTextEditor(null)
  documentStore.activeRightPanel = null
  documentStore.rightMenuVisible = true
})

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.innerHTML = ""
  documentStore.activeRightPanel = null
  documentStore.rightMenuVisible = false
  setActiveRichTextEditor(null)
  vi.restoreAllMocks()
})

describe("option-list converters", () => {
  it("turns the stored comma-separated attr into one option per line", () => {
    expect(dropdownOptionsToLines("A, B")).toBe("A\nB")
    expect(dropdownOptionsToLines("Basic, Pro, Enterprise")).toBe("Basic\nPro\nEnterprise")
  })

  it("drops blank entries in both directions", () => {
    expect(dropdownOptionsToLines(" , ,A,, B ")).toBe("A\nB")
    expect(linesToDropdownOptions("A\n\n  B  \n\n")).toBe("A, B")
  })

  it("round-trips a line list back into the comma-separated attr", () => {
    expect(linesToDropdownOptions("X\nY")).toBe("X, Y")
    // a single line keeps whatever the user typed (commas included)
    expect(linesToDropdownOptions("X,Y")).toBe("X,Y")
    expect(linesToDropdownOptions("")).toBe("")
  })
})

describe("getSelectedFormControl", () => {
  it("returns null for a plain text cursor", () => {
    const editor = buildEditor("<p>Just a paragraph</p>")
    act(() => editor.commands.setTextSelection(1))
    expect(getSelectedFormControl(editor)).toBeNull()
  })

  it("returns the node under a NodeSelection", () => {
    const editor = buildEditor(
      '<p>Plan: <span data-content-control="dropdown" data-options="A,B">A</span></p>',
    )
    const pos = nodePos(editor, "dropdownControl")
    act(() => editor.commands.setNodeSelection(pos))

    const control = getSelectedFormControl(editor)
    expect(control).not.toBeNull()
    expect(control?.kind).toBe("dropdown")
    expect(control?.nodeTypeName).toBe("dropdownControl")
    expect(control?.pos).toBe(pos)
    expect(control?.attrs.options).toBe("A,B")
  })

  it("finds a plain-text control containing the cursor", () => {
    const editor = buildEditor(
      '<p><span data-content-control="plain-text" data-placeholder="Enter text">Ada</span></p>',
    )
    const pos = nodePos(editor, "plainTextControl")
    act(() => editor.commands.setTextSelection(pos + 1)) // caret inside the control

    const control = getSelectedFormControl(editor)
    expect(control?.kind).toBe("plain-text")
    expect(control?.pos).toBe(pos)
    expect(control?.attrs.placeholder).toBe("Enter text")
  })

  it("ignores a cursor that merely sits next to a control", () => {
    const editor = buildEditor(
      '<p>Plan: <span data-content-control="dropdown" data-options="A,B">A</span></p>',
    )
    const pos = nodePos(editor, "dropdownControl")
    act(() => editor.commands.setTextSelection(pos)) // caret right before the atom
    expect(getSelectedFormControl(editor)).toBeNull()
  })
})

describe("updateFormControl", () => {
  it("writes new attrs onto the placed node and keeps it selected", () => {
    const editor = buildEditor(
      '<p><span data-content-control="dropdown" data-options="A,B">A</span></p>',
    )
    const pos = nodePos(editor, "dropdownControl")

    const ok = updateFormControl(editor, { pos, nodeTypeName: "dropdownControl" }, {
      options: "X, Y",
      title: "Plan picker",
    })

    expect(ok).toBe(true)
    expect(attrsAt(editor, pos).options).toBe("X, Y")
    expect(attrsAt(editor, pos).title).toBe("Plan picker")
    expect(getSelectedFormControl(editor)?.kind).toBe("dropdown")
  })

  it("refuses to write when the node no longer matches (deleted / moved)", () => {
    const editor = buildEditor('<p><span data-content-control="dropdown"></span></p>')
    const pos = nodePos(editor, "dropdownControl")

    expect(
      updateFormControl(editor, { pos, nodeTypeName: "plainTextControl" }, { title: "x" }),
    ).toBe(false)
    expect(
      updateFormControl(editor, { pos: editor.state.doc.content.size + 40, nodeTypeName: "dropdownControl" }, { title: "x" }),
    ).toBe(false)
    expect(attrsAt(editor, pos).title).toBe("")
  })
})

describe("editFormControl entry point", () => {
  it("selects the placed control and opens the Form panel", () => {
    const editor = buildEditor(
      '<p><span data-content-control="dropdown" data-options="A,B">A</span></p>',
    )
    const pos = nodePos(editor, "dropdownControl")
    act(() => editor.commands.setNodeSelection(pos))

    const control = editFormControl(editor)

    expect(control?.kind).toBe("dropdown")
    expect(getSelectedFormControl(editor)?.pos).toBe(pos)
    expect(documentStore.activeRightPanel).toBe("form")
    expect(documentStore.rightMenuVisible).toBe(true)
  })

  it("returns null without opening the panel when nothing is selected", () => {
    const editor = buildEditor("<p>Nothing here</p>")
    act(() => editor.commands.setTextSelection(1))

    expect(editFormControl(editor)).toBeNull()
    expect(documentStore.activeRightPanel).toBeNull()
  })
})

describe("FormPanel — edit a placed control", () => {
  it("prefills the dropdown option list of the selected control", () => {
    const editor = buildEditor(
      '<p>Plan: <span data-content-control="dropdown" data-options="A,B">A</span></p>',
    )
    const container = mount(createElement(FormPanel, { visible: true, editor }))

    act(() => editor.commands.setNodeSelection(nodePos(editor, "dropdownControl")))

    const section = mustQuery(container, '[data-testid="form-control-settings"]')
    expect(section.textContent).toContain("Edit Form Control — Dropdown")
    const textarea = mustQuery<HTMLTextAreaElement>(
      container,
      'textarea[aria-label="Dropdown options"]',
    )
    expect(textarea.value).toBe("A\nB")
  })

  it("edits the dropdown options and saves them to the node (no prompt)", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("PROMPTED")
    const editor = buildEditor(
      '<p>Plan: <span data-content-control="dropdown" data-options="A,B">A</span></p>',
    )
    const pos = nodePos(editor, "dropdownControl")
    const container = mount(createElement(FormPanel, { visible: true, editor }))

    act(() => editor.commands.setNodeSelection(pos))
    setValue(
      mustQuery<HTMLTextAreaElement>(container, 'textarea[aria-label="Dropdown options"]'),
      "X\nY",
    )
    click(saveButton(container))

    expect(attrsAt(editor, pos).options).toBe("X, Y")
    expect(editor.getHTML()).toContain('data-options="X, Y"')
    expect(promptSpy).not.toHaveBeenCalled()
    // The editor stays on the control after saving, re-synced to saved values
    expect(container.querySelector('[data-testid="form-control-settings"]')).not.toBeNull()
    expect(
      mustQuery<HTMLTextAreaElement>(container, 'textarea[aria-label="Dropdown options"]').value,
    ).toBe("X\nY")
  })

  it("edits the control title (Control Settings) and serializes data-title", () => {
    const editor = buildEditor(
      '<p><span data-content-control="dropdown" data-options="A,B">A</span></p>',
    )
    const pos = nodePos(editor, "dropdownControl")
    const container = mount(createElement(FormPanel, { visible: true, editor }))

    act(() => editor.commands.setNodeSelection(pos))
    setValue(mustQuery<HTMLInputElement>(container, 'input[aria-label="Control title"]'), "Plan picker")
    click(saveButton(container))

    expect(attrsAt(editor, pos).title).toBe("Plan picker")
    expect(editor.getHTML()).toContain('data-title="Plan picker"')
  })

  it("edits the placeholder of a placed plain-text control", () => {
    const editor = buildEditor(
      '<p><span data-content-control="plain-text" data-placeholder="Enter text">Ada</span></p>',
    )
    const pos = nodePos(editor, "plainTextControl")
    const container = mount(createElement(FormPanel, { visible: true, editor }))

    act(() => editor.commands.setNodeSelection(pos))
    const input = mustQuery<HTMLInputElement>(container, 'input[aria-label="Placeholder"]')
    expect(input.value).toBe("Enter text")

    setValue(input, "Your name here")
    click(saveButton(container))

    expect(attrsAt(editor, pos).placeholder).toBe("Your name here")
    expect(editor.getHTML()).toContain('data-placeholder="Your name here"')
  })

  it("edits the checked state of a placed checkbox", () => {
    const editor = buildEditor('<p><span data-content-control="checkbox"></span></p>')
    const pos = nodePos(editor, "checkboxControl")
    const container = mount(createElement(FormPanel, { visible: true, editor }))

    act(() => editor.commands.setNodeSelection(pos))
    const box = mustQuery<HTMLInputElement>(container, 'input[aria-label="Checked"]')
    expect(box.checked).toBe(false)

    click(box)
    click(saveButton(container))

    expect(attrsAt(editor, pos).checked).toBe(true)
    expect(editor.getHTML()).toContain('data-checked="true"')
  })

  it("edits the value and format of a placed date picker", () => {
    const editor = buildEditor(
      '<p><span data-content-control="date-picker" data-value="2026-01-31">2026-01-31</span></p>',
    )
    const pos = nodePos(editor, "datePickerControl")
    const container = mount(createElement(FormPanel, { visible: true, editor }))

    act(() => editor.commands.setNodeSelection(pos))
    const value = mustQuery<HTMLInputElement>(container, 'input[aria-label="Date value"]')
    expect(value.value).toBe("2026-01-31")

    setValue(value, "2026-02-28")
    setValue(mustQuery<HTMLInputElement>(container, 'input[aria-label="Date format"]'), "DD/MM/YYYY")
    click(saveButton(container))

    expect(attrsAt(editor, pos).value).toBe("2026-02-28")
    expect(attrsAt(editor, pos).format).toBe("DD/MM/YYYY")
    expect(editor.getHTML()).toContain('data-value="2026-02-28"')
  })

  it("hides the editor when the selection leaves the control", () => {
    const editor = buildEditor(
      '<p>Plan: <span data-content-control="dropdown" data-options="A,B">A</span></p>',
    )
    const container = mount(createElement(FormPanel, { visible: true, editor }))

    act(() => editor.commands.setNodeSelection(nodePos(editor, "dropdownControl")))
    expect(container.querySelector('[data-testid="form-control-settings"]')).not.toBeNull()

    act(() => editor.commands.setTextSelection(1)) // caret in the paragraph text
    expect(container.querySelector('[data-testid="form-control-settings"]')).toBeNull()
    expect(container.textContent).toContain("select a control in the document")
  })

  it("follows the active editor when no editor prop is given", () => {
    const editor = buildEditor(
      '<p><span data-content-control="dropdown" data-options="A,B">A</span></p>',
    )
    setActiveRichTextEditor(editor)
    const container = mount(createElement(FormPanel, { visible: true }))

    act(() => editor.commands.setNodeSelection(nodePos(editor, "dropdownControl")))
    expect(container.querySelector('[data-testid="form-control-settings"]')).not.toBeNull()

    setValue(
      mustQuery<HTMLTextAreaElement>(container, 'textarea[aria-label="Dropdown options"]'),
      "One\nTwo",
    )
    click(saveButton(container))
    expect(attrsAt(editor, nodePos(editor, "dropdownControl")).options).toBe("One, Two")
  })

  it("renders the insert flow untouched when no control is selected", () => {
    const editor = buildEditor("<p>Plain doc</p>")
    const container = mount(createElement(FormPanel, { visible: true, editor }))

    expect(container.textContent).toContain("Control Type")
    expect(container.textContent).toContain("Insert Control")
    expect(container.querySelector('[data-testid="form-control-settings"]')).toBeNull()
  })
})

describe("click routing — option-less dropdown opens the editor, not a prompt", () => {
  it("selects the clicked control and opens the Form panel", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("PROMPTED")
    const editor = buildEditor(
      '<p>Plan: <span data-content-control="dropdown" data-options="">Select...</span></p>',
    )
    registerContentControlHandlers(editor)

    const target = editor.view.dom.querySelector<HTMLElement>('[data-content-control="dropdown"]')
    if (!target) throw new Error("dropdown span not rendered")
    click(target)

    expect(promptSpy).not.toHaveBeenCalled()
    expect(documentStore.activeRightPanel).toBe("form")
    const control = getSelectedFormControl(editor)
    expect(control?.kind).toBe("dropdown")
    expect(control?.attrs.options).toBe("")
  })

  it("still shows the quick-pick popup for a configured dropdown", () => {
    const editor = buildEditor(
      '<p>Plan: <span data-content-control="dropdown" data-options="A,B">A</span></p>',
    )
    registerContentControlHandlers(editor)

    const target = editor.view.dom.querySelector<HTMLElement>('[data-content-control="dropdown"]')
    if (!target) throw new Error("dropdown span not rendered")
    click(target)

    const select = document.body.querySelector("select")
    expect(select).not.toBeNull()
    // blank option + one per option (the atom control carries no text)
    expect([...(select?.options ?? [])].map((o) => o.textContent)).toEqual([
      "Select...",
      "A",
      "B",
    ])
    expect(getSelectedFormControl(editor)?.kind).toBe("dropdown")
  })
})
