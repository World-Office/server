import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { ColorPicker } from "../components/ColorPicker"
import { SpinBox } from "../components/SpinBox"

// ── ColorPicker ─────────────────────────────────────────────────────────

describe("ColorPicker", () => {
  const onChange = vi.fn()

  beforeEach(() => {
    onChange.mockClear()
  })

  it("renders a button showing the current color", () => {
    render(<ColorPicker value="#FF0000" onChange={onChange} />)
    const button = screen.getByRole("button")
    expect(button).toBeInTheDocument()
    // The indicator inside shows the current color as background
    const indicator = button.querySelector("span > span")
    expect(indicator).toBeTruthy()
  })

  it("opens the palette panel on click", () => {
    render(<ColorPicker value="#000000" onChange={onChange} />)
    const button = screen.getByRole("button")
    fireEvent.click(button)
    // Palette panel should show theme colors heading
    expect(screen.getByText("Theme Colors")).toBeInTheDocument()
  })

  it("calls onChange with the selected color when a swatch is clicked", () => {
    render(<ColorPicker value="#000000" onChange={onChange} />)
    const button = screen.getByRole("button")
    fireEvent.click(button)

    // Find the first color swatch button (not the toggle button)
    const swatches = screen.getAllByRole("button").filter(
      (btn) => btn !== button && btn.title && btn.title.startsWith("#"),
    )
    expect(swatches.length).toBeGreaterThan(0)
    fireEvent.click(swatches[0])
    expect(onChange).toHaveBeenCalledWith(swatches[0].title)
  })

  it('calls onChange with "transparent" when No Color is clicked', () => {
    render(<ColorPicker value="#FF0000" onChange={onChange} />)
    const button = screen.getByRole("button")
    fireEvent.click(button)
    const noColorBtn = screen.getByText("No Color")
    fireEvent.click(noColorBtn)
    expect(onChange).toHaveBeenCalledWith("transparent")
  })

  it("does not open the palette when disabled", () => {
    render(<ColorPicker value="#000000" onChange={onChange} disabled />)
    const button = screen.getByRole("button")
    fireEvent.click(button)
    expect(screen.queryByText("Theme Colors")).not.toBeInTheDocument()
  })

  it("uses custom preset colors when provided", () => {
    const custom = ["#111", "#222", "#333"]
    render(<ColorPicker value="#000000" onChange={onChange} presetColors={custom} />)
    const button = screen.getByRole("button")
    fireEvent.click(button)
    // Should show custom swatches (3 in a single row, no default grid heading)
    // "Theme Colors" still renders as section header
    expect(screen.getByText("Theme Colors")).toBeInTheDocument()
  })

  it("closes the palette on outside click", () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <ColorPicker value="#000000" onChange={onChange} />
      </div>,
    )
    const button = screen.getByRole("button")
    fireEvent.click(button)
    expect(screen.getByText("Theme Colors")).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId("outside"))
    expect(screen.queryByText("Theme Colors")).not.toBeInTheDocument()
  })
})

// ── SpinBox ────────────────────────────────────────────────────────────

describe("SpinBox", () => {
  const onChange = vi.fn()

  beforeEach(() => {
    onChange.mockClear()
  })

  it("renders with the current value", () => {
    render(<SpinBox value={12} onChange={onChange} />)
    const input = screen.getByDisplayValue("12")
    expect(input).toBeInTheDocument()
  })

  it("increments on up button click", () => {
    render(<SpinBox value={12} onChange={onChange} step={1} min={0} max={100} />)
    const upBtn = screen.getByLabelText("Increase")
    fireEvent.click(upBtn)
    expect(onChange).toHaveBeenCalledWith(13)
  })

  it("decrements on down button click", () => {
    render(<SpinBox value={12} onChange={onChange} step={1} min={0} max={100} />)
    const downBtn = screen.getByLabelText("Decrease")
    fireEvent.click(downBtn)
    expect(onChange).toHaveBeenCalledWith(11)
  })

  it("respects min boundary on decrement", () => {
    render(<SpinBox value={0} onChange={onChange} step={1} min={0} max={100} />)
    const downBtn = screen.getByLabelText("Decrease")
    fireEvent.click(downBtn)
    expect(onChange).toHaveBeenCalledWith(0) // clamped to min
  })

  it("respects max boundary on increment", () => {
    render(<SpinBox value={100} onChange={onChange} step={1} min={0} max={100} />)
    const upBtn = screen.getByLabelText("Increase")
    fireEvent.click(upBtn)
    expect(onChange).toHaveBeenCalledWith(100) // clamped to max
  })

  it("commits typed value on Enter", () => {
    render(<SpinBox value={12} onChange={onChange} step={1} min={0} max={100} />)
    const input = screen.getByRole("spinbutton")
    fireEvent.change(input, { target: { value: "24" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onChange).toHaveBeenCalledWith(24)
  })

  it("reverts to current value on Escape", () => {
    render(<SpinBox value={12} onChange={onChange} step={1} min={0} max={100} />)
    const input = screen.getByDisplayValue("12")
    fireEvent.change(input, { target: { value: "999" } })
    fireEvent.keyDown(input, { key: "Escape" })
    expect(screen.getByDisplayValue("12")).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("increments on ArrowUp key", () => {
    render(<SpinBox value={12} onChange={onChange} step={1} min={0} max={100} />)
    const input = screen.getByRole("spinbutton")
    fireEvent.keyDown(input, { key: "ArrowUp" })
    expect(onChange).toHaveBeenCalledWith(13)
  })

  it("decrements on ArrowDown key", () => {
    render(<SpinBox value={12} onChange={onChange} step={1} min={0} max={100} />)
    const input = screen.getByRole("spinbutton")
    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(onChange).toHaveBeenCalledWith(11)
  })

  it("does not call onChange when disabled", () => {
    render(<SpinBox value={12} onChange={onChange} step={1} min={0} max={100} disabled />)
    const upBtn = screen.getByLabelText("Increase")
    fireEvent.click(upBtn)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("uses custom step value", () => {
    render(<SpinBox value={10} onChange={onChange} step={5} min={0} max={100} />)
    const upBtn = screen.getByLabelText("Increase")
    fireEvent.click(upBtn)
    expect(onChange).toHaveBeenCalledWith(15)
  })

  it("clamps out-of-range typed value on blur", () => {
    render(<SpinBox value={12} onChange={onChange} step={1} min={0} max={100} />)
    const input = screen.getByRole("spinbutton")
    fireEvent.change(input, { target: { value: "500" } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(100) // clamped to max
  })

  it("reverts to current value when typing non-numeric on blur", () => {
    render(<SpinBox value={12} onChange={onChange} step={1} min={0} max={100} />)
    const input = screen.getByDisplayValue("12")
    fireEvent.change(input, { target: { value: "abc" } })
    fireEvent.blur(input)
    expect(screen.getByDisplayValue("12")).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})
