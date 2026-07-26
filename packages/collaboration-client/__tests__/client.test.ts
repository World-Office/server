import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WebSocketManager, type WebSocketManagerEvents } from "../src/client"

/** Polyfill CloseEvent for Node.js test environment. */
class CloseEvent extends Event {
  code: number
  reason: string
  wasClean: boolean
  constructor(type: string, eventInit?: { code?: number; reason?: string; wasClean?: boolean }) {
    super(type)
    this.code = eventInit?.code ?? 0
    this.reason = eventInit?.reason ?? ""
    this.wasClean = eventInit?.wasClean ?? false
  }
}

/**
 * Helper: create a mock WebSocket that simulates server behavior.
 * Call `serverSend(json)` to simulate a message from the server.
 */
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
    simulateError() {
      onerror?.(new Event("error"))
    },
  }
}

describe("WebSocketManager", () => {
  let manager: WebSocketManager
  let wsHelper: ReturnType<typeof createMockWebSocket>

  beforeEach(() => {
    vi.stubGlobal(
      "WebSocket",
      vi.fn().mockImplementation(() => {
        wsHelper = createMockWebSocket()
        return wsHelper.mockWs
      }),
    )
    manager = new WebSocketManager({ url: "ws://localhost:8004/ws/test-session", userId: "user-1" })
  })

  afterEach(() => {
    manager.disconnect()
    vi.restoreAllMocks()
  })

  describe("connect", () => {
    it("should create a WebSocket and call onOpen callback", async () => {
      const onOpen = vi.fn()
      manager.on("open", onOpen)
      manager.connect()
      wsHelper.simulateOpen()

      expect(onOpen).toHaveBeenCalledOnce()
    })

    it("should call onClose callback on disconnect", async () => {
      const onClose = vi.fn()
      manager.on("close", onClose)
      manager.connect()
      wsHelper.simulateOpen()
      wsHelper.simulateClose()

      expect(onClose).toHaveBeenCalledOnce()
    })

    it("should call onError callback on error", async () => {
      const onError = vi.fn()
      manager.on("error", onError)
      manager.connect()
      wsHelper.simulateError()

      expect(onError).toHaveBeenCalledOnce()
    })
  })

  describe("send", () => {
    it("should serialize and send an EditOperation", () => {
      manager.connect()
      wsHelper.simulateOpen()

      manager.sendInsert(5, "Hello")

      const sent = JSON.parse(wsHelper.mockWs.send.mock.calls[0][0])
      expect(sent.type).toBe("insert")
      expect(sent.position).toBe(5)
      expect(sent.content).toBe("Hello")
      expect(sent.user_id).toBe("user-1")
      expect(sent.session_id).toBe("test-session")
    })

    it("should send a delete operation", () => {
      manager.connect()
      wsHelper.simulateOpen()

      manager.sendDelete(3, 2)

      const sent = JSON.parse(wsHelper.mockWs.send.mock.calls[0][0])
      expect(sent.type).toBe("delete")
      expect(sent.position).toBe(3)
      expect(sent.length).toBe(2)
    })

    it("should queue messages when not connected", () => {
      manager.sendInsert(0, "queued")
      expect(wsHelper.mockWs.send).not.toHaveBeenCalled()

      manager.connect()
      wsHelper.simulateOpen()

      expect(wsHelper.mockWs.send).toHaveBeenCalledOnce()
      const sent = JSON.parse(wsHelper.mockWs.send.mock.calls[0][0])
      expect(sent.content).toBe("queued")
    })
  })

  describe("receive", () => {
    it("should emit 'operation' for valid remote messages", () => {
      const onOp = vi.fn()
      manager.on("operation", onOp)
      manager.connect()
      wsHelper.simulateOpen()

      wsHelper.simulateMessage(
        JSON.stringify({
          type: "edit",
          operation: {
            session_id: "test-session",
            user_id: "user-2",
            revision: 0,
            type: "insert",
            position: 0,
            length: 0,
            content: "remote",
            timestamp: "2026-04-18T00:00:00+00:00",
          },
        }),
      )

      expect(onOp).toHaveBeenCalledOnce()
      expect(onOp.mock.calls[0][0].type).toBe("insert")
      expect(onOp.mock.calls[0][0].user_id).toBe("user-2")
    })

    it("should not emit 'operation' for own messages", () => {
      const onOp = vi.fn()
      manager.on("operation", onOp)
      manager.connect()
      wsHelper.simulateOpen()

      wsHelper.simulateMessage(
        JSON.stringify({
          type: "edit",
          operation: {
            session_id: "test-session",
            user_id: "user-1",
            revision: 0,
            type: "insert",
            position: 0,
            length: 0,
            content: "own",
            timestamp: "2026-04-18T00:00:00+00:00",
          },
        }),
      )

      expect(onOp).not.toHaveBeenCalled()
    })

    it("should ignore invalid messages", () => {
      const onOp = vi.fn()
      manager.on("operation", onOp)
      manager.connect()
      wsHelper.simulateOpen()

      wsHelper.simulateMessage("not json")
      wsHelper.simulateMessage('{"type": "unknown"}')

      expect(onOp).not.toHaveBeenCalled()
    })
  })

  describe("disconnect", () => {
    it("should close the WebSocket", () => {
      manager.connect()
      wsHelper.simulateOpen()
      manager.disconnect()

      expect(wsHelper.mockWs.close).toHaveBeenCalled()
    })

    it("should be idempotent", () => {
      manager.disconnect()
      manager.disconnect()
      // No error thrown
    })
  })

  describe("state", () => {
    it("should report connection state", () => {
      expect(manager.state).toBe("disconnected")
      manager.connect()
      expect(manager.state).toBe("connecting")
      wsHelper.simulateOpen()
      expect(manager.state).toBe("connected")
      wsHelper.simulateClose()
      expect(manager.state).toBe("disconnected")
    })
  })
})
