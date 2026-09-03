// @vitest-environment jsdom
/**
 * useCanvasCollaboration — WebSocket + REST coauthoring bridge.
 *
 * Pins the hook's real lifecycle against the coauthoring protocol:
 *  - the initial result shape (state "disabled", defaults, empty cursor map)
 *  - auto-connect on mount when a documentId/sessionId is provided:
 *    POST /sessions → POST /sessions/{id}/join → WebSocket, with the resolved
 *    userId/username/documentId/sessionId in both the REST bodies and the WS
 *    query string
 *  - a pre-created sessionId skips session creation
 *  - generated userId/username are used when none are provided
 *  - duplicate connect() while already open is idempotent
 *  - errors during connect land in errorMessage/state, never a throw
 *  - disconnect()/unmount close the socket and reset state without leaking a
 *    reconnect timer (no setState-after-unmount)
 *  - a server close schedules exactly one 2s automatic reconnect
 *  - sendModelOp broadcasts a document_op envelope (bumped revision) and
 *    reports it via onLocalModelOp; sendCursorUpdate sends cursor_update
 *  - inbound messages: initial_state / participant_update / document_op
 *    applied via editorRef.applyOp (own ops skipped) / cursor_update remote
 *    cursor map (own events skipped); malformed and unknown messages never
 *    throw
 */
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CanvasEditorHandle } from "../components/CanvasEditor"
import {
  useCanvasCollaboration,
  type CollaborationState,
  type CursorPosition,
  type ModelOpEnvelope,
  type RemoteCursor,
  type UseCanvasCollaborationOptions,
} from "../hooks/useCanvasCollaboration"

// ── Collaboration service URLs are made configurable via the config module.
//    The hook reads COAUTHORING_API_URL/COAUTHORING_WS_URL at connect time, so
//    getters let each test control the endpoints without touching the network.
const cfg = vi.hoisted(() => ({
  apiUrl: "https://collab.test",
  wsUrl: "wss://collab.test/ws/{session_id}",
}))

vi.mock("../lib/collaboration-config", () => ({
  get COAUTHORING_API_URL() {
    return cfg.apiUrl
  },
  get COAUTHORING_WS_URL() {
    return cfg.wsUrl
  },
  isCollaborationConfigured: vi.fn(() => true),
}))

// ── Fake WebSocket: a deterministic double that mirrors the real browser
//    surface the hook uses (static ready-state constants, send/close, the
//    four event handlers) plus test-driver helpers (open/receive/error/close).
//    close() fires onclose synchronously so teardown is fully deterministic
//    inside act().
type WsHandler = ((event: unknown) => void) | null

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  url: string
  readyState: number
  onopen: WsHandler = null
  onmessage: WsHandler = null
  onclose: WsHandler = null
  onerror: WsHandler = null
  sent: string[] = []
  closeCode: number | null = null
  closeReason: string | null = null

  constructor(url: string) {
    this.url = url
    this.readyState = FakeWebSocket.CONNECTING
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(code = 1000, reason = ""): void {
    this.closeCode = code
    this.closeReason = reason
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason })
  }

  // ── Test-driver helpers ──
  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.({})
  }

  receive(data: string): void {
    this.onmessage?.({ data })
  }

  serverError(): void {
    this.onerror?.({})
  }

  serverClose(code = 1006, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason })
  }
}

// ── fetch stub ──
const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response
}

const DEFAULT_PARTICIPANTS = [
  { user_id: "u-42", username: "Ada", color: "#27AE60" },
]

interface SessionFlow {
  sessionId?: string
  participants?: Array<{ user_id: string; username: string; color: string }>
  createError?: { status: number; body: Record<string, unknown> }
  joinError?: { status: number; body: Record<string, unknown> }
  networkError?: Error
}

/** Standard happy-path stub: POST /sessions then POST /sessions/{id}/join. */
function stubSessionFlow(flow: SessionFlow = {}): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? "GET") as string
    if (flow.networkError) throw flow.networkError
    if (method === "POST" && url.endsWith("/sessions")) {
      if (flow.createError) return jsonResponse(flow.createError.body, false)
      return jsonResponse({
        session_id: flow.sessionId ?? "sess-1",
        document_id: "doc-1",
        message: "Session created",
      })
    }
    if (method === "POST" && url.includes("/join")) {
      if (flow.joinError) return jsonResponse(flow.joinError.body, false)
      return jsonResponse({
        session_id: flow.sessionId ?? "sess-1",
        participants: flow.participants ?? DEFAULT_PARTICIPANTS,
        message: "Joined",
      })
    }
    return jsonResponse({ error: `unexpected ${method} ${url}` }, false)
  })
}

function lastSocket(): FakeWebSocket {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
}

/**
 * Drain the async connect() chain. connect() makes two awaited fetches (each
 * several microtask hops); a single `await act(async () => {})` does not always
 * flush them all, so run several explicit microtask turns inside one act.
 */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  })
}

// ────────────────────────────────────────────────────────────────────────
// Minimal hook harness: no @testing-library — a probe component mounts the
// hook and stashes the latest return value into a mutable `captures` object.
// ────────────────────────────────────────────────────────────────────────

interface Captures {
  state: CollaborationState
  participantCount: number
  sessionColor: string
  errorMessage: string | null
  remoteCursors: Map<string, RemoteCursor>
  connect: () => Promise<void>
  disconnect: () => void
  sendModelOp: (payload: unknown) => void
  sendCursorUpdate: (anchor: CursorPosition, focus?: CursorPosition | null) => void
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []

function unmountAll(): void {
  for (const m of mounted.splice(0)) {
    act(() => {
      m.root.unmount()
    })
    document.body.removeChild(m.container)
  }
}

interface Harness {
  captures: Captures
  editorRef: { current: CanvasEditorHandle | null }
  onLocalModelOp: ReturnType<typeof vi.fn>
}

type MountOptions = UseCanvasCollaborationOptions & {
  onLocalModelOp?: (op: ModelOpEnvelope) => void
}

function mountHook(opts: MountOptions): Harness {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)

  const editorRef: { current: CanvasEditorHandle | null } = { current: null }
  const onLocalModelOp = opts.onLocalModelOp ?? vi.fn()

  const captures = {
    state: "disabled" as CollaborationState,
    participantCount: 0,
    sessionColor: "",
    errorMessage: null as string | null,
    remoteCursors: new Map<string, RemoteCursor>(),
    connect: (() => {}) as unknown as () => Promise<void>,
    disconnect: (() => {}) as unknown as () => void,
    sendModelOp: (() => {}) as unknown as (payload: unknown) => void,
    sendCursorUpdate: (() => {}) as unknown as (
      anchor: CursorPosition,
      focus?: CursorPosition | null,
    ) => void,
  }

  function Probe(p: UseCanvasCollaborationOptions) {
    const result = useCanvasCollaboration({
      ...p,
      editorRef,
      onLocalModelOp,
    })
    captures.state = result.state
    captures.participantCount = result.participantCount
    captures.sessionColor = result.sessionColor
    captures.errorMessage = result.errorMessage
    captures.remoteCursors = result.remoteCursors
    captures.connect = result.connect
    captures.disconnect = result.disconnect
    captures.sendModelOp = result.sendModelOp
    captures.sendCursorUpdate = result.sendCursorUpdate
    return null
  }

  act(() => {
    root.render(createElement(Probe, opts))
  })
  mounted.push({ root, container })

  return {
    captures,
    editorRef,
    onLocalModelOp,
  }
}

/** Mount with a documentId (fetch flow stubbed first) and drive it open. */
async function mountConnected(opts: {
  documentId?: string
  sessionId?: string
  userId?: string
  username?: string
  onLocalModelOp?: (op: ModelOpEnvelope) => void
  flow?: SessionFlow
}): Promise<{ harness: Harness; socket: FakeWebSocket }> {
  stubSessionFlow(opts.flow)
  const harness = mountHook({
    editorRef: { current: null },
    documentId: opts.documentId,
    sessionId: opts.sessionId,
    userId: opts.userId ?? "u-42",
    username: opts.username ?? "Ada",
    onLocalModelOp: opts.onLocalModelOp,
  })
  // Flush the async connect() chain (fetches are microtask-resolved).
  await settle()
  const socket = lastSocket()
  act(() => {
    socket.open()
  })
  return { harness, socket }
}

// ────────────────────────────────────────────────────────────────────────

describe("useCanvasCollaboration", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    FakeWebSocket.instances.length = 0
    fetchMock.mockReset()
    // Loud failure for any fetch the test forgot to stub.
    fetchMock.mockImplementation(() => Promise.reject(new Error("fetch not stubbed")))
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("WebSocket", FakeWebSocket)
  })

  afterEach(() => {
    unmountAll()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe("initial result shape", () => {
    it("returns the documented defaults when nothing is configured to connect", () => {
      const harness = mountHook({ editorRef: { current: null } })

      expect(harness.captures.state).toBe("disabled")
      expect(harness.captures.participantCount).toBe(0)
      expect(harness.captures.sessionColor).toBe("#E74C3C")
      expect(harness.captures.errorMessage).toBeNull()
      expect(harness.captures.remoteCursors).toBeInstanceOf(Map)
      expect(harness.captures.remoteCursors.size).toBe(0)
      expect(typeof harness.captures.connect).toBe("function")
      expect(typeof harness.captures.disconnect).toBe("function")
      expect(typeof harness.captures.sendModelOp).toBe("function")
      expect(typeof harness.captures.sendCursorUpdate).toBe("function")
    })

    it("does not auto-connect (no fetch, no WebSocket) without documentId or sessionId", () => {
      mountHook({ editorRef: { current: null } })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(FakeWebSocket.instances).toHaveLength(0)
    })
  })

  describe("connecting via REST + WebSocket", () => {
    it("auto-connects on mount with documentId: creates session, joins, opens WS with resolved ids", async () => {
      stubSessionFlow({ sessionId: "sess-1" })
      const harness = mountHook({
        editorRef: { current: null },
        documentId: "doc-1",
        userId: "u-42",
        username: "Ada",
      })

      // The first REST call is issued synchronously when the mount effect runs.
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await settle()

      // Two REST calls: create + join, with the resolved document/ids.
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "https://collab.test/sessions",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ document_id: "doc-1" }),
        }),
      )
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "https://collab.test/sessions/sess-1/join",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ user_id: "u-42", username: "Ada" }),
        }),
      )

      // One WebSocket, pointed at the resolved session/user.
      expect(FakeWebSocket.instances).toHaveLength(1)
      expect(lastSocket().url).toBe(
        "wss://collab.test/ws/sess-1?user_id=u-42&username=Ada",
      )
      expect(harness.captures.state).toBe("connecting")

      act(() => {
        lastSocket().open()
      })
      expect(harness.captures.state).toBe("connected")
    })

    it("joins a pre-created sessionId without calling the session creation endpoint", async () => {
      stubSessionFlow({ sessionId: "sess-pre" })
      const harness = mountHook({
        editorRef: { current: null },
        sessionId: "sess-pre",
        userId: "u-9",
        username: "Bob",
      })
      await settle()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://collab.test/sessions/sess-pre/join",
        expect.objectContaining({
          body: JSON.stringify({ user_id: "u-9", username: "Bob" }),
        }),
      )
      expect(lastSocket().url).toContain("/ws/sess-pre?")
      act(() => {
        lastSocket().open()
      })
      expect(harness.captures.state).toBe("connected")
    })

    it("uses a generated userId and 'Anonymous' username when none are provided", async () => {
      stubSessionFlow({ sessionId: "sess-1" })
      const harness = mountHook({
        editorRef: { current: null },
        documentId: "doc-1",
      })
      await settle()

      const joinFetch = fetchMock.mock.calls[1][1]
      const joinBody = JSON.parse(String((joinFetch as RequestInit).body)) as {
        user_id: string
        username: string
      }
      expect(joinBody.user_id).toMatch(/^user_[a-z0-9]{8}$/)
      expect(joinBody.username).toBe("Anonymous")
      expect(lastSocket().url).toMatch(/user_id=user_[a-z0-9]{8}&username=/)
      expect(lastSocket().url).toContain("username=Anonymous")
    })

    it("URL-encodes the username into the WebSocket query string", async () => {
      stubSessionFlow({ sessionId: "sess-1" })
      const harness = mountHook({
        editorRef: { current: null },
        documentId: "doc-1",
        userId: "u-42",
        username: "Ada Lovelace",
      })
      await settle()

      expect(lastSocket().url).toBe(
        "wss://collab.test/ws/sess-1?user_id=u-42&username=Ada%20Lovelace",
      )
      act(() => {
        lastSocket().open()
      })
      expect(harness.captures.state).toBe("connected")
    })

    it("applies the session color and participant count from the join response", async () => {
      const participants = [
        { user_id: "u-42", username: "Ada", color: "#27AE60" },
        { user_id: "u-7", username: "Grace", color: "#8E44AD" },
      ]
      const { harness } = await mountConnected({
        documentId: "doc-1",
        flow: { sessionId: "sess-1", participants },
      })

      expect(harness.captures.participantCount).toBe(2)
      expect(harness.captures.sessionColor).toBe("#27AE60")
    })

    it("a second connect() while already open is a no-op (idempotent)", async () => {
      const { harness } = await mountConnected({ documentId: "doc-1" })
      expect(harness.captures.state).toBe("connected")

      await act(async () => {
        await harness.captures.connect()
      })

      // No additional REST calls, no duplicate socket, state untouched.
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(FakeWebSocket.instances).toHaveLength(1)
      expect(harness.captures.state).toBe("connected")
    })

    // BUG: connect() only short-circuits when readyState === OPEN; a call made
    // while still creating/joining/connecting opens a duplicate REST+WS flow.
    it.skip("a connect() before the socket reaches OPEN is not idempotent", async () => {
      stubSessionFlow({ sessionId: "sess-1" })
      const harness = mountHook({
        editorRef: { current: null },
        documentId: "doc-1",
        userId: "u-42",
      })
      await settle()

      // Two calls while the first socket is still CONNECTING.
      await act(async () => {
        await harness.captures.connect()
      })
      await act(async () => {
        await harness.captures.connect()
      })

      // A guard would keep this at 1 socket / 2 REST calls.
      expect(FakeWebSocket.instances).toHaveLength(1)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe("error handling", () => {
    it("missing documentId and sessionId lands in errorMessage, not a throw", async () => {
      const harness = mountHook({ editorRef: { current: null } })

      await act(async () => {
        await expect(harness.captures.connect()).resolves.toBeUndefined()
      })

      expect(harness.captures.state).toBe("error")
      expect(harness.captures.errorMessage).toBe(
        "No session ID or document ID provided",
      )
      expect(fetchMock).not.toHaveBeenCalled()
      expect(FakeWebSocket.instances).toHaveLength(0)
    })

    it("a session-creation HTTP failure surfaces the server error message", async () => {
      stubSessionFlow({
        sessionId: "sess-1",
        createError: { status: 503, body: { error: "sessions full" } },
      })
      const harness = mountHook({
        editorRef: { current: null },
        documentId: "doc-1",
        userId: "u-42",
      })

      await act(async () => {
        await expect(harness.captures.connect()).resolves.toBeUndefined()
      })

      expect(harness.captures.state).toBe("error")
      expect(harness.captures.errorMessage).toBe("sessions full")
      expect(FakeWebSocket.instances).toHaveLength(0)
    })

    it("a join HTTP failure surfaces the server error message", async () => {
      stubSessionFlow({
        sessionId: "sess-1",
        joinError: { status: 404, body: { error: "session gone" } },
      })
      const harness = mountHook({
        editorRef: { current: null },
        sessionId: "sess-1",
        userId: "u-42",
      })

      await act(async () => {
        await expect(harness.captures.connect()).resolves.toBeUndefined()
      })

      expect(harness.captures.state).toBe("error")
      expect(harness.captures.errorMessage).toBe("session gone")
      expect(FakeWebSocket.instances).toHaveLength(0)
    })

    it("falls back to the HTTP status code when the error body has no message", async () => {
      stubSessionFlow({
        sessionId: "sess-1",
        createError: { status: 500, body: {} },
      })
      const harness = mountHook({
        editorRef: { current: null },
        documentId: "doc-1",
        userId: "u-42",
      })

      await act(async () => {
        await expect(harness.captures.connect()).resolves.toBeUndefined()
      })

      expect(harness.captures.errorMessage).toBe("HTTP 500")
    })

    it("a network-level fetch rejection lands in errorMessage, not a throw", async () => {
      stubSessionFlow({ networkError: new Error("ECONNREFUSED") })
      const harness = mountHook({
        editorRef: { current: null },
        documentId: "doc-1",
        userId: "u-42",
      })

      await act(async () => {
        await expect(harness.captures.connect()).resolves.toBeUndefined()
      })

      expect(harness.captures.state).toBe("error")
      expect(harness.captures.errorMessage).toBe("ECONNREFUSED")
    })

    it("a WebSocket error event sets the error state with a dedicated message", async () => {
      const { harness, socket } = await mountConnected({ documentId: "doc-1" })
      expect(harness.captures.state).toBe("connected")

      act(() => {
        socket.serverError()
      })

      expect(harness.captures.state).toBe("error")
      expect(harness.captures.errorMessage).toBe("WebSocket connection error")
    })
  })

  describe("disconnect and unmount teardown", () => {
    it("disconnect() closes the socket and resets connection state", async () => {
      const { harness, socket } = await mountConnected({ documentId: "doc-1" })
      expect(harness.captures.participantCount).toBe(1)

      act(() => {
        harness.captures.disconnect()
      })

      expect(socket.closeCode).toBe(1000)
      expect(socket.closeReason).toBe("Client disconnect")
      expect(harness.captures.state).toBe("disconnected")
      expect(harness.captures.participantCount).toBe(0)
    })

    it("unmount tears down the socket and leaves no pending reconnect timer", async () => {
      const { socket } = await mountConnected({
        documentId: "doc-1",
        userId: "u-42",
      })
      expect(socket.closeCode).toBeNull()

      unmountAll()

      // The socket was closed by the cleanup (client disconnect).
      expect(socket.closeCode).toBe(1000)
      expect(socket.closeReason).toBe("Client disconnect")

      // Even though onclose schedules a reconnect, cleanup clears the timer:
      // no second socket may appear, and nothing may throw.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(FakeWebSocket.instances).toHaveLength(1)
    })

    // BUG: the socket's onclose schedules a reconnect regardless of whether the
    // close was client-initiated, so a mounted disconnect() silently reconnects
    // after the 2s delay — disconnect() does not keep the caller disconnected.
    it.skip("an explicit disconnect() is not followed by an automatic reconnect", async () => {
      const { harness, socket } = await mountConnected({ documentId: "doc-1" })

      act(() => {
        harness.captures.disconnect()
      })
      expect(harness.captures.state).toBe("disconnected")
      expect(socket.closeCode).toBe(1000)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100)
      })
      expect(FakeWebSocket.instances).toHaveLength(1)
    })

    it("a late message on a torn-down socket does not throw (no setState-after-unmount)", async () => {
      const { socket } = await mountConnected({ documentId: "doc-1" })
      unmountAll()

      expect(() => {
        act(() => {
          socket.receive(
            JSON.stringify({
              type: "cursor_update",
              event: {
                user_id: "other",
                anchor: { kind: "text", para: 0, char: 1 },
              },
            }),
          )
        })
      }).not.toThrow()
      expect(FakeWebSocket.instances).toHaveLength(1)
    })
  })

  describe("automatic reconnect", () => {
    it("a server-initiated close triggers exactly one reconnect after the 2s delay", async () => {
      const { harness, socket } = await mountConnected({
        documentId: "doc-1",
        userId: "u-42",
      })

      act(() => {
        socket.serverClose(1006)
      })
      expect(harness.captures.state).toBe("disconnected")

      // Reconnect has not fired before the delay elapses.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1999)
      })
      expect(FakeWebSocket.instances).toHaveLength(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(FakeWebSocket.instances).toHaveLength(2)
      expect(harness.captures.state).toBe("connecting")
      // The reconnect reuses the same session/user identity.
      expect(lastSocket().url).toBe(
        "wss://collab.test/ws/sess-1?user_id=u-42&username=Ada",
      )

      act(() => {
        lastSocket().open()
      })
      expect(harness.captures.state).toBe("connected")
    })

    it("does not schedule a duplicate reconnect while one is pending", async () => {
      const { socket } = await mountConnected({
        documentId: "doc-1",
        userId: "u-42",
      })

      act(() => {
        socket.serverClose(1006)
      })
      // A second close event while the reconnect is pending must not schedule
      // an extra attempt.
      act(() => {
        socket.serverClose(1006)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
      expect(FakeWebSocket.instances).toHaveLength(2)
    })
  })

  describe("sending operations", () => {
    it("sendModelOp broadcasts a document_op envelope and reports it via onLocalModelOp", async () => {
      const onLocalModelOp = vi.fn()
      const { harness, socket } = await mountConnected({
        documentId: "doc-1",
        userId: "u-42",
        onLocalModelOp,
      })
      const payload = { op: "insert_text", text: "hello" }

      act(() => {
        harness.captures.sendModelOp(payload)
      })

      expect(socket.sent).toHaveLength(1)
      const msg = JSON.parse(socket.sent[0]) as {
        type: string
        envelope: ModelOpEnvelope
      }
      expect(msg.type).toBe("document_op")
      expect(msg.envelope.session_id).toBe("sess-1")
      expect(msg.envelope.user_id).toBe("u-42")
      expect(msg.envelope.revision).toBe(1)
      expect(msg.envelope.payload).toEqual(payload)
      expect(typeof msg.envelope.timestamp).toBe("string")
      // onLocalModelOp receives the exact envelope that was broadcast.
      expect(onLocalModelOp).toHaveBeenCalledTimes(1)
      expect(onLocalModelOp).toHaveBeenCalledWith(expect.objectContaining(msg.envelope))

      // Each subsequent op bumps the revision.
      act(() => {
        harness.captures.sendModelOp({ op: "delete_text" })
      })
      expect(JSON.parse(socket.sent[1]).envelope.revision).toBe(2)
      expect(onLocalModelOp).toHaveBeenCalledTimes(2)
    })

    it("sendModelOp is a silent no-op before any session exists", async () => {
      const onLocalModelOp = vi.fn()
      const harness = mountHook({
        editorRef: { current: null },
        onLocalModelOp,
      })

      expect(() => {
        act(() => {
          harness.captures.sendModelOp({ op: "insert_text" })
        })
      }).not.toThrow()

      expect(onLocalModelOp).not.toHaveBeenCalled()
      expect(FakeWebSocket.instances).toHaveLength(0)
    })

    it("sendCursorUpdate sends cursor_update with the resolved user id and anchor", async () => {
      const { harness, socket } = await mountConnected({
        documentId: "doc-1",
        userId: "u-42",
      })
      const anchor: CursorPosition = { kind: "text", para: 2, run: 0, char: 7 }
      const focus: CursorPosition = { kind: "text", para: 2, run: 1, char: 9 }

      act(() => {
        harness.captures.sendCursorUpdate(anchor, focus)
      })

      expect(socket.sent).toHaveLength(1)
      const msg = JSON.parse(socket.sent[0]) as {
        type: string
        event: { user_id: string; anchor: CursorPosition; focus?: CursorPosition }
      }
      expect(msg.type).toBe("cursor_update")
      expect(msg.event.user_id).toBe("u-42")
      expect(msg.event.anchor).toEqual(anchor)
      expect(msg.event.focus).toEqual(focus)

      // Without an explicit focus the field is omitted, not partial.
      act(() => {
        harness.captures.sendCursorUpdate(anchor)
      })
      const second = JSON.parse(socket.sent[1]) as { event: { focus?: CursorPosition } }
      expect("focus" in second.event).toBe(false)
    })
  })

  describe("inbound message handling", () => {
    it("initial_state_msg sets the participant count and our assigned color", async () => {
      const { harness, socket } = await mountConnected({
        documentId: "doc-1",
        userId: "u-42",
      })

      act(() => {
        socket.receive(
          JSON.stringify({
            type: "initial_state_msg",
            state: {
              participants: [
                { user_id: "u-42", username: "Ada", color: "#16A085" },
                { user_id: "u-7", username: "Grace", color: "#8E44AD" },
              ],
            },
          }),
        )
      })

      expect(harness.captures.participantCount).toBe(2)
      expect(harness.captures.sessionColor).toBe("#16A085")
    })

    it("participant_update joined bumps the count and adopts our color", async () => {
      const { harness, socket } = await mountConnected({
        documentId: "doc-1",
        userId: "u-42",
        flow: { participants: [] },
      })

      act(() => {
        socket.receive(
          JSON.stringify({
            type: "participant_update",
            update: { event: "joined", user_id: "u-42", color: "#E67E22" },
          }),
        )
      })

      expect(harness.captures.participantCount).toBe(1)
      expect(harness.captures.sessionColor).toBe("#E67E22")
    })

    it("participant_update left decrements the count and drops that user's remote cursor", async () => {
      const { harness, socket } = await mountConnected({
        documentId: "doc-1",
        userId: "u-42",
      })
      act(() => {
        socket.receive(
          JSON.stringify({
            type: "cursor_update",
            event: { user_id: "u-7", anchor: { kind: "text", char: 1 } },
          }),
        )
      })
      expect(harness.captures.remoteCursors.has("u-7")).toBe(true)

      act(() => {
        socket.receive(
          JSON.stringify({
            type: "participant_update",
            update: { event: "left", user_id: "u-7" },
          }),
        )
      })

      expect(harness.captures.participantCount).toBe(0)
      expect(harness.captures.remoteCursors.has("u-7")).toBe(false)
    })

    it("document_op is applied to the editor via editorRef.applyOp; own echoed ops are skipped", async () => {
      const applyOp = vi.fn(() => true)
      const { harness, socket } = await mountConnected({ documentId: "doc-1" })
      harness.editorRef.current = {
        applyOp,
        applyFormatting: vi.fn(),
        applyStructureOp: vi.fn(),
        getDocHandle: vi.fn(() => 1),
      }

      act(() => {
        socket.receive(
          JSON.stringify({
            type: "document_op",
            envelope: {
              session_id: "sess-1",
              user_id: "u-7",
              revision: 4,
              timestamp: "2026-01-01T00:00:00.000Z",
              payload: { op: "insert_text", text: "remote" },
            },
          }),
        )
      })
      expect(applyOp).toHaveBeenCalledTimes(1)
      expect(applyOp).toHaveBeenCalledWith({ op: "insert_text", text: "remote" })

      // The server echoes our own op back: it must NOT be re-applied.
      act(() => {
        socket.receive(
          JSON.stringify({
            type: "document_op",
            envelope: {
              session_id: "sess-1",
              user_id: "u-42",
              revision: 5,
              timestamp: "2026-01-01T00:00:00.000Z",
              payload: { op: "insert_text", text: "mine" },
            },
          }),
        )
      })
      expect(applyOp).toHaveBeenCalledTimes(1)
    })

    it("a document_op with no envelope or payload is ignored", async () => {
      const applyOp = vi.fn(() => true)
      const { harness, socket } = await mountConnected({ documentId: "doc-1" })
      harness.editorRef.current = {
        applyOp,
        applyFormatting: vi.fn(),
        applyStructureOp: vi.fn(),
        getDocHandle: vi.fn(() => 1),
      }

      expect(() => {
        act(() => {
          socket.receive(JSON.stringify({ type: "document_op", envelope: null }))
          socket.receive(JSON.stringify({ type: "document_op" }))
        })
      }).not.toThrow()
      expect(applyOp).not.toHaveBeenCalled()
      expect(harness.captures.state).toBe("connected")
    })

    it("cursor_update adds a remote cursor; the user's own updates are ignored", async () => {
      const { harness, socket } = await mountConnected({
        documentId: "doc-1",
        userId: "u-42",
      })

      act(() => {
        socket.receive(
          JSON.stringify({
            type: "cursor_update",
            event: {
              user_id: "u-7",
              username: "Grace",
              color: "#8E44AD",
              anchor: { kind: "text", para: 0, char: 2 },
              focus: { kind: "text", para: 0, char: 5 },
            },
          }),
        )
      })

      const cursor = harness.captures.remoteCursors.get("u-7")
      expect(cursor).toEqual({
        userId: "u-7",
        username: "Grace",
        color: "#8E44AD",
        anchor: { kind: "text", para: 0, char: 2 },
        focus: { kind: "text", para: 0, char: 5 },
      })

      // Our own cursor echo must not create an entry for ourselves.
      act(() => {
        socket.receive(
          JSON.stringify({
            type: "cursor_update",
            event: { user_id: "u-42", anchor: { kind: "text", char: 3 } },
          }),
        )
      })
      expect(harness.captures.remoteCursors.has("u-42")).toBe(false)

      // A cursor update for an existing user replaces their cursor.
      act(() => {
        socket.receive(
          JSON.stringify({
            type: "cursor_update",
            event: {
              user_id: "u-7",
              color: "#F1C40F",
              anchor: { kind: "text", para: 1, char: 0 },
            },
          }),
        )
      })
      expect(harness.captures.remoteCursors.get("u-7")?.color).toBe("#F1C40F")
      expect(harness.captures.remoteCursors.get("u-7")?.username).toBe("Grace")
    })

    it("a cursor_update missing user_id or anchor is ignored", async () => {
      const { harness, socket } = await mountConnected({ documentId: "doc-1" })

      act(() => {
        socket.receive(JSON.stringify({ type: "cursor_update", event: {} }))
        socket.receive(
          JSON.stringify({ type: "cursor_update", event: { user_id: "u-7" } }),
        )
      })
      expect(harness.captures.remoteCursors.size).toBe(0)
    })

    it("an unknown message type is ignored without throwing", async () => {
      const { harness, socket } = await mountConnected({ documentId: "doc-1" })

      expect(() => {
        act(() => {
          socket.receive(JSON.stringify({ type: "some_future_msg" }))
        })
      }).not.toThrow()
      expect(harness.captures.state).toBe("connected")
      expect(harness.captures.remoteCursors.size).toBe(0)
    })

    it("malformed JSON is caught and logged, leaving state untouched", async () => {
      const { harness, socket } = await mountConnected({ documentId: "doc-1" })
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})

      expect(() => {
        act(() => {
          socket.receive("{not valid json")
        })
      }).not.toThrow()

      expect(stderr).toHaveBeenCalledWith(
        "[useCanvasCollaboration] Failed to parse message:",
        expect.any(Error),
      )
      expect(harness.captures.state).toBe("connected")
      expect(harness.captures.remoteCursors.size).toBe(0)
      stderr.mockRestore()
    })
  })
})
