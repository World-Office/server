import { render, screen } from "@testing-library/react"
import type { CollabUser } from "@world-office/editor-stores"
import { describe, expect, it } from "vitest"
import { CollaboratorList } from "../src/components/CollaboratorList"

const mockUsers: CollabUser[] = [
  { id: "u1", name: "Alice", color: "#E74C3C", isCurrentUser: true },
  { id: "u2", name: "Bob", color: "#3498DB", isCurrentUser: false },
  { id: "u3", name: "Carol", color: "#2ECC71", isCurrentUser: false },
]

describe("CollaboratorList", () => {
  it("should render all users", () => {
    render(<CollaboratorList users={mockUsers} />)
    expect(screen.getByText("A")).toBeDefined() // Alice initial
    expect(screen.getByText("B")).toBeDefined() // Bob initial
    expect(screen.getByText("C")).toBeDefined() // Carol initial
  })

  it("should show tooltip with full name on hover", () => {
    render(<CollaboratorList users={mockUsers} />)
    const alice = screen.getByTitle("Alice (you)")
    expect(alice).toBeDefined()
  })

  it("should mark current user avatar with a border", () => {
    render(<CollaboratorList users={mockUsers} />)
    const currentUserAvatar = screen.getByTitle("Alice (you)")
    expect(currentUserAvatar.style.border).toContain("2px solid")
  })

  it("should render empty state when no users", () => {
    render(<CollaboratorList users={[]} />)
    expect(screen.queryByTitle("Alice")).toBeNull()
  })

  it("should limit displayed avatars to maxDisplay", () => {
    render(<CollaboratorList users={mockUsers} maxDisplay={2} />)
    expect(screen.getByText("+1")).toBeDefined()
  })
})
