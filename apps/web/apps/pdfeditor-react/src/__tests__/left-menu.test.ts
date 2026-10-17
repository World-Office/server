// @vitest-environment jsdom
/**
 * Left-menu rail — pins the real behaviour behind every rail toggle:
 *  - each button paints its panel (a header + working controls, not an empty div)
 *  - a second click on the same button collapses the rail again
 *  - the Comments panel anchors a new thread to the page on screen
 *  - the About overlay carries content and a working Close button
 */
import type { ReactNode } from "react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AboutPanel } from "../components/LeftMenu/AboutPanel"
import { LeftMenu } from "../components/LeftMenu/LeftMenu"
import { pdfStore } from "../stores/PdfStore"

// useTranslation without an i18n provider throws — return a pass-through t().
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

function clickRailButton(container: HTMLElement, action: string): void {
  const button = container.querySelector<HTMLButtonElement>(
    `button[data-action="${action}"]`,
  )
  if (!button) throw new Error(`rail button "${action}" not found`)
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })))
}

function clickButton(container: HTMLElement, action: string): void {
  const button = container.querySelector<HTMLButtonElement>(
    `button[data-action="${action}"]`,
  )
  if (!button) throw new Error(`button "${action}" not found`)
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })))
}

/** Type into a controlled React input/textarea (bypasses React's value tracker). */
function typeInto(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
): void {
  if (!el) throw new Error("input not found")
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
  setter?.call(el, value)
  act(() => el.dispatchEvent(new Event("input", { bubbles: true })))
}

function panel(container: HTMLElement, name: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-panel="${name}"]`)
}

describe("Left-menu panels", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    pdfStore.setActiveLeftPanel(null)
    pdfStore.setPages([
      { index: 0, label: "1" },
      { index: 1, label: "2" },
    ])
    pdfStore.setPageComments([])
    pdfStore.setChatMessages([])
    pdfStore.setSearchMatches([])
    pdfStore.setCurrentPage(0)
    pdfStore.setBookmarks([])
  })

  afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
      act(() => root.unmount())
      container.remove()
    }
    pdfStore.setActiveLeftPanel(null)
    pdfStore.setPageComments([])
    pdfStore.setChatMessages([])
    pdfStore.setCurrentPage(0)
  })

  it("paints a real Search panel", () => {
    const container = mount(createElement(LeftMenu))
    clickRailButton(container, "search")

    const node = panel(container, "search")
    expect(node).not.toBeNull()
    expect(node?.style.display).toBe("flex")
    expect(node?.textContent).toContain("Search")
    expect(container.querySelector<HTMLInputElement>(`[data-action="search-query"]`)).not
      .toBeNull()
    expect(container.querySelector(`[data-action="search-run"]`)).not.toBeNull()
  })

  it("paints a real Comments panel and anchors new threads to the page on screen", () => {
    const container = mount(createElement(LeftMenu))
    pdfStore.setCurrentPage(1)
    clickRailButton(container, "comments")

    const node = panel(container, "comments")
    expect(node?.style.display).toBe("flex")

    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[data-action="comment-text"]',
    )
    expect(textarea).not.toBeNull()
    typeInto(textarea, "check this page")
    clickButton(container, "comment-add")

    expect(pdfStore.pageComments).toHaveLength(1)
    expect(pdfStore.pageComments[0]?.pageIndex).toBe(1)
    expect(node?.textContent).toContain("check this page")
    expect(node?.textContent).toContain("Page 2")
  })

  it("paints a real Chat panel and sends a message", () => {
    const container = mount(createElement(LeftMenu))
    clickRailButton(container, "chat")

    expect(panel(container, "chat")?.style.display).toBe("flex")

    const input = container.querySelector<HTMLInputElement>('[data-action="chat-text"]')
    typeInto(input, "hello")
    clickButton(container, "chat-send")

    expect(pdfStore.chatMessages.map((m) => m.text)).toEqual(["hello"])
    expect(panel(container, "chat")?.textContent).toContain("hello")
  })

  it("paints a real Navigation panel with page controls", () => {
    const container = mount(createElement(LeftMenu))
    clickRailButton(container, "navigation")

    const node = panel(container, "navigation")
    expect(node?.style.display).toBe("flex")
    expect(node?.textContent).toContain("Bookmarks")
    expect(node?.textContent).toContain("Page 1 of 2")

    clickButton(container, "nav-next")
    expect(pdfStore.currentPage).toBe(1)
    clickButton(container, "nav-last")
    expect(pdfStore.currentPage).toBe(1)
    clickButton(container, "nav-first")
    expect(pdfStore.currentPage).toBe(0)
  })

  it("paints a real Support panel with help entries", () => {
    const container = mount(createElement(LeftMenu))
    clickRailButton(container, "support")

    const node = panel(container, "support")
    expect(node?.style.display).toBe("flex")
    expect(node?.textContent).toContain("Get help")
    expect(node?.textContent).toContain("About this document")

    clickButton(container, "support-help")
    expect(pdfStore.isFileMenuOpen).toBe(true)
    expect(pdfStore.activeFileMenuPanel).toBe("help")
    expect(pdfStore.activeLeftPanel).toBeNull()
  })

  it("collapses the rail when the same toggle is clicked again", () => {
    const container = mount(createElement(LeftMenu))
    clickRailButton(container, "search")
    expect(pdfStore.activeLeftPanel).toBe("search")
    clickRailButton(container, "search")
    expect(pdfStore.activeLeftPanel).toBeNull()
  })

  it("keeps the other panels mounted (hidden) so their state survives a collapse", () => {
    const container = mount(createElement(LeftMenu))
    clickRailButton(container, "search")
    expect(panel(container, "comments")?.style.display).toBe("none")
    expect(panel(container, "support")?.style.display).toBe("none")
  })

  it("carries a working About overlay", () => {
    const container = mount(createElement(AboutPanel))
    expect(container.textContent).toContain("World Office PDF")
    pdfStore.setActiveLeftPanel("about")
    clickButton(container, "about-close")
    expect(pdfStore.activeLeftPanel).toBeNull()
  })
})
