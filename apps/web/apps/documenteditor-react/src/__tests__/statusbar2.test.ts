// @vitest-environment jsdom
/**
 * PGP-8 — Status bar: action-status text slot + multipage zoom mode.
 *
 * Pins the two missing OO statusbar rows:
 *  - statusbar/Action status: a transient text slot (span.de-statusbar-status)
 *    any command can set via documentStore.setStatusMessage (save/export/
 *    spellcheck events) — empty by default, auto-cleared after a timeout.
 *  - statusbar/Multiple pages: a zoom-group button that flips the SAME
 *    documentStore.multiplePages field the View tab uses, routed through
 *    the same toggleMultiplePages action (word-commands parity).
 */
import type { ReactNode } from "react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { StatusBar } from "../components/StatusBar/StatusBar"
import { createWordCommandHandler } from "../lib/word-commands"
import { DocumentStore, documentStore } from "../stores/DocumentStore"

// useTranslation without an i18n provider throws — pass-through t().
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
// Avoid rendering the collaboration badge / avatar list in this unit.
vi.mock("@world-office/collaboration-react", () => ({
  CollaborationStatus: () => null,
  CollaboratorList: () => null,
}))
vi.mock("../lib/collaboration", () => ({
  collaborationStore: { connectionStatus: "disconnected", users: [] },
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

function multipageButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(".de-statusbar-multipage")
  if (!button) throw new Error("multipage button (.de-statusbar-multipage) not found")
  return button
}

function statusSlot(container: HTMLElement): HTMLSpanElement {
  const slot = container.querySelector<HTMLSpanElement>(".de-statusbar-status")
  if (!slot) throw new Error("status slot (span.de-statusbar-status) not found")
  return slot
}

beforeEach(() => {
  documentStore.multiplePages = false
  documentStore.clearStatusMessage()
})

afterEach(() => {
  documentStore.multiplePages = false
  documentStore.clearStatusMessage()
  for (const { root, container } of mounted) {
    act(() => root.unmount())
    container.remove()
  }
  mounted.length = 0
})

describe("StatusBar action-status text slot (PGP-8)", () => {
  it("renders an empty span.de-statusbar-status by default", () => {
    const container = mount(createElement(StatusBar))
    expect(documentStore.statusMessage).toBe("")
    expect(statusSlot(container).textContent).toBe("")
  })

  it("renders setStatusMessage('Saved') in the status region", () => {
    const container = mount(createElement(StatusBar))
    act(() => documentStore.setStatusMessage("Saved"))
    expect(documentStore.statusMessage).toBe("Saved")
    expect(statusSlot(container).textContent).toBe("Saved")
  })

  it("auto-clears the status message after the timeout", () => {
    vi.useFakeTimers()
    try {
      act(() => documentStore.setStatusMessage("Saved"))
      act(() => vi.advanceTimersByTime(4000))
      expect(documentStore.statusMessage).toBe("")
    } finally {
      vi.useRealTimers()
    }
  })

  it("hooks key events: markSaved, save success and spelling toggle set a message", () => {
    const store = new DocumentStore()
    act(() => store.markSaved())
    expect(store.statusMessage).toBe("Saved")
    act(() => store.clearStatusMessage())

    store.setSpellingEnabled(false)
    expect(store.statusMessage).toBe("Spell check off")
    act(() => store.clearStatusMessage())

    store.setSpellingEnabled(true)
    expect(store.statusMessage).toBe("Spell check on")
    act(() => store.clearStatusMessage())
  })
})

describe("StatusBar multipage zoom mode (PGP-8)", () => {
  it("toggles documentStore.multiplePages via the toggleMultiplePages action", () => {
    const container = mount(createElement(StatusBar))
    const button = multipageButton(container)
    expect(documentStore.multiplePages).toBe(false)
    expect(button.className).not.toContain("active")

    const spy = vi.spyOn(documentStore, "toggleMultiplePages")
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })))

    expect(spy).toHaveBeenCalledTimes(1)
    expect(documentStore.multiplePages).toBe(true)
    // Observer re-render flips the active state on the same shared field.
    expect(multipageButton(container).className).toContain("active")

    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })))
    expect(documentStore.multiplePages).toBe(false)
    expect(multipageButton(container).className).not.toContain("active")
    spy.mockRestore()
  })

  it("word-commands routing flips the same store field the button reads", () => {
    const container = mount(createElement(StatusBar))
    expect(documentStore.multiplePages).toBe(false)

    // The same handler the ribbon/View tab uses (createWordCommandHandler
    // routes toggleMultiplePages → documentStore.toggleMultiplePages).
    const handler = createWordCommandHandler({
      editorRef: { current: null },
      onRichTextCommand: vi.fn(),
    })
    act(() => handler({ command: "toggleMultiplePages" }))

    expect(documentStore.multiplePages).toBe(true)
    expect(multipageButton(container).className).toContain("active")

    act(() => handler({ command: "toggleMultiplePages" }))
    expect(documentStore.multiplePages).toBe(false)
    expect(multipageButton(container).className).not.toContain("active")
  })
})
