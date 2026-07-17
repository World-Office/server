import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FlyoutPanel } from "../components/FlyoutPanel"

describe("FlyoutPanel", () => {
  it("renders trigger element", () => {
    render(
      <FlyoutPanel trigger={<button type="button">Click me</button>}>
        <div>Panel content</div>
      </FlyoutPanel>,
    )
    expect(screen.getByText("Click me")).toBeInTheDocument()
  })

  it("opens panel on trigger click (uncontrolled)", () => {
    render(
      <FlyoutPanel trigger={<button type="button">Open</button>}>
        <div data-testid="panel-content">Content</div>
      </FlyoutPanel>,
    )
    expect(screen.queryByTestId("panel-content")).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("Open"))
    expect(screen.getByTestId("panel-content")).toBeInTheDocument()
  })

  it("closes panel on second trigger click (toggle)", () => {
    render(
      <FlyoutPanel trigger={<button type="button">Toggle</button>}>
        <div data-testid="panel-content">Content</div>
      </FlyoutPanel>,
    )
    fireEvent.click(screen.getByText("Toggle"))
    expect(screen.getByTestId("panel-content")).toBeInTheDocument()
    fireEvent.click(screen.getByText("Toggle"))
    expect(screen.queryByTestId("panel-content")).not.toBeInTheDocument()
  })

  it("supports controlled mode via visible prop", () => {
    const onVisibleChange = vi.fn()
    render(
      <FlyoutPanel
        trigger={<button type="button">Trigger</button>}
        visible={true}
        onVisibleChange={onVisibleChange}
      >
        <div data-testid="panel-content">Content</div>
      </FlyoutPanel>,
    )
    expect(screen.getByTestId("panel-content")).toBeInTheDocument()
  })

  it("calls onVisibleChange when trigger clicked in controlled mode", () => {
    const onVisibleChange = vi.fn()
    render(
      <FlyoutPanel
        trigger={<button type="button">Trigger</button>}
        visible={false}
        onVisibleChange={onVisibleChange}
      >
        <div>Content</div>
      </FlyoutPanel>,
    )
    fireEvent.click(screen.getByText("Trigger"))
    expect(onVisibleChange).toHaveBeenCalledWith(true)
  })

  it("dismisses on outside click", () => {
    render(
      <div>
        <div data-testid="outside">Outside area</div>
        <FlyoutPanel trigger={<button type="button">Open</button>}>
          <div data-testid="panel-content">Content</div>
        </FlyoutPanel>
      </div>,
    )
    fireEvent.click(screen.getByText("Open"))
    expect(screen.getByTestId("panel-content")).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId("outside"))
    expect(screen.queryByTestId("panel-content")).not.toBeInTheDocument()
  })

  it("renders string triggers as buttons", () => {
    render(
      <FlyoutPanel trigger="String Trigger">
        <div>Content</div>
      </FlyoutPanel>,
    )
    expect(screen.getByText("String Trigger")).toBeInTheDocument()
  })
})
