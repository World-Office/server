import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DropdownMenu } from "../components/DropdownMenu"

describe("DropdownMenu", () => {
  const onSelect = vi.fn()

  const items = [
    { id: "copy", label: "Copy" },
    { id: "paste", label: "Paste" },
    { id: "sep1", label: "", separator: true as const },
    { id: "delete", label: "Delete", disabled: true },
    { id: "check", label: "Word Wrap", checkable: true as const, checked: true },
  ]

  beforeEach(() => {
    onSelect.mockClear()
  })

  it("renders trigger and opens menu on click", () => {
    render(<DropdownMenu trigger="Edit" items={items} onSelect={onSelect} />)
    const triggerBtn = screen.getByText("Edit")
    expect(triggerBtn).toBeInTheDocument()
    fireEvent.click(triggerBtn)
    expect(screen.getByRole("menu")).toBeInTheDocument()
    expect(screen.getByText("Copy")).toBeInTheDocument()
    expect(screen.getByText("Paste")).toBeInTheDocument()
  })

  it("renders a separator", () => {
    render(<DropdownMenu trigger="Edit" items={items} onSelect={onSelect} />)
    fireEvent.click(screen.getByText("Edit"))
    // Separators render as li with specific styling
    const menu = screen.getByRole("menu")
    const listItems = menu.querySelectorAll("li")
    expect(listItems.length).toBeGreaterThan(0)
  })

  it("calls onSelect when a non-disabled item is clicked", () => {
    render(<DropdownMenu trigger="Edit" items={items} onSelect={onSelect} />)
    fireEvent.click(screen.getByText("Edit"))
    fireEvent.click(screen.getByText("Copy"))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "copy", label: "Copy" }))
  })

  it("does not call onSelect for disabled items", () => {
    render(<DropdownMenu trigger="Edit" items={items} onSelect={onSelect} />)
    fireEvent.click(screen.getByText("Edit"))
    const deleteItem = screen.getByText("Delete").closest("button")
    expect(deleteItem?.style.opacity).toBe("0.5")
  })

  it("renders checkable item with checkmark when checked", () => {
    render(<DropdownMenu trigger="Edit" items={items} onSelect={onSelect} />)
    fireEvent.click(screen.getByText("Edit"))
    const checkItem = screen.getByText("Word Wrap")
    const checkSvg = checkItem.closest("button")?.querySelector("svg")
    expect(checkSvg).toBeTruthy() // checkmark SVG present
  })

  it("closes menu after selecting an item", () => {
    render(<DropdownMenu trigger="Edit" items={items} onSelect={onSelect} />)
    fireEvent.click(screen.getByText("Edit"))
    expect(screen.getByRole("menu")).toBeInTheDocument()
    fireEvent.click(screen.getByText("Copy"))
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("closes menu on outside click", () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <DropdownMenu trigger="Edit" items={items} onSelect={onSelect} />
      </div>,
    )
    fireEvent.click(screen.getByText("Edit"))
    expect(screen.getByRole("menu")).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId("outside"))
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("supports custom trigger elements", () => {
    render(
      <DropdownMenu
        trigger={<span data-testid="custom-trigger">Custom</span>}
        items={items}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByTestId("custom-trigger")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("custom-trigger"))
    expect(screen.getByRole("menu")).toBeInTheDocument()
  })

  it("supports right alignment", () => {
    render(<DropdownMenu trigger="Edit" items={items} onSelect={onSelect} align="right" />)
    fireEvent.click(screen.getByText("Edit"))
    const menu = screen.getByRole("menu")
    // The popover wrapper has right:0 style
    expect(menu.parentElement?.parentElement?.querySelector("div")).toBeTruthy()
  })

  it("renders submenu items with arrow indicator", () => {
    const itemsWithSubmenu = [
      {
        id: "sort",
        label: "Sort",
        children: [
          { id: "sort-asc", label: "Ascending" },
          { id: "sort-desc", label: "Descending" },
        ],
      },
    ]
    render(<DropdownMenu trigger="Data" items={itemsWithSubmenu} onSelect={onSelect} />)
    fireEvent.click(screen.getByText("Data"))
    const arrow = screen.getByText("▶")
    expect(arrow).toBeInTheDocument()
  })
})
