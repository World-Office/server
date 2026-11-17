// @vitest-environment jsdom
/**
 * ChartPanel — right menu panel for chart properties.
 * Tests for Advanced settings, Width, Height controls.
 */
import type { ReactNode } from "react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartPanel } from "../components/ChartPanel"

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

function queryInputs(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll("input")] as HTMLInputElement[]
}

function getInputByLabel(container: HTMLElement, labelText: string): HTMLInputElement | null {
  const labels = container.querySelectorAll("label")
  for (const label of labels) {
    if (label.textContent?.includes(labelText)) {
      const input = label.querySelector("input")
      if (input) return input as HTMLInputElement
    }
  }
  return null
}

describe("ChartPanel Advanced settings", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
      act(() => root.unmount())
      container.remove()
    }
    vi.restoreAllMocks()
  })

  it("renders Advanced settings section with Width and Height inputs", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    
    // Check that Advanced settings section exists
    const sectionText = container.textContent ?? ""
    expect(sectionText).toContain("Advanced settings")
    
    // Check for Width label
    expect(sectionText).toContain("Width")
    
    // Check for Height label
    expect(sectionText).toContain("Height")
  })

  it("Width input has default value of 400", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const widthInput = getInputByLabel(container, "Width")
    
    expect(widthInput).not.toBeNull()
    expect(widthInput?.value).toBe("400")
    expect(widthInput?.type).toBe("number")
    expect(widthInput?.min).toBe("1")
    expect(widthInput?.max).toBe("2000")
  })

  it("Height input has default value of 300", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const heightInput = getInputByLabel(container, "Height")
    
    expect(heightInput).not.toBeNull()
    expect(heightInput?.value).toBe("300")
    expect(heightInput?.type).toBe("number")
    expect(heightInput?.min).toBe("1")
    expect(heightInput?.max).toBe("2000")
  })

  it("Width input dispatches chartWidth command on change", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const widthInput = getInputByLabel(container, "Width")
    const dispatchSpy = vi.spyOn(window, "dispatchEvent")
    
    expect(widthInput).not.toBeNull()
    
    act(() => {
      widthInput!.value = "600"
      widthInput!.dispatchEvent(new Event("change", { bubbles: true }))
    })
    
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "wo-command",
        detail: { command: "chartWidth", value: "600" },
      }),
    )
  })

  it("Height input dispatches chartHeight command on change", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const heightInput = getInputByLabel(container, "Height")
    const dispatchSpy = vi.spyOn(window, "dispatchEvent")
    
    expect(heightInput).not.toBeNull()
    
    act(() => {
      heightInput!.value = "500"
      heightInput!.dispatchEvent(new Event("change", { bubbles: true }))
    })
    
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "wo-command",
        detail: { command: "chartHeight", value: "500" },
      }),
    )
  })

  it("does not render when visible is false", () => {
    const container = mount(createElement(ChartPanel, { visible: false }))
    
    expect(container.textContent).toBe("")
  })
})
