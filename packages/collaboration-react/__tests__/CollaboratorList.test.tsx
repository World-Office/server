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

  it("should render avatar images when provided", () => {
    const usersWithAvatars: CollabUser[] = [
      {
        id: "u1",
        name: "Alice",
        color: "#E74C3C",
        isCurrentUser: true,
        avatar: "https://example.com/alice.png",
      },
      {
        id: "u2",
        name: "Bob",
        color: "#3498DB",
        isCurrentUser: false,
        avatar: "https://example.com/bob.png",
      },
    ]
    render(<CollaboratorList users={usersWithAvatars} />)
    const avatars = screen.getAllByRole("img")
    expect(avatars).toHaveLength(2)
    expect(avatars[0].getAttribute("src")).toBe("https://example.com/alice.png")
    expect(avatars[1].getAttribute("src")).toBe("https://example.com/bob.png")
  })

  it("should fall back to initials when no avatar", () => {
    render(<CollaboratorList users={mockUsers} />)
    expect(screen.getByText("A")).toBeDefined()
    expect(screen.getByText("B")).toBeDefined()
    expect(screen.getByText("C")).toBeDefined()
    const avatars = screen.queryAllByRole("img")
    expect(avatars).toHaveLength(0)
  })
})
