// @vitest-environment jsdom
/**
 * PGP-9 — Filling status: report filled/empty form controls.
 *
 * Pins:
 *  - form-status lib: the doc scan totals every placed form control and
 *    classifies each as filled/empty (text ⇔ non-placeholder text,
 *    dropdown ⇔ a selected option, checkbox ⇔ checked, date ⇔ value set).
 *  - FormPanel: a "Filling status" section renders the totals and the
 *    per-control list, and follows the document in real time (updated on
 *    editor transactions).
 */
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import type { ReactNode } from "react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { FormPanel } from "../components/FormPanel"
import {
  CheckboxControl,
  DatePickerControl,
  DropdownControl,
  PlainTextControl,
  registerContentControlHandlers,
} from "../lib/content-controls"
import {
  EMPTY_FORM_FILL_STATUS,
  formatFormFillSummary,
  getFormFillStatus,
} from "../lib/form-status"
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

function fillEntries(editor: Editor) {
  return getFormFillStatus(editor).entries
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

function fillSummary(container: HTMLElement): string {
  return mustQuery<HTMLElement>(container, '[data-testid="form-fill-summary"]').textContent ?? ""
}

function fillEntriesIn(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-testid="form-fill-entry"]'),
  )
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
})

describe("computeFormFillStatus — totals", () => {
  it("reports 0/0 for a document without form controls", () => {
    const editor = buildEditor("<p>Just a paragraph</p>")
    expect(getFormFillStatus(editor)).toEqual(EMPTY_FORM_FILL_STATUS)
    expect(EMPTY_FORM_FILL_STATUS).toEqual({ total: 0, filled: 0, empty: 0, entries: [] })
  })

  it("counts every placed control in total and splits filled/empty", () => {
    const editor = buildEditor(
      [
        "<p>Name: ",
        '<span data-content-control="plain-text" data-title="Full name">Ada Lovelace</span>',
        ' <span data-content-control="dropdown" data-options="A,B" data-value="A">A</span>',
        ' <span data-content-control="checkbox"></span>',
        ' <span data-content-control="date-picker"></span>',
        "</p>",
      ].join(""),
    )
    expect(getFormFillStatus(editor)).toMatchObject({ total: 4, filled: 2, empty: 2 })
    expect(getFormFillStatus(editor).entries).toHaveLength(4)
  })
})

describe("computeFormFillStatus — per-kind fill semantics", () => {
  it("text control: filled iff it holds real text, not the placeholder", () => {
    const editor = buildEditor(
      [
        "<p>",
        '<span data-content-control="plain-text">Ada</span>',
        '<span data-content-control="plain-text">Enter text</span>',
        '<span data-content-control="plain-text" data-placeholder="Your name">Your name</span>',
        '<span data-content-control="plain-text" data-placeholder="Your name">Grace</span>',
        "</p>",
      ].join(""),
    )
    expect(fillEntries(editor).map((e) => e.filled)).toEqual([true, false, false, true])
  })

  it("dropdown: filled iff an option is picked (persisted on the value attr)", () => {
    const editor = buildEditor(
      [
        "<p>",
        '<span data-content-control="dropdown" data-options="A,B" data-value="A"></span>',
        '<span data-content-control="dropdown" data-options="A,B"></span>',
        // legacy markup: inner text on an atom node is dropped at parse,
        // only the picked value on data-value counts
        '<span data-content-control="dropdown" data-options="A,B">A</span>',
        "</p>",
      ].join(""),
    )
    expect(fillEntries(editor).map((e) => e.filled)).toEqual([true, false, false])
  })

  it("checkbox: filled iff checked", () => {
    const editor = buildEditor(
      [
        "<p>",
        '<span data-content-control="checkbox" data-checked="true"></span>',
        '<span data-content-control="checkbox"></span>',
        "</p>",
      ].join(""),
    )
    expect(fillEntries(editor).map((e) => e.filled)).toEqual([true, false])
  })

  it("date picker: filled iff a date value is set", () => {
    const editor = buildEditor(
      [
        "<p>",
        '<span data-content-control="date-picker" data-value="2026-01-31"></span>',
        '<span data-content-control="date-picker"></span>',
        "</p>",
      ].join(""),
    )
    expect(fillEntries(editor).map((e) => e.filled)).toEqual([true, false])
  })

  it("labels entries with the control title/tag, falling back to the kind label", () => {
    const editor = buildEditor(
      [
        "<p>",
        '<span data-content-control="dropdown" data-title="Plan picker" data-options="A,B">A</span>',
        '<span data-content-control="checkbox"></span>',
        "</p>",
      ].join(""),
    )
    expect(fillEntries(editor).map((e) => e.label)).toEqual(["Plan picker", "Checkbox"])
  })
})

describe("formatFormFillSummary", () => {
  it("renders x of y filled", () => {
    const editor = buildEditor(
      [
        "<p>",
        '<span data-content-control="plain-text">Ada</span>',
        ' <span data-content-control="checkbox"></span>',
        "</p>",
      ].join(""),
    )
    expect(formatFormFillSummary(getFormFillStatus(editor))).toBe("1 of 2 filled")
  })

  it("renders a hint when the document has no controls", () => {
    const editor = buildEditor("<p>Nothing here</p>")
    expect(formatFormFillSummary(getFormFillStatus(editor))).toBe("No form controls")
  })
})

describe("FormPanel — Filling status section", () => {
  it("renders the section with totals and per-control states", () => {
    const editor = buildEditor(
      [
        "<p>",
        '<span data-content-control="plain-text" data-title="Full name">Ada</span>',
        ' <span data-content-control="dropdown" data-options="A,B">Select...</span>',
        "</p>",
      ].join(""),
    )
    const container = mount(createElement(FormPanel, { visible: true, editor }))

    expect(mustQuery(container, '[data-testid="form-fill-status"]').textContent).toContain(
      "Filling status",
    )
    expect(fillSummary(container)).toBe("1 of 2 filled")

    const entries = fillEntriesIn(container)
    expect(entries).toHaveLength(2)
    expect(entries[0].className).toContain("de-form-fill-filled")
    expect(entries[0].textContent).toContain("Full name")
    expect(entries[0].textContent).toContain("Filled")
    expect(entries[1].className).toContain("de-form-fill-empty")
    expect(entries[1].textContent).toContain("Empty")
  })

  it("shows the empty hint for a document without controls", () => {
    const editor = buildEditor("<p>Plain doc</p>")
    const container = mount(createElement(FormPanel, { visible: true, editor }))
    expect(fillSummary(container)).toBe("No form controls")
    expect(container.querySelector('[data-testid="form-fill-list"]')).toBeNull()
  })

  it("updates in real time as controls are filled (editor transactions)", () => {
    const editor = buildEditor(
      [
        "<p>",
        '<span data-content-control="checkbox"></span>',
        ' <span data-content-control="date-picker"></span>',
        "</p>",
      ].join(""),
    )
    const container = mount(createElement(FormPanel, { visible: true, editor }))
    expect(fillSummary(container)).toBe("0 of 2 filled")

    // Check the checkbox via the same attribute write the click handler uses.
    let pos = -1
    editor.state.doc.descendants((node, p) => {
      if (pos < 0 && node.type.name === "checkboxControl") {
        pos = p
        return false
      }
      return true
    })
    act(() => {
      editor.chain().focus().setNodeSelection(pos).updateAttributes("checkboxControl", {
        checked: true,
      }).run()
    })
    expect(fillSummary(container)).toBe("1 of 2 filled")

    // Inserting a new control grows the total (insertContent at the node
    // selection pushes the new control in front of the checkbox).
    act(() => {
      editor
        .chain()
        .focus()
        .insertContent('<span data-content-control="plain-text">Enter text</span>')
        .run()
    })
    expect(fillSummary(container)).toBe("1 of 3 filled")
    expect(getFormFillStatus(editor)).toMatchObject({ total: 3, filled: 1, empty: 2 })
  })

  it("marks a dropdown filled once an option is picked from the quick-pick popup", () => {
    const editor = buildEditor(
      '<p><span data-content-control="dropdown" data-options="A,B">Select...</span></p>',
    )
    registerContentControlHandlers(editor)
    const container = mount(createElement(FormPanel, { visible: true, editor }))
    expect(fillSummary(container)).toBe("0 of 1 filled")

    const target = editor.view.dom.querySelector<HTMLElement>('[data-content-control="dropdown"]')
    if (!target) throw new Error("dropdown span not rendered")
    act(() => {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    })
    const popup = document.body.querySelector<HTMLSelectElement>("select")
    if (!popup) throw new Error("quick-pick popup not shown")

    act(() => {
      popup.value = "B"
      popup.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(fillSummary(container)).toBe("1 of 1 filled")
    expect(editor.getHTML()).toContain('data-value="B"')
  })

  it("renders alongside the untouched insert flow", () => {
    const editor = buildEditor("<p>Plain doc</p>")
    const container = mount(createElement(FormPanel, { visible: true, editor }))
    expect(container.textContent).toContain("Control Type")
    expect(container.textContent).toContain("Insert Control")
    expect(container.querySelector('[data-testid="form-fill-status"]')).not.toBeNull()
  })
})
