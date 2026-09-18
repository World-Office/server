// @vitest-environment jsdom
/**
 * FileMenu backstage — OnlyOffice backstage parity.
 *
 * Pins the OO backstage items the FileMenu sidebar must carry and verifies
 * each click does something real:
 *  - Back closes the backstage and clears the active panel
 *  - Save forwards a real `wo-command` "save" event
 *  - hasPanel items open the matching backstage panel (Info, Protect,
 *    Settings, Help, Save-As, …) via documentStore.setActiveFileMenuPanel
 */
import type { ReactNode } from "react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FileMenuItems } from "../components/FileMenu/FileMenuItems"
import { documentStore } from "../stores/DocumentStore"

// useTranslation without an i18n provider throws — return a pass-through t().
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
// Avoid rendering the collaboration status badge / heavy store in this unit.
vi.mock("@world-office/collaboration-react", () => ({
  CollaborationStatus: () => null,
}))
vi.mock("../lib/collaboration", () => ({
  collaborationStore: { connectionStatus: "disconnected", users: [] },
}))
vi.mock("../bridge/file-operations", () => ({
  openFile: vi.fn(),
}))

const mounted: Array<{
  root: ReturnType<typeof createRoot>
  container: HTMLDivElement
}> = []

function mount(node: ReactNode): HTMLDivElement {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(node))
  mounted.push({ root, container })
  return container
}

function clickButton(container: HTMLElement, text: string): void {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  )
  if (!button) throw new Error(`button with text "${text}" not found`)
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })))
}

function buttonTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll("button")].map((b) => b.textContent ?? "")
}

/** Mirrors FileMenu.handleMenuClick: a panel item toggles its panel open. */
function onMenuClick(action: string, hasPanel: boolean): void {
  if (hasPanel) {
    documentStore.setActiveFileMenuPanel(
      documentStore.activeFileMenuPanel === action ? null : action,
    )
  } else {
    documentStore.setFileMenuOpen(false)
  }
}

function onBack(): void {
  documentStore.setFileMenuOpen(false)
  documentStore.setActiveFileMenuPanel(null)
}

describe("FileMenu backstage", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    documentStore.isDesktop = true
    documentStore.isDesktop = true
    documentStore.setFileMenuOpen(true)
    documentStore.setActiveFileMenuPanel(null)
  })

  afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
      act(() => root.unmount())
      container.remove()
    }
    documentStore.setFileMenuOpen(false)
    documentStore.setActiveFileMenuPanel(null)
    documentStore.isDesktop = false
    vi.restoreAllMocks()
  })

  it("renders the OnlyOffice backstage items (Save, Download As, Print, Protect, Info, Advanced Settings, Help, Suggest Feature)", () => {
    const container = mount(createElement(FileMenuItems, { onMenuClick, onBack }))
    const texts = buttonTexts(container).join(" ")
    expect(texts).toContain("Back")
    expect(texts).toContain("Save")
    expect(texts).toContain("Download as...")
    expect(texts).toContain("Print")
    expect(texts).toContain("Protect Document")
    expect(texts).toContain("Document Info...")
    expect(texts).toContain("Advanced Settings...")
    expect(texts).toContain("Help...")
    expect(texts).toContain("Suggest Feature")
  })

  it("closes the backstage and clears the active panel on Back", () => {
    documentStore.setActiveFileMenuPanel("info")
    const container = mount(createElement(FileMenuItems, { onMenuClick, onBack }))
    clickButton(container, "Back")
    expect(documentStore.isFileMenuOpen).toBe(false)
    expect(documentStore.activeFileMenuPanel).toBeNull()
  })

  it("forwards Save as a real wo-command so the editor saves", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent")
    const container = mount(createElement(FileMenuItems, { onMenuClick, onBack }))
    clickButton(container, "Save")
    const event = dispatchSpy.mock.calls
      .map(([e]) => e as CustomEvent)
      .find((e) => e.type === "wo-command")
    expect(event?.detail).toEqual({ command: "save" })
  })

  it("opens the backstage panels for panel items (Info, Protect, Settings, Help, Save As)", () => {
    const container = mount(createElement(FileMenuItems, { onMenuClick, onBack }))

    clickButton(container, "Document Info...")
    expect(documentStore.activeFileMenuPanel).toBe("info")

    clickButton(container, "Protect Document")
    expect(documentStore.activeFileMenuPanel).toBe("protect")

    clickButton(container, "Advanced Settings...")
    expect(documentStore.activeFileMenuPanel).toBe("opts")

    clickButton(container, "Help...")
    expect(documentStore.activeFileMenuPanel).toBe("help")

    clickButton(container, "Download as...")
    expect(documentStore.activeFileMenuPanel).toBe("saveas")
  })

  it("closes the menu for plain (non-panel) items such as Print", () => {
    const container = mount(createElement(FileMenuItems, { onMenuClick, onBack }))
    clickButton(container, "Print")
    expect(documentStore.isFileMenuOpen).toBe(false)
  })
})
