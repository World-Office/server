import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ContextMenu } from "../components/ContextMenu"

describe("ContextMenu", () => {
  const onClose = vi.fn()
  const onSelect = vi.fn()

  const items = [
    { id: "cut", label: "Cut" },
    { id: "copy", label: "Copy" },
    { id: "sep1", label: "", separator: true as const },
    { id: "paste", label: "Paste", disabled: true },
    { id: "wrap", label: "Word Wrap", checkable: true as const, checked: false },
  ]

  beforeEach(() => {
    onClose.mockClear()
    onSelect.mockClear()
  })

  it("renders nothing when visible is false", () => {
    render(<ContextMenu items={items} x={100} y={100} visible={false} onClose={onClose} />)
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("renders menu items when visible is true", () => {
    render(<ContextMenu items={items} x={100} y={100} visible={true} onClose={onClose} onSelect={onSelect} />)
    expect(screen.getByRole("menu")).toBeInTheDocument()
    expect(screen.getByText("Cut")).toBeInTheDocument()
    expect(screen.getByText("Copy")).toBeInTheDocument()
  })

  it("calls onSelect when an enabled item is clicked", () => {
    render(<ContextMenu items={items} x={100} y={100} visible={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByText("Cut"))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "cut" }))
  })

  it("does not call onSelect for disabled items", () => {
    render(<ContextMenu items={items} x={100} y={100} visible={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByText("Paste"))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("calls onClose on outside click", () => {
    vi.useFakeTimers()
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <ContextMenu items={items} x={100} y={100} visible={true} onClose={onClose} onSelect={onSelect} />
      </div>,
    )
    vi.advanceTimersByTime(10)
    fireEvent.mouseDown(screen.getByTestId("outside"))
    expect(onClose).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("calls onClose on Escape key", () => {
    render(<ContextMenu items={items} x={100} y={100} visible={true} onClose={onClose} onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })

  it("renders checkable item without checkmark when unchecked", () => {
    render(<ContextMenu items={items} x={100} y={100} visible={true} onClose={onClose} onSelect={onSelect} />)
    const wrapItem = screen.getByText("Word Wrap").closest("button")
    const svg = wrapItem?.querySelector("svg")
    expect(svg).toBeNull() // no checkmark when unchecked
  })

  it("renders checkable item with checkmark when checked", () => {
    const simpleItems = [
      { id: "wrap", label: "Word Wrap", checkable: true as const, checked: true },
    ]
    render(<ContextMenu items={simpleItems} x={100} y={100} visible={true} onClose={onClose} onSelect={onSelect} />)
    const wrapBtn = screen.getByText("Word Wrap").closest("button")
    const svg = wrapBtn?.querySelector("svg")
    expect(svg).toBeTruthy()
  })

  it("renders submenu items with arrow indicator", () => {
    const itemsWithSubmenu = [
      { id: "sort", label: "Sort", children: [{ id: "sort-asc", label: "Ascending" }, { id: "sort-desc", label: "Descending" }] },
    ]
    render(<ContextMenu items={itemsWithSubmenu} x={100} y={100} visible={true} onClose={onClose} onSelect={onSelect} />)
    const arrow = screen.getByText("▶")
    expect(arrow).toBeInTheDocument()
  })
})
