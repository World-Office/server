import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ComboBox } from "../components/ComboBox"

describe("ComboBox", () => {
  const onChange = vi.fn()
  const onSelectionChange = vi.fn()

  const items = [
    { value: "arial", displayValue: "Arial" },
    { value: "calibri", displayValue: "Calibri" },
    { value: "times", displayValue: "Times New Roman" },
    { value: "georgia", displayValue: "Georgia" },
  ]

  beforeEach(() => {
    onChange.mockClear()
    onSelectionChange.mockClear()
  })

  it("renders input with placeholder", () => {
    render(<ComboBox items={items} placeholder="Select font..." onChange={onChange} />)
    const input = screen.getByPlaceholderText("Select font...")
    expect(input).toBeInTheDocument()
  })

  it("opens dropdown on focus and click", () => {
    render(<ComboBox items={items} onChange={onChange} />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    fireEvent.click(input)
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0)
  })

  it("filters items based on typed text", () => {
    render(<ComboBox items={items} onChange={onChange} />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    fireEvent.click(input)
    fireEvent.change(input, { target: { value: "ari" } })
    const menuItems = screen.getAllByRole("menuitem")
    expect(menuItems.length).toBe(1)
    expect(menuItems[0]).toHaveTextContent("Arial")
  })

  it("selects an item on click", () => {
    render(<ComboBox items={items} onChange={onChange} onSelectionChange={onSelectionChange} />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    fireEvent.click(screen.getByText("Calibri"))
    expect(onChange).toHaveBeenCalledWith("calibri", expect.objectContaining({ value: "calibri" }))
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ value: "calibri" }))
  })

  it("selects item on Enter key with highlighted index", () => {
    render(<ComboBox items={items} onChange={onChange} onSelectionChange={onSelectionChange} />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    // ArrowDown to highlight first item
    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onChange).toHaveBeenCalled()
  })

  it("closes dropdown on Escape key", () => {
    render(<ComboBox items={items} onChange={onChange} />)
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    fireEvent.click(input)
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0)
    fireEvent.keyDown(input, { key: "Escape" })
    expect(screen.queryByRole("menuitem")).toBeNull()
  })

  it("closes dropdown on click outside", () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <ComboBox items={items} onChange={onChange} />
      </div>,
    )
    const input = screen.getByRole("combobox")
    fireEvent.focus(input)
    fireEvent.click(input)
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0)
    fireEvent.mouseDown(screen.getByTestId("outside"))
    expect(screen.queryByRole("menuitem")).toBeNull()
  })

  it("is disabled when disabled prop is true", () => {
    render(<ComboBox items={items} disabled onChange={onChange} />)
    const input = screen.getByRole("combobox")
    expect(input).toBeDisabled()
  })
})
