// @vitest-environment jsdom
/**
 * REGRESSION — DropdownControl double-dispatch.
 *
 * A ribbon dropdown item clicked while mounted in the app must fire exactly
 * ONE `wo-command` event. Bug: DropdownControl fired the raw CustomEvent AND
 * dispatch.onCommand (which the app's Toolbar routes to a second
 * wo-command), and commands like insertContentControl are panel toggles —
 * two events = open then immediately close (the content-controls dropdown
 * visibly did nothing).
 */
import { fireEvent, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ControlRenderer } from "../ribbon/components/ControlRenderer"
import type { RibbonContext, RibbonDropdownSpec } from "../ribbon/types"

const ITEMS = [
  { id: "cc-rich", label: "Rich Text", command: "insertContentControl" },
  { id: "cc-plain", label: "Plain Text", command: "insertPlainTextControl" },
]

describe("DropdownControl single wo-command dispatch", () => {
  const dispatch = {
    onCommand: vi.fn(),
    onRichTextCommand: vi.fn(),
    onMonacoCommand: vi.fn(),
  }
  const context = { isEditMode: true } as unknown as RibbonContext
  const events: string[] = []

  beforeEach(() => {
    dispatch.onCommand.mockClear()
    dispatch.onRichTextCommand.mockClear()
    dispatch.onMonacoCommand.mockClear()
    events.length = 0
    const listener = (e: Event) => events.push((e as CustomEvent).detail?.command ?? "")
    window.addEventListener("wo-command", listener)
    // The real Toolbar routes dispatch.onCommand to a wo-command event for
    // non-special commands.
    dispatch.onCommand.mockImplementation((cmd: string) => {
      window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: cmd } }))
    })
    return () => window.removeEventListener("wo-command", listener)
  })

  it("fires wo-command exactly once for a menu item click", () => {
    const spec: RibbonDropdownSpec = {
      id: "insert-content-control",
      type: "dropdown",
      label: "Content Controls",
      items: ITEMS,
    }
    render(<ControlRenderer control={spec} context={context} dispatch={dispatch} />)
    fireEvent.click(document.querySelector("#btn-insert-content-control")!)
    fireEvent.click(screenItem("Rich Text"))
    // onCommand routed to one event; DropdownControl must not add another.
    expect(events).toEqual(["insertContentControl"])
    expect(dispatch.onCommand).toHaveBeenCalledTimes(1)
  })

  it("each item fires only its own command", () => {
    const spec: RibbonDropdownSpec = {
      id: "insert-content-control",
      type: "dropdown",
      label: "Content Controls",
      items: ITEMS,
    }
    render(<ControlRenderer control={spec} context={context} dispatch={dispatch} />)
    fireEvent.click(document.querySelector("#btn-insert-content-control")!)
    fireEvent.click(screenItem("Plain Text"))
    expect(events).toEqual(["insertPlainTextControl"])
  })
})

function screenItem(label: string): HTMLElement {
  const buttons = document.querySelectorAll('[role="menuitem"]')
  for (const b of buttons) {
    if (b.textContent?.includes(label)) return b as HTMLElement
  }
  throw new Error(`no menuitem ${label}`)
}
