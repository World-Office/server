// @vitest-environment jsdom
/**
 * Left-menu rail — pins the real behaviour behind every rail toggle:
 *  - each button paints its panel (a header + working controls, not an empty div)
 *  - a second click on the same button collapses the rail again
 *  - Search lists hits across the deck and jumps to the slide of a hit
 *  - the Comments panel anchors a new thread to the slide on screen
 */
import type { ReactNode } from "react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LeftMenu } from "../components/LeftMenu/LeftMenu"
import { presentationStore, type SlideData } from "../stores/PresentationStore"

// useTranslation without an i18n provider throws — return a pass-through t().
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function slide(title: string, notes = ""): SlideData {
  return {
    id: `s-${title}`,
    title,
    layout: "blank",
    notes,
    shapes: [],
  }
}

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

async function clickButton(container: HTMLElement, action: string): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>(
    `button[data-action="${action}"]`,
  )
  if (!button) throw new Error(`button "${action}" not found`)
  // async act: the click mutates a MobX store, whose re-render is scheduled in
  // a microtask — flushing it here keeps React from warning about act().
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
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
    presentationStore.setActiveLeftPanel(null)
    presentationStore.setSlides([slide("Title Slide"), slide("Overview"), slide("Key Points")])
    presentationStore.setCurrentSlide(1)
    presentationStore.setSlideComments([])
    presentationStore.setChatMessages([])
  })

  afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
      act(() => root.unmount())
      container.remove()
    }
    presentationStore.setActiveLeftPanel(null)
    presentationStore.setSlideComments([])
    presentationStore.setChatMessages([])
    sessionStorage.clear()
  })

  it("paints a real Search panel and jumps to the slide of a hit", async () => {
    const container = mount(createElement(LeftMenu))
    clickRailButton(container, "search")

    const node = panel(container, "search")
    expect(node).not.toBeNull()
    expect(node?.style.display).toBe("flex")
    expect(node?.textContent).toContain("Search")

    typeInto(container.querySelector<HTMLInputElement>('[data-action="search-query"]'), "overview")
    await clickButton(container, "search-run")

    expect(node?.textContent).toContain("Slide 2")
    expect(node?.textContent).toContain("Overview")

    const row = node?.querySelector<HTMLButtonElement>(".prese-left-panel-row")
    act(() => row?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
    expect(presentationStore.currentSlide).toBe(1)
  })

  it("paints a real Comments panel and anchors new threads to the slide on screen", async () => {
    const container = mount(createElement(LeftMenu))
    presentationStore.setCurrentSlide(2)
    clickRailButton(container, "comments")

    const node = panel(container, "comments")
    expect(node?.style.display).toBe("flex")

    typeInto(
      container.querySelector<HTMLTextAreaElement>('[data-action="comment-text"]'),
      "tighten this",
    )
    await clickButton(container, "comment-add")

    expect(presentationStore.slideComments).toHaveLength(1)
    expect(presentationStore.slideComments[0]?.slideIndex).toBe(2)
    expect(node?.textContent).toContain("tighten this")
    expect(node?.textContent).toContain("Slide 3")

    await clickButton(container, "comment-resolve")
    expect(presentationStore.slideComments[0]?.resolved).toBe(true)
  })

  it("paints a real Chat panel and sends a message", async () => {
    const container = mount(createElement(LeftMenu))
    clickRailButton(container, "chat")

    expect(panel(container, "chat")?.style.display).toBe("flex")

    typeInto(container.querySelector<HTMLInputElement>('[data-action="chat-text"]'), "hello")
    await clickButton(container, "chat-send")

    expect(presentationStore.chatMessages.map((m) => m.text)).toEqual(["hello"])
    expect(panel(container, "chat")?.textContent).toContain("hello")
  })

  it("paints a real Support panel whose entries open the File-menu panes", () => {
    const container = mount(createElement(LeftMenu))
    clickRailButton(container, "support")

    const node = panel(container, "support")
    expect(node?.style.display).toBe("flex")
    expect(node?.textContent).toContain("Get help")
    expect(node?.textContent).toContain("About this document")

    clickButton(container, "support-help")
    expect(presentationStore.isFileMenuOpen).toBe(true)
    expect(presentationStore.activeFileMenuPanel).toBe("help")
    expect(presentationStore.activeLeftPanel).toBeNull()
  })

  it("collapses the rail when the same toggle is clicked again", () => {
    const container = mount(createElement(LeftMenu))
    clickRailButton(container, "comments")
    expect(presentationStore.activeLeftPanel).toBe("comments")
    clickRailButton(container, "comments")
    expect(presentationStore.activeLeftPanel).toBeNull()
  })

  it("keeps the other panels mounted (hidden) so their state survives a collapse", () => {
    const container = mount(createElement(LeftMenu))
    clickRailButton(container, "search")
    expect(panel(container, "comments")?.style.display).toBe("none")
    expect(panel(container, "support")?.style.display).toBe("none")
    expect(panel(container, "chat")?.style.display).toBe("none")
  })
})
