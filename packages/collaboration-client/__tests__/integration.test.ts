import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthClient } from "../src/auth"
import { WebSocketManager } from "../src/client"
import { createDeleteOp, createInsertOp, isRemoteMessage, parseMessage } from "../src/protocol"

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
 * Full lifecycle test: auth → connect → send → receive → disconnect.
 * Uses mock WebSocket + mock fetch.
 */
describe("Integration: full collaboration lifecycle", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let wsHelper: {
    mockWs: {
      readyState: number
      send: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
      addEventListener: ReturnType<typeof vi.fn>
      removeEventListener: ReturnType<typeof vi.fn>
    }
    simulateOpen: () => void
    simulateMessage: (data: string) => void
    simulateClose: (code?: number, reason?: string) => void
  }

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal(
      "WebSocket",
      vi.fn().mockImplementation(() => {
        wsHelper = createMockWebSocket()
        return wsHelper.mockWs
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it("should authenticate, connect, exchange messages, and disconnect", async () => {
    // 1. Authenticate
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session_id: "sess-integration",
        access_token: "tok-123",
        refresh_token: "ref-456",
        expires_in: 86400,
      }),
    })

    const auth = new AuthClient({ baseUrl: "http://localhost:8005" })
    const session = await auth.createSession({ userId: "alice", username: "Alice" })

    expect(session.sessionId).toBe("sess-integration")
    expect(auth.hasToken()).toBe(true)

    // 2. Connect WebSocket
    const receivedOps: unknown[] = []
    const ws = new WebSocketManager({
      url: "ws://localhost:8004/ws/sess-integration",
      userId: "alice",
      autoReconnect: false,
    })
    ws.on("operation", (op) => receivedOps.push(op))

    ws.connect()
    wsHelper.simulateOpen()
    expect(ws.state).toBe("connected")

    // 3. Send an insert
    ws.sendInsert(0, "Hello from Alice")
    const sent = JSON.parse(wsHelper.mockWs.send.mock.calls[0][0])
    expect(sent.type).toBe("insert")
    expect(sent.content).toBe("Hello from Alice")
    expect(sent.session_id).toBe("sess-integration")

    // 4. Receive a remote operation
    wsHelper.simulateMessage(
      JSON.stringify({
        type: "edit",
        operation: {
          session_id: "sess-integration",
          user_id: "bob",
          revision: 0,
          type: "insert",
          position: 15,
          length: 0,
          content: "Hi from Bob",
          timestamp: "2026-04-18T00:00:00+00:00",
        },
      }),
    )

    expect(receivedOps).toHaveLength(1)
    const received = receivedOps[0] as { type: string; user_id: string; content: string }
    expect(received.type).toBe("insert")
    expect(received.user_id).toBe("bob")
    expect(received.content).toBe("Hi from Bob")

    // 5. Disconnect
    ws.disconnect()
    expect(ws.state).toBe("disconnected")
  })
})
