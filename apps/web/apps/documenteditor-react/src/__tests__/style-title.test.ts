// @vitest-environment jsdom
/**
 * PGP-6 — Style Title: name/rename a style ("formatting as style").
 *
 * Covers the user-named style registry (word-commands.ts), the
 * `formattingAsStyle` / `applyStyle` command routing and the StylesPanel
 * "Saved styles" surface (inline naming + rename, no window.prompt).
 */
import type { ReactNode } from "react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CanvasEditorHandle } from "../components/CanvasEditor"
import { StylesPanel } from "../components/StylesPanel"
import {
  applyUserStyle,
  captureSelectionFormatting,
  createWordCommandHandler,
  findUserStyle,
  getUserStyles,
  normalizeStyleName,
  renameUserStyle,
  resetUserStyles,
  saveUserStyle,
  subscribeUserStyles,
} from "../lib/word-commands"
import { documentStore } from "../stores/DocumentStore"

const wasmMocks = vi.hoisted(() => ({
  getWasmApi: vi.fn((): unknown => null),
}))

vi.mock("../lib/wasm-renderer", () => ({ getWasmApi: wasmMocks.getWasmApi }))

const DOC_HANDLE = 7

/** Mock canvas editor handle + WASM api returning the given formatting. */
function mockEditor(formatting: Record<string, unknown>): {
  handle: CanvasEditorHandle
  applyFormatting: Mock
  get_run_formatting: Mock
} {
  const applyFormatting = vi.fn()
  const get_run_formatting = vi.fn(() => JSON.stringify(formatting))
  wasmMocks.getWasmApi.mockReturnValue({ get_run_formatting })
  const handle = {
    applyFormatting,
    applyStructureOp: vi.fn(),
    getDocHandle: vi.fn(() => DOC_HANDLE),
  } as unknown as CanvasEditorHandle
  return { handle, applyFormatting, get_run_formatting }
}

function makeHandler(handle: CanvasEditorHandle | null) {
  return createWordCommandHandler({
    editorRef: { current: handle },
    onRichTextCommand: vi.fn(),
    onFind: vi.fn(),
  })
}

/** React-testing-library-free typing helper (native setter bypass). */
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

describe("style title — name normalization", () => {
  it("trims and collapses inner whitespace", () => {
    expect(normalizeStyleName("  Margin   note ")).toBe("Margin note")
    expect(normalizeStyleName("H1")).toBe("H1")
  })

  it("rejects blank / missing names", () => {
    expect(normalizeStyleName("   ")).toBeNull()
    expect(normalizeStyleName("")).toBeNull()
    expect(normalizeStyleName(undefined)).toBeNull()
  })
})

describe("style title — save-as-style registry", () => {
  beforeEach(() => resetUserStyles())

  it("registers a named entry with the captured formatting snapshot", () => {
    const entry = saveUserStyle("Callout", { bold: true, fontName: "Aptos" })

    expect(getUserStyles()).toHaveLength(1)
    expect(entry.name).toBe("Callout")
    expect(entry.formatting).toEqual({ bold: true, fontName: "Aptos" })
    expect(getUserStyles()[0]).toMatchObject({ id: entry.id, name: "Callout" })
  })

  it("falls back to the OO default names when the name is blank", () => {
    expect(saveUserStyle(undefined, {}).name).toBe("Style 1")
    expect(saveUserStyle("   ", {}).name).toBe("Style 2")
    expect(getUserStyles()).toHaveLength(2)
  })

  it("re-saving an existing name redefines that style in place", () => {
    saveUserStyle("Emphasis", { italic: true })
    const second = saveUserStyle("emphasis", { bold: true })

    expect(getUserStyles()).toHaveLength(1)
    expect(second.formatting).toEqual({ bold: true })
  })

  it("default names skip names already taken", () => {
    saveUserStyle("Style 1", { bold: true })
    expect(saveUserStyle(undefined, {}).name).toBe("Style 2")
  })

  it("rename updates the registry entry name", () => {
    const entry = saveUserStyle("Draft", { underline: "single" })

    expect(renameUserStyle(entry.id, "  Final  copy ")).toBe(true)
    expect(getUserStyles()[0].name).toBe("Final copy")
  })

  it("rename rejects blank names and unknown ids", () => {
    const entry = saveUserStyle("Keep", {})
    expect(renameUserStyle(entry.id, "   ")).toBe(false)
    expect(renameUserStyle("user-style-999", "New")).toBe(false)
    expect(getUserStyles()[0].name).toBe("Keep")
  })

  it("finds styles by id, exact name and case-insensitive name", () => {
    const entry = saveUserStyle("Report H1", { heading: 1 })

    expect(findUserStyle(entry.id)).toBe(entry)
    expect(findUserStyle("Report H1")).toBe(entry)
    expect(findUserStyle("report h1")).toBe(entry)
    expect(findUserStyle("missing")).toBeNull()
  })

  it("registry changes notify subscribers (and unsubscribing stops them)", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeUserStyles(listener)

    const entry = saveUserStyle("Notify", {})
    renameUserStyle(entry.id, "Notified")
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    renameUserStyle(entry.id, "Again")
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("resetUserStyles clears the registry", () => {
    saveUserStyle("Temp", {})
    resetUserStyles()
    expect(getUserStyles()).toHaveLength(0)
  })
})

describe("style title — command routing", () => {
  beforeEach(() => {
    resetUserStyles()
    wasmMocks.getWasmApi.mockReset()
  })

  it("formattingAsStyle captures the selection formatting under the given name", () => {
    const { handle, get_run_formatting } = mockEditor({ bold: true, fontSize: 24 })
    const handler = makeHandler(handle)

    handler({ command: "formattingAsStyle", value: "  Report H1 " })

    expect(get_run_formatting).toHaveBeenCalledWith(DOC_HANDLE)
    expect(getUserStyles()).toHaveLength(1)
    expect(getUserStyles()[0]).toMatchObject({
      name: "Report H1",
      formatting: { bold: true, fontSize: 24 },
    })
  })

  it("formattingAsStyle without a value uses the default name and reveals the styles panel", () => {
    const { handle } = mockEditor({ italic: true })
    const handler = makeHandler(handle)
    documentStore.activeRightPanel = "crossreference"

    handler({ command: "formattingAsStyle" })

    expect(getUserStyles()[0].name).toBe("Style 1")
    expect(documentStore.activeRightPanel).toBe("paragraph")
  })

  it("formattingAsStyle without a WASM document leaves the registry untouched", () => {
    wasmMocks.getWasmApi.mockReturnValue(null)
    const handler = makeHandler(null)
    documentStore.activeRightPanel = "crossreference"

    handler({ command: "formattingAsStyle", value: "Nope" })

    expect(getUserStyles()).toHaveLength(0)
    expect(documentStore.activeRightPanel).toBe("crossreference")
  })

  it("applyStyle replays the stored snapshot through applyFormatting (by name)", () => {
    const { handle, applyFormatting } = mockEditor({ bold: true, fontName: "Aptos" })
    const handler = makeHandler(handle)
    handler({ command: "formattingAsStyle", value: "Report H1" })
    applyFormatting.mockClear()

    handler({ command: "applyStyle", value: "Report H1" })

    expect(applyFormatting).toHaveBeenCalledWith({ bold: true, fontName: "Aptos" })
  })

  it("applyStyle also accepts the style id", () => {
    const { handle, applyFormatting } = mockEditor({ underline: "single" })
    const handler = makeHandler(handle)
    handler({ command: "formattingAsStyle", value: "Byline" })
    const entry = getUserStyles()[0]
    applyFormatting.mockClear()

    handler({ command: "applyStyle", value: entry.id })

    expect(applyFormatting).toHaveBeenCalledWith({ underline: "single" })
  })

  it("applyUserStyle reports unknown styles as failures", () => {
    mockEditor({})
    makeHandler(null)

    expect(applyUserStyle("missing")).toBe(false)
  })

  it("captureSelectionFormatting parses the WASM snapshot", () => {
    const { handle } = mockEditor({ bold: true })
    makeHandler(handle)

    expect(captureSelectionFormatting()).toEqual({ bold: true })
  })
})

describe("style title — StylesPanel naming surface", () => {
  const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []
  const woCommands: Array<{ command: string; value?: string }> = []

  beforeEach(() => {
    resetUserStyles()
    wasmMocks.getWasmApi.mockReset()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    woCommands.length = 0
    window.addEventListener("wo-command", recordWoCommand)
  })

  afterEach(() => {
    window.removeEventListener("wo-command", recordWoCommand)
    for (const { root, container } of mounted.splice(0)) {
      act(() => root.unmount())
      container.remove()
    }
  })

  function recordWoCommand(e: Event): void {
    const detail = (e as CustomEvent<{ command: string; value?: string }>).detail
    woCommands.push({ command: detail.command, value: detail.value })
  }

  function mount(node: ReactNode): HTMLDivElement {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(node))
    mounted.push({ root, container })
    return container
  }

  function button(container: HTMLElement, label: string): HTMLButtonElement {
    const found = [...container.querySelectorAll("button")].find((b) => b.textContent === label) as
      | HTMLButtonElement
      | undefined
    expect(found, `button ${label}`).toBeDefined()
    return found!
  }

  it("renders the saved-styles section with an empty hint", () => {
    const container = mount(createElement(StylesPanel, { visible: true, onCommand: () => {} }))
    const text = container.textContent ?? ""
    expect(text).toContain("Saved styles")
    expect(text).toContain("No saved styles yet")
    expect(text).toContain("Save as style")
  })

  it("lists registered user styles by name", () => {
    saveUserStyle("Margin note", { italic: true })
    saveUserStyle("Report H1", { bold: true })
    const container = mount(createElement(StylesPanel, { visible: true, onCommand: () => {} }))

    const text = container.textContent ?? ""
    expect(text).toContain("Margin note")
    expect(text).toContain("Report H1")
  })

  it("Save as style dispatches formattingAsStyle with the typed name", () => {
    const container = mount(createElement(StylesPanel, { visible: true, onCommand: () => {} }))
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Style name"]')!
    expect(input).toBeDefined()

    setInputValue(input, "  Margin note ")
    act(() => button(container, "Save as style").click())

    expect(woCommands).toEqual([{ command: "formattingAsStyle", value: "Margin note" }])
    expect(input.value).toBe("") // draft cleared after saving
  })

  it("a blank name dispatches formattingAsStyle without a value (default name)", () => {
    const container = mount(createElement(StylesPanel, { visible: true, onCommand: () => {} }))

    act(() => button(container, "Save as style").click())

    expect(woCommands).toEqual([{ command: "formattingAsStyle", value: undefined }])
  })

  it("clicking a saved style applies it to the selection", () => {
    const { handle, applyFormatting } = mockEditor({ bold: true, fontName: "Aptos" })
    makeHandler(handle)
    const entry = saveUserStyle("Report H1", { bold: true, fontName: "Aptos" })
    const container = mount(createElement(StylesPanel, { visible: true, onCommand: () => {} }))

    act(() => button(container, entry.name).click())

    expect(applyFormatting).toHaveBeenCalledWith(entry.formatting)
  })

  it("renames a style inline via Rename → OK", () => {
    const entry = saveUserStyle("Draft", { italic: true })
    const container = mount(createElement(StylesPanel, { visible: true, onCommand: () => {} }))

    act(() => button(container, "Rename").click())
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Rename Draft"]')!
    expect(input).toBeDefined()
    expect(input.value).toBe("Draft")

    setInputValue(input, "Final copy")
    act(() => button(container, "OK").click())

    expect(getUserStyles()[0]).toMatchObject({ id: entry.id, name: "Final copy" })
    expect(container.textContent).toContain("Final copy")
  })

  it("cancel keeps the previous style name", () => {
    saveUserStyle("Keep me", {})
    const container = mount(createElement(StylesPanel, { visible: true, onCommand: () => {} }))

    act(() => button(container, "Rename").click())
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Rename Keep me"]')!
    setInputValue(input, "Discarded")
    act(() => button(container, "Cancel").click())

    expect(getUserStyles()[0].name).toBe("Keep me")
    expect(container.textContent).toContain("Keep me")
  })

  it("Enter commits and Escape cancels the rename", () => {
    saveUserStyle("Keyboard", {})
    const container = mount(createElement(StylesPanel, { visible: true, onCommand: () => {} }))

    act(() => button(container, "Rename").click())
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Rename Keyboard"]')!
    setInputValue(input, "Typed name")
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    })
    expect(getUserStyles()[0].name).toBe("Typed name")

    act(() => button(container, "Rename").click())
    const reopened = container.querySelector<HTMLInputElement>(
      'input[aria-label="Rename Typed name"]',
    )!
    setInputValue(reopened, "Undone")
    act(() => {
      reopened.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    expect(getUserStyles()[0].name).toBe("Typed name")
  })

  it("is hidden when not visible", () => {
    const container = mount(createElement(StylesPanel, { visible: false, onCommand: () => {} }))
    expect(container.textContent ?? "").toBe("")
  })
})
