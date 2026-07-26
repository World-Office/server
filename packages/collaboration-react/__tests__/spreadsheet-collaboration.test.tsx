import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useSpreadsheetCollaboration } from "../src/hooks/useSpreadsheetCollaboration"

function createMockWebSocket() {
  let onopen: (() => void) | null = null
  let onclose: ((ev: CloseEvent) => void) | null = null
  let onmessage: ((ev: MessageEvent) => void) | null = null
  let onerror: ((ev: Event) => void) | null = null

  const mockWs = {
    readyState: 0 as number,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn((event: string, handler: EventListener) => {
      if (event === "open") onopen = handler as () => void
      if (event === "close") onclose = handler as (ev: CloseEvent) => void
      if (event === "message") onmessage = handler as (ev: MessageEvent) => void
      if (event === "error") onerror = handler as (ev: Event) => void
    }),
    removeEventListener: vi.fn(),
  }

  return {
    mockWs,
    simulateOpen() {
      mockWs.readyState = 1
      onopen?.()
    },
    simulateMessage(data: string) {
      onmessage?.(new MessageEvent("message", { data }))
    },
    simulateClose(code = 1000, reason = "") {
      mockWs.readyState = 3
      onclose?.(new CloseEvent("close", { code, reason, wasClean: code === 1000 }))
    },
  }
}

describe("useSpreadsheetCollaboration", () => {
  /** Fresh WebSocket helper set before each test that uses a WS. */
  let wsHelper: ReturnType<typeof createMockWebSocket>

  beforeEach(() => {
    // Stub WebSocket so each `new WebSocket(url)` call assigns wsHelper
    vi.stubGlobal(
      "WebSocket",
      vi.fn().mockImplementation(() => {
        wsHelper = createMockWebSocket()
        return wsHelper.mockWs
      }),
    )
    // Default fetch mock — returns session creation + join responses
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/join")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              participants: [
                { user_id: "me", username: "Me", color: "#FF0000" },
              ],
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ session_id: "session-1" }),
        })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("should return disconnected initially", () => {
    const { result } = renderHook(() =>
      useSpreadsheetCollaboration({
        wsUrl: "ws://localhost:8004/ws/{session_id}",
        userId: "me",
        username: "Me",
      }),
    )

    expect(result.current.connectionState).toBe("disconnected")
  })

  it("should connect, create session, join, and open WebSocket", async () => {
    const onSessionJoined = vi.fn()
    const { result } = renderHook(() =>
      useSpreadsheetCollaboration({
        wsUrl: "ws://localhost:8004/ws/{session_id}",
        userId: "me",
        username: "Me",
        onSessionJoined,
      }),
    )

    // Start connection — internally calls fetch(session create) → fetch(join) → new WebSocket
    await act(async () => {
      await result.current.connect()
    })

    // After connect() completes, the WebSocket should have been created
    expect(wsHelper).toBeDefined()
    expect(result.current.connectionState).toBe("connecting")

    // Simulate WebSocket open
    await act(async () => {
      wsHelper.simulateOpen()
    })

    expect(result.current.connectionState).toBe("connected")

    // onSessionJoined called with the participants from the join response
    expect(onSessionJoined).toHaveBeenCalledOnce()
    expect(onSessionJoined.mock.calls[0][0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: "me" })]),
    )
    expect(onSessionJoined.mock.calls[0][1]).toBe("me")
  })

  it("should send spreadsheet operations when connected", async () => {
    const { result } = renderHook(() =>
      useSpreadsheetCollaboration({
        wsUrl: "ws://localhost:8004/ws/{session_id}",
        userId: "me",
        username: "Me",
      }),
    )

    await act(async () => {
      await result.current.connect()
    })
    await act(async () => {
      wsHelper.simulateOpen()
    })

    await act(async () => {
      result.current.sendSpreadsheetOp({
        action: "set_cell_value",
        payload: {
          sheet_name: "Sheet1",
          cell: "A1",
          value: "Hello",
        },
      })
    })

    expect(wsHelper.mockWs.send).toHaveBeenCalledOnce()
    const sent = JSON.parse(wsHelper.mockWs.send.mock.calls[0][0])
    expect(sent.type).toBe("spreadsheet_op")
    expect(sent.operation.action).toBe("set_cell_value")
    expect(sent.operation.payload.cell).toBe("A1")
  })

  it("should queue spreadsheet operations when disconnected and flush on open", async () => {
    const { result } = renderHook(() =>
      useSpreadsheetCollaboration({
        wsUrl: "ws://localhost:8004/ws/{session_id}",
        userId: "me",
        username: "Me",
      }),
    )

    // Connect first (creates manager with WebSocket)
    await act(async () => {
      await result.current.connect()
    })

    // Send before WebSocket opens — should be queued
    act(() => {
      result.current.sendSpreadsheetOp({
        action: "merge_cells",
        sheet_name: "Sheet1",
        range: "A1:B2",
      })
    })

    // Open WS — queue flushes
    await act(async () => {
      wsHelper.simulateOpen()
    })

    expect(wsHelper.mockWs.send).toHaveBeenCalled()
    const sent = JSON.parse(wsHelper.mockWs.send.mock.calls[0][0])
    expect(sent.operation.action).toBe("merge_cells")
  })

  it("should invoke onSpreadsheetOp callback on remote operation", async () => {
    const onSpreadsheetOp = vi.fn()
    const { result } = renderHook(() =>
      useSpreadsheetCollaboration({
        wsUrl: "ws://localhost:8004/ws/{session_id}",
        userId: "me",
        username: "Me",
        onSpreadsheetOp,
      }),
    )

    await act(async () => {
      await result.current.connect()
    })
    await act(async () => {
      wsHelper.simulateOpen()
    })

    // Simulate receiving a remote spreadsheet operation
    await act(async () => {
      wsHelper.simulateMessage(
        JSON.stringify({
          type: "spreadsheet_op",
          session_id: "session-1",
          user_id: "other-user",
          operation: {
            action: "set_cell_value",
            payload: {
              sheet_name: "Sheet1",
              cell: "B2",
              value: 42,
            },
          },
        }),
      )
    })

    expect(onSpreadsheetOp).toHaveBeenCalledOnce()
    expect(onSpreadsheetOp.mock.calls[0][0].action).toBe("set_cell_value")
    expect(onSpreadsheetOp.mock.calls[0][1]).toBe("other-user")
  })

  it("should invoke onSpreadsheetOp for style operations", async () => {
    const onSpreadsheetOp = vi.fn()
    const { result } = renderHook(() =>
      useSpreadsheetCollaboration({
        wsUrl: "ws://localhost:8004/ws/{session_id}",
        userId: "me",
        username: "Me",
        onSpreadsheetOp,
      }),
    )

    await act(async () => {
      await result.current.connect()
    })
    await act(async () => {
      wsHelper.simulateOpen()
    })

    await act(async () => {
      wsHelper.simulateMessage(
        JSON.stringify({
          type: "spreadsheet_op",
          session_id: "session-1",
          user_id: "other-user",
          operation: {
            action: "set_cell_style",
            payload: {
              sheet_name: "Sheet1",
              cell: "C3",
              bold: true,
              italic: false,
              font_size: 14,
            },
          },
        }),
      )
    })

    expect(onSpreadsheetOp).toHaveBeenCalledOnce()
    const [op, userId] = onSpreadsheetOp.mock.calls[0]
    expect(op.action).toBe("set_cell_style")
    expect(op.payload.bold).toBe(true)
    expect(userId).toBe("other-user")
  })

  it("should invoke onSpreadsheetOp for sheet actions", async () => {
    const onSpreadsheetOp = vi.fn()
    const { result } = renderHook(() =>
      useSpreadsheetCollaboration({
        wsUrl: "ws://localhost:8004/ws/{session_id}",
        userId: "me",
        username: "Me",
        onSpreadsheetOp,
      }),
    )

    await act(async () => {
      await result.current.connect()
    })
    await act(async () => {
      wsHelper.simulateOpen()
    })

    await act(async () => {
      wsHelper.simulateMessage(
        JSON.stringify({
          type: "spreadsheet_op",
          session_id: "session-1",
          user_id: "other-user",
          operation: {
            action: "sheet_action",
            payload: {
              action: "rename",
              sheet_name: "Sheet1",
              new_name: "Data",
            },
          },
        }),
      )
    })

    expect(onSpreadsheetOp).toHaveBeenCalledOnce()
    const [op] = onSpreadsheetOp.mock.calls[0]
    expect(op.action).toBe("sheet_action")
    expect(op.payload.action).toBe("rename")
    expect(op.payload.new_name).toBe("Data")
  })

  it("should invoke onParticipantUpdate on cursor events", async () => {
    const onParticipantUpdate = vi.fn()
    const { result } = renderHook(() =>
      useSpreadsheetCollaboration({
        wsUrl: "ws://localhost:8004/ws/{session_id}",
        userId: "me",
        username: "Me",
        onParticipantUpdate,
      }),
    )

    await act(async () => {
      await result.current.connect()
    })
    await act(async () => {
      wsHelper.simulateOpen()
    })

    await act(async () => {
      wsHelper.simulateMessage(
        JSON.stringify({
          type: "participant_update",
          update: {
            event: "cursor_moved",
            user_id: "other-user",
            username: "Other",
            color: "#00FF00",
            cursor_position: {
              page: 1,
              x: 100,
              y: 200,
            },
          },
        }),
      )
    })

    expect(onParticipantUpdate).toHaveBeenCalledOnce()
    const update = onParticipantUpdate.mock.calls[0][0]
    expect(update.event).toBe("cursor_moved")
    expect(update.user_id).toBe("other-user")
    expect(update.cursor_position?.x).toBe(100)
  })

  it("should disconnect on unmount", async () => {
    const { result, unmount } = renderHook(() =>
      useSpreadsheetCollaboration({
        wsUrl: "ws://localhost:8004/ws/{session_id}",
        userId: "me",
        username: "Me",
      }),
    )

    await act(async () => {
      await result.current.connect()
    })
    await act(async () => {
      wsHelper.simulateOpen()
    })

    unmount()

    expect(wsHelper.mockWs.close).toHaveBeenCalled()
  })

  it("should disconnect cleanly via disconnect()", async () => {
    const { result } = renderHook(() =>
      useSpreadsheetCollaboration({
        wsUrl: "ws://localhost:8004/ws/{session_id}",
        userId: "me",
        username: "Me",
      }),
    )

    await act(async () => {
      await result.current.connect()
    })
    await act(async () => {
      wsHelper.simulateOpen()
    })

    await act(async () => {
      result.current.disconnect()
    })

    expect(result.current.connectionState).toBe("disconnected")
    expect(wsHelper.mockWs.close).toHaveBeenCalled()
  })

  it("should send cursor events", async () => {
    const { result } = renderHook(() =>
      useSpreadsheetCollaboration({
        wsUrl: "ws://localhost:8004/ws/{session_id}",
        userId: "me",
        username: "Me",
      }),
    )

    await act(async () => {
      await result.current.connect()
    })
    await act(async () => {
      wsHelper.simulateOpen()
    })

    await act(async () => {
      result.current.sendCursorEvent({
        event: "cursor_moved",
        user_id: "me",
        username: "Me",
        color: "#FF0000",
        cursor_position: {
          page: 1,
          x: 50,
          y: 75,
        },
      })
    })

    expect(wsHelper.mockWs.send).toHaveBeenCalled()
    const sent = JSON.parse(wsHelper.mockWs.send.mock.calls[0][0])
    expect(sent.type).toBe("participant_update")
    expect(sent.update.user_id).toBe("me")
  })

  it("should handle onSessionJoined with multiple participants", async () => {
    // Override fetch for this test only
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/join")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              session_id: "session-1",
              message: "Joined",
              participants: [
                { user_id: "me", username: "Me", color: "#FF0000" },
                { user_id: "alice", username: "Alice", color: "#00FF00" },
                { user_id: "bob", username: "Bob", color: "#0000FF" },
              ],
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ session_id: "session-1" }),
        })
      }),
    )

    const onSessionJoined = vi.fn()
    const { result } = renderHook(() =>
      useSpreadsheetCollaboration({
        wsUrl: "ws://localhost:8004/ws/{session_id}",
        userId: "me",
        username: "Me",
        onSessionJoined,
      }),
    )

    await act(async () => {
      await result.current.connect()
    })

    expect(onSessionJoined).toHaveBeenCalledOnce()
    const [participants, myUserId] = onSessionJoined.mock.calls[0]
    expect(participants).toHaveLength(3)
    expect(participants.map((p: { user_id: string }) => p.user_id)).toEqual(["me", "alice", "bob"])
    expect(myUserId).toBe("me")
  })
})
