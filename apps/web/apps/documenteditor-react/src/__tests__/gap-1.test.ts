// @vitest-environment jsdom
/**
 * PF-GAP-1 — Parity fill: Chart design — Advanced settings, Width, Height
 * covers OO golden labels: ["Advanced settings", "Width", "Height"]
 */
import { createElement } from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartPanel } from "../components/ChartPanel"

const mounted: Array<{
  root: ReturnType<typeof createRoot>
  container: HTMLDivElement
}> = []

function mount(node: React.ReactNode): HTMLElement {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(node))
  mounted.push({ root, container })
  return container
}

function getLabelByText(container: HTMLElement, text: string): HTMLElement | null {
  const labels = container.querySelectorAll("label")
  for (const label of labels) {
    if (label.textContent?.includes(text)) return label
  }
  return null
}

describe("PF-GAP-1: Chart design — Advanced settings, Width, Height labels", () => {
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

  it("renders 'Advanced settings' label", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const text = container.textContent ?? ""
    expect(text).toContain("Advanced settings")
  })

  it("renders 'Width' label", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const text = container.textContent ?? ""
    expect(text).toContain("Width")
  })

  it("renders 'Height' label", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const text = container.textContent ?? ""
    expect(text).toContain("Height")
  })

  it("Width label is associated with a number input", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const widthLabel = getLabelByText(container, "Width")
    expect(widthLabel).not.toBeNull()
    const input = widthLabel?.querySelector("input")
    expect(input).not.toBeNull()
    expect(input?.type).toBe("number")
  })

  it("Height label is associated with a number input", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const heightLabel = getLabelByText(container, "Height")
    expect(heightLabel).not.toBeNull()
    const input = heightLabel?.querySelector("input")
    expect(input).not.toBeNull()
    expect(input?.type).toBe("number")
  })

  it("Width input has Range constraints min=1 max=2000", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const widthLabel = getLabelByText(container, "Width")
    const input = widthLabel?.querySelector("input") as HTMLInputElement | null
    expect(input).not.toBeNull()
    expect(input?.min).toBe("1")
    expect(input?.max).toBe("2000")
  })

  it("Height input has Range constraints min=1 max=2000", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const heightLabel = getLabelByText(container, "Height")
    const input = heightLabel?.querySelector("input") as HTMLInputElement | null
    expect(input).not.toBeNull()
    expect(input?.min).toBe("1")
    expect(input?.max).toBe("2000")
  })

  it("Width input default value is 400", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const widthLabel = getLabelByText(container, "Width")
    const input = widthLabel?.querySelector("input") as HTMLInputElement | null
    expect(input).not.toBeNull()
    expect(input?.value).toBe("400")
  })

  it("Height input default value is 300", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const heightLabel = getLabelByText(container, "Height")
    const input = heightLabel?.querySelector("input") as HTMLInputElement | null
    expect(input).not.toBeNull()
    expect(input?.value).toBe("300")
  })

  it("Width input dispatches chartWidth wo-command on change", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const widthLabel = getLabelByText(container, "Width")
    const input = widthLabel?.querySelector("input") as HTMLInputElement | null
    const dispatchSpy = vi.spyOn(window, "dispatchEvent")
    expect(input).not.toBeNull()

    const setNativeValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!
    act(() => {
      setNativeValue.call(input!, "800")
      input!.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "wo-command",
        detail: expect.objectContaining({ command: "chartWidth", value: "800" }),
      }),
    )
    dispatchSpy.mockRestore()
  })

  it("Height input dispatches chartHeight wo-command on change", () => {
    const container = mount(createElement(ChartPanel, { visible: true }))
    const heightLabel = getLabelByText(container, "Height")
    const input = heightLabel?.querySelector("input") as HTMLInputElement | null
    const dispatchSpy = vi.spyOn(window, "dispatchEvent")
    expect(input).not.toBeNull()

    const setNativeValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!
    act(() => {
      setNativeValue.call(input!, "600")
      input!.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "wo-command",
        detail: expect.objectContaining({ command: "chartHeight", value: "600" }),
      }),
    )
    dispatchSpy.mockRestore()
  })
})
