import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CollaboratorCursors } from "../src/components/CollaboratorCursors"

describe("CollaboratorCursors", () => {
  it("should render a cursor for each remote user", () => {
    const cursors = new Map([
      ["user-2", { page: 1, x: 100, y: 200 }],
      ["user-3", { page: 1, x: 300, y: 150 }],
    ])
    const userColors = new Map([
      ["user-2", "#3498DB"],
      ["user-3", "#2ECC71"],
    ])
    const userNames = new Map([
      ["user-2", "Bob"],
      ["user-3", "Carol"],
    ])

    render(<CollaboratorCursors cursors={cursors} userColors={userColors} userNames={userNames} />)

    expect(screen.getByText("Bob")).toBeDefined()
    expect(screen.getByText("Carol")).toBeDefined()
  })

  it("should position cursors at correct coordinates", () => {
    const cursors = new Map([["user-2", { page: 1, x: 150, y: 250 }]])
    const userColors = new Map([["user-2", "#3498DB"]])
    const userNames = new Map([["user-2", "Bob"]])

    render(<CollaboratorCursors cursors={cursors} userColors={userColors} userNames={userNames} />)

    const cursor = screen.getByTestId("cursor-user-2")
    expect(cursor.style.left).toBe("150px")
    expect(cursor.style.top).toBe("250px")
  })

  it("should render nothing when no cursors", () => {
    const { container } = render(
      <CollaboratorCursors cursors={new Map()} userColors={new Map()} userNames={new Map()} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
