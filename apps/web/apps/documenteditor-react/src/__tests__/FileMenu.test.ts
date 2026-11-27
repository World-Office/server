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

import { FileMenu } from "../components/FileMenu/FileMenu"
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

/**
 * The pane column next to the rail. Every pane owns its own
 * `display: visible ? "block" : "none"`, so the column itself must (a) stay
 * displayed and (b) re-render when the active panel changes — otherwise each
 * pane stays invisible no matter which rail item is clicked (the bug this
 * pins: the column was `display: none` and the component was not an observer).
 */
describe("FileMenu pane column", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    documentStore.isDesktop = false
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
  })

  const shownPanes = (container: HTMLElement): HTMLElement[] =>
    [...container.querySelectorAll<HTMLElement>(".de-file-menu-content-box")].filter(
      (box) => box.style.display !== "none",
    )

  it("renders the pane of the clicked rail item, and only that pane", () => {
    const container = mount(createElement(FileMenu))
    expect(shownPanes(container)).toHaveLength(0)
    for (const label of [
      "Document Info...",
      "Protect Document",
      "Access Rights...",
      "Share...",
      "Version History...",
      "Advanced Settings...",
      "Help...",
      "Download as...",
      "Save Copy as...",
      "Create New",
      "Browse Files",
      "Print with Preview",
    ]) {
      clickButton(container, label)
      expect(shownPanes(container), label).toHaveLength(1)
    }
  })

  it("toggles the pane closed when the active rail item is clicked again", () => {
    const container = mount(createElement(FileMenu))
    clickButton(container, "Help...")
    expect(shownPanes(container)).toHaveLength(1)
    clickButton(container, "Help...")
    expect(shownPanes(container)).toHaveLength(0)
  })

  it("keeps the pane column displayed so the visible pane can actually be seen", () => {
    const container = mount(createElement(FileMenu))
    const pane = container.querySelector(".de-file-menu-help-content")
    const column = pane?.parentElement?.parentElement
    expect(column, "Help pane mounted inside the pane column").toBeDefined()
    expect(getComputedStyle(column as HTMLElement).display).not.toBe("none")
  })

  it("gives the harness its stable hooks: rail ids and the pane each row opens", () => {
    const container = mount(createElement(FileMenu))
    expect(container.querySelector("#filehistory")?.textContent).toContain("Version History")
    expect(container.querySelector('[data-pane="help"]')).toBe(container.querySelector("#filehelp"))
    expect(container.querySelector('[data-pane="save"]')).toBeNull()
    // pane-specific hook (the history pane shares every other class with the
    // list-style panes)
    expect(container.querySelectorAll(".de-file-menu-history")).toHaveLength(1)
  })
})
