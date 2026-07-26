import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CollaborationStatus } from "../src/components/CollaborationStatus"

describe("CollaborationStatus", () => {
  it("should show 'Connected' with green dot when connected", () => {
    render(<CollaborationStatus state="connected" userCount={3} />)
    expect(screen.getByText("Connected")).toBeDefined()
    const dot = screen.getByTestId("collab-status-dot")
    expect(dot.getAttribute("data-color")).toBe("#2ECC71")
  })

  it("should show 'Connecting...' with yellow dot", () => {
    render(<CollaborationStatus state="connecting" userCount={0} />)
    expect(screen.getByText("Connecting...")).toBeDefined()
  })

  it("should show 'Reconnecting...' with orange dot", () => {
    render(<CollaborationStatus state="reconnecting" userCount={0} />)
    expect(screen.getByText("Reconnecting...")).toBeDefined()
  })

  it("should show 'Disconnected' with red dot", () => {
    render(<CollaborationStatus state="disconnected" userCount={0} />)
    expect(screen.getByText("Disconnected")).toBeDefined()
  })

  it("should show user count when connected", () => {
    render(<CollaborationStatus state="connected" userCount={3} />)
    expect(screen.getByText("3")).toBeDefined()
  })

  it("should not show user count when disconnected", () => {
    render(<CollaborationStatus state="disconnected" userCount={0} />)
    expect(screen.queryByText("0")).toBeNull()
  })

  it("should have role='status' for accessibility", () => {
    render(<CollaborationStatus state="connected" userCount={1} />)
    expect(screen.getByRole("status")).toBeDefined()
  })
})
