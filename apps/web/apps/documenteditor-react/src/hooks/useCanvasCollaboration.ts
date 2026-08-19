/**
 * useCanvasCollaboration — WebSocket-based collaboration for CanvasEditor
 *
 * Bridges the CanvasEditor (which uses ModelOp operations) with the
 * coauthoring WebSocket service. Handles the full three-step flow:
 *
 *   1. REST: POST /sessions  → create session with document_id
 *   2. REST: POST /sessions/{id}/join → register user, get assigned color
 *   3. WebSocket: connect to /ws/{session_id}?user_id=X&username=Y
 *
 * Operations are sent as WsMessage::DocumentOp (type: "document_op")
 * containing a ModelOpEnvelope payload. This matches the Rust protocol
 * defined in services/coauthoring-service/src/main.rs.
 *
 * Architecture:
 *   CanvasEditor (local edit) → onModelOp → hook sends DocumentOp via WS
 *   WS receives DocumentOp → hook calls editorRef.applyOp() → re-render
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { COAUTHORING_API_URL, COAUTHORING_WS_URL } from "../lib/collaboration-config"
import type { CanvasEditorHandle } from "../components/CanvasEditor"

// ── Types matching the Rust coauthoring protocol ─────────────────────

/** ModeOpEnvelope — wraps a ModelOp with session/user metadata. */
export interface ModelOpEnvelope {
  session_id: string
  user_id: string
  revision: number
  timestamp: string
  /** JSON payload applied via WASM apply_op. */
  payload: unknown
}

/** Cursor position as Path (mirrors Rust wo_common::Path). */
export interface CursorPosition {
  kind: string
  para?: number
  run?: number
  char?: number
  table?: number
  row?: number
  cell?: number
  sheet?: string
  col?: number
}

export interface RemoteCursor {
  userId: string
  username: string
  color: string
  anchor: CursorPosition
  focus?: CursorPosition | null
}

/** Connection states for the collaboration WebSocket. */
export type CollaborationState =
  | "disabled"
  | "creating-session"
  | "joining-session"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"

export interface UseCanvasCollaborationOptions {
  /** Ref to the CanvasEditor handle for remote op application. */
  editorRef: React.RefObject<CanvasEditorHandle | null>
  /** Current user ID (generated client-side if not provided). */
  userId?: string
  /** Current username (display name). */
  username?: string
  /** Document ID used to create collaboration sessions. */
  documentId?: string
  /** Pre-created session ID (skips REST creation). */
  sessionId?: string
  /** Called when a local ModelOp is sent to peers. */
  onLocalModelOp?: (op: ModelOpEnvelope) => void
}

export interface UseCanvasCollaborationResult {
  /** Current connection state. */
  state: CollaborationState
  /** Number of connected participants (excluding self). */
  participantCount: number
  /** Current session color (assigned by server on join). */
  sessionColor: string
  /** Error message if state is "error". */
  errorMessage: string | null
  /** Manually connect (auto-connects if documentId provided). */
  connect: () => Promise<void>
  /** Disconnect from the coauthoring service. */
  disconnect: () => void
  /** Send a local ModelOp to all peers. */
  sendModelOp: (payload: unknown) => void
  /** Send cursor/selection update to peers. */
  sendCursorUpdate: (anchor: CursorPosition, focus?: CursorPosition | null) => void
  /** Remote cursors from other participants (userId → cursor). */
  remoteCursors: Map<string, RemoteCursor>
}

// ── REST API helpers ────────────────────────────────────────────────

interface CreateSessionResponse {
  session_id: string
  document_id: string
  message: string
}

interface JoinSessionResponse {
  session_id: string
  participants: Array<{
    user_id: string
    username: string
    color: string
  }>
  message: string
}

async function createSession(
  apiUrl: string,
  documentId: string,
): Promise<CreateSessionResponse> {
  const res = await fetch(`${apiUrl}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: documentId }),
  })
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as CreateSessionResponse
}

async function joinSession(
  apiUrl: string,
  sessionId: string,
  userId: string,
  username: string,
): Promise<JoinSessionResponse> {
  const res = await fetch(`${apiUrl}/sessions/${sessionId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, username }),
  })
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as JoinSessionResponse
}

// ── Hook ────────────────────────────────────────────────────────────

export function useCanvasCollaboration(
  options: UseCanvasCollaborationOptions,
): UseCanvasCollaborationResult {
  const {
    editorRef,
    userId: propUserId,
    username: propUsername,
    documentId,
    sessionId: propSessionId,
    onLocalModelOp,
  } = options

  const wsRef = useRef<WebSocket | null>(null)
  const [state, setState] = useState<CollaborationState>("disabled")
  const [participantCount, setParticipantCount] = useState(0)
  const [sessionColor, setSessionColor] = useState("#E74C3C")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(
    () => new Map(),
  )
  const sessionIdRef = useRef<string | undefined>(propSessionId)
  const revisionRef = useRef(0)
  const apiUrlRef = useRef(COAUTHORING_API_URL)

  // Generate stable user ID (persisted across sessions)
  const userIdRef = useRef<string>(
    propUserId ??
      `user_${Math.random().toString(36).slice(2, 10)}`,
  )
  const usernameRef = useRef<string>(propUsername ?? "Anonymous")

  // ── Send a JSON message over WebSocket ──
  const sendMessage = useCallback((msg: Record<string, unknown>): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
      return true
    }
    return false
  }, [])

  // ── Reconnect logic ──
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptReconnect = useCallback(() => {
    if (reconnectRef.current) return // already scheduled
    const sid = sessionIdRef.current
    if (!sid) return

    reconnectRef.current = setTimeout(() => {
      reconnectRef.current = null
      const uid = userIdRef.current
      const uname = usernameRef.current
      const wsUrl = `${COAUTHORING_WS_URL.replace("{session_id}", sid)}?user_id=${uid}&username=${encodeURIComponent(uname)}`

      setState("connecting")
      try {
        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          setState("connected")
        }

        ws.onmessage = handleMessageRef.current

        ws.onclose = () => {
          setState("disconnected")
          wsRef.current = null
          // Auto-reconnect after delay
          attemptReconnect()
        }

        ws.onerror = () => {
          setState("error")
        }

        wsRef.current = ws
      } catch {
        setState("error")
      }
    }, 2000)
  }, [])

  // ── Handle incoming WebSocket messages ──
  // Stored in a ref to avoid stale closures in reconnect
  const handleMessageRef = useRef<(event: MessageEvent) => void>(() => {})

  const handleMessageImpl = useCallback(
    (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>

        switch (msg.type) {
          case "initial_state_msg": {
            // Server sent initial state with participant list
            const s = msg.state as { participants?: Array<Record<string, unknown>> }
            const participants = s?.participants ?? []
            setParticipantCount(participants.length)
            // Find our color
            const us = participants.find(
              (p) => p.user_id === userIdRef.current,
            )
            if (us?.color) {
              setSessionColor(us.color as string)
            }
            break
          }

          case "participant_update": {
            const update = msg.update as {
              event: string
              user_id: string
              color?: string
            }
            if (update) {
              setParticipantCount((prev) =>
                update.event === "joined"
                  ? prev + 1
                  : Math.max(0, prev - 1),
              )
              // If it's us joining, grab our color
              if (
                update.event === "joined" &&
                update.user_id === userIdRef.current &&
                update.color
              ) {
                setSessionColor(update.color)
              }
              // If a participant left, remove their cursor
              if (update.event === "left") {
                setRemoteCursors((prev) => {
                  const next = new Map(prev)
                  next.delete(update.user_id)
                  return next
                })
              }
            }
            break
          }

          case "document_op": {
            // Remote DocumentOp (ModelOp wrapper) received
            const envelope = msg.envelope as ModelOpEnvelope
            if (!envelope || !envelope.payload) break

            // Skip our own ops (echoed back by server)
            if (envelope.user_id === userIdRef.current) break

            // Apply remote operation to CanvasEditor
            editorRef.current?.applyOp(envelope.payload)

            // Track revision
            if (envelope.revision > revisionRef.current) {
              revisionRef.current = envelope.revision
            }
            break
          }

          case "edit": {
            // CRDT EditOperation — ignore for CanvasEditor (handled by DocumentCollaborationProvider)
            break
          }

          case "cursor_update": {
            const event = msg.event as {
              user_id: string
              anchor: CursorPosition
              focus?: CursorPosition | null
              username?: string
              color?: string
            } | undefined
            if (!event?.user_id || !event?.anchor) break

            // Skip our own cursor updates (echoed back by server)
            if (event.user_id === userIdRef.current) break

            setRemoteCursors((prev) => {
              const next = new Map(prev)
              const existing = next.get(event.user_id)
              next.set(event.user_id, {
                userId: event.user_id,
                username: event.username ?? existing?.username ?? "User",
                color: event.color ?? existing?.color ?? "#E74C3C",
                anchor: event.anchor,
                focus: event.focus ?? null,
              })
              return next
            })
            break
          }

          default:
            // Unknown message types are ignored
            break
        }
      } catch (err) {
        console.error("[useCanvasCollaboration] Failed to parse message:", err)
      }
    },
    [editorRef],
  )

  // Keep the ref updated so reconnect uses the latest handler
  handleMessageRef.current = handleMessageImpl

  // ── Connect to coauthoring service ──
  const connect = useCallback(async () => {
    // Already connected
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const apiUrl = apiUrlRef.current
    const uid = userIdRef.current
    const uname = usernameRef.current

    try {
      let sid = sessionIdRef.current

      // Step 1: Create session if we don't have one
      if (!sid && documentId) {
        setState("creating-session")
        const created = await createSession(apiUrl, documentId)
        sid = created.session_id
        sessionIdRef.current = sid
      }

      if (!sid) {
        setErrorMessage("No session ID or document ID provided")
        setState("error")
        return
      }

      // Step 2: Join session via REST API
      setState("joining-session")
      const joined = await joinSession(apiUrl, sid, uid, uname)
      if (joined.participants.length > 0) {
        setParticipantCount(joined.participants.length)
        const us = joined.participants.find((p) => p.user_id === uid)
        if (us?.color) setSessionColor(us.color)
      }

      // Step 3: Connect WebSocket
      setState("connecting")
      const wsUrl = `${COAUTHORING_WS_URL.replace("{session_id}", sid)}?user_id=${uid}&username=${encodeURIComponent(uname)}`

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setState("connected")
      }

      ws.onmessage = handleMessageRef.current

      ws.onclose = () => {
        setState("disconnected")
        wsRef.current = null
        attemptReconnect()
      }

      ws.onerror = () => {
        setErrorMessage("WebSocket connection error")
        setState("error")
      }

      wsRef.current = ws
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMessage(msg)
      setState("error")
    }
  }, [documentId, attemptReconnect])

  // ── Disconnect ──
  const disconnectFn = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current)
      reconnectRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect")
      wsRef.current = null
    }
    setState("disconnected")
    setParticipantCount(0)
  }, [])

  // ── Send a local ModelOp to peers ──
  const sendModelOp = useCallback(
    (payload: unknown) => {
      const sid = sessionIdRef.current
      if (!sid) return

      revisionRef.current += 1
      const envelope: ModelOpEnvelope = {
        session_id: sid,
        user_id: userIdRef.current,
        revision: revisionRef.current,
        timestamp: new Date().toISOString(),
        payload,
      }

      // Broadcast as WsMessage::DocumentOp
      sendMessage({
        type: "document_op",
        envelope,
      })

      onLocalModelOp?.(envelope)
    },
    [sendMessage, onLocalModelOp],
  )

  // ── Send cursor/selection update to peers ──
  const sendCursorUpdate = useCallback(
    (anchor: CursorPosition, focus?: CursorPosition | null) => {
      sendMessage({
        type: "cursor_update",
        event: {
          user_id: userIdRef.current,
          anchor,
          focus: focus ?? undefined,
        },
      })
    },
    [sendMessage],
  )

  // ── Auto-connect on mount when documentId provided ──
  useEffect(() => {
    if (documentId || propSessionId) {
      void connect()
    }
    return () => {
      disconnectFn()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
      }
    }
  }, [])

  return {
    state,
    participantCount,
    sessionColor,
    errorMessage,
    connect,
    disconnect: disconnectFn,
    sendModelOp,
    sendCursorUpdate,
    remoteCursors,
  }
}
