/**
 * useCanvasCollaboration — WebSocket-based collaboration for CanvasEditor
 *
 * Bridges the CanvasEditor (which uses ModelOp operations) with the
 * coauthoring WebSocket service. Unlike the TipTap-based
 * DocumentCollaborationProvider (which uses EditOperation insert/delete),
 * this hook sends/receives ModelOpEnvelope messages that match the
 * Rust ModelOp struct in services/coauthoring-service/src/model_op.rs.
 *
 * Architecture:
 *   CanvasEditor (local edit) → onModelOp → hook sends ModelOp via WebSocket
 *   WebSocket receives ModelOp → hook calls editorRef.applyOp() →
 *   CanvasEditor re-renders pages
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  COAUTHORING_WS_URL,
} from "../lib/collaboration-config"
import type { CanvasEditorHandle } from "../components/CanvasEditor"

/** ModeOpEnvelope — matches the Rust struct in model_op.rs. */
export interface ModelOpEnvelope {
  /** Unique session ID from the coauthoring service. */
  session_id: string
  /** User who performed this operation. */
  user_id: string
  /** Monotonic revision number. */
  revision: number
  /** ISO-8601 timestamp. */
  timestamp: string
  /** The operation payload as JSON — applied via WASM apply_op. */
  payload: unknown
}

/** Connection states for the collaboration WebSocket. */
export type CollaborationState = "disabled" | "connecting" | "connected" | "disconnected" | "error"

export interface UseCanvasCollaborationOptions {
  /** Document session ID from the coauthoring service REST API. */
  sessionId?: string
  /** Current user ID. */
  userId?: string
  /** Current username (display name). */
  username?: string
  /** Ref to the CanvasEditor handle for sending remote ops. */
  editorRef: React.RefObject<CanvasEditorHandle | null>
  /** Called when a local ModelOp should be broadcast to peers. */
  onLocalModelOp?: (op: ModelOpEnvelope) => void
}

export interface UseCanvasCollaborationResult {
  /** Connection state. */
  state: CollaborationState
  /** Number of connected participants (excluding self). */
  participantCount: number
  /** Connect to the coauthoring service. */
  connect: (sessionId: string) => void
  /** Disconnect from the coauthoring service. */
  disconnect: () => void
  /** Send a local ModelOp to all peers. */
  sendModelOp: (payload: unknown) => void
}

/**
 * Hook that manages a WebSocket connection for CanvasEditor collaboration.
 * Returns connection controls and state.
 */
export function useCanvasCollaboration(
  options: UseCanvasCollaborationOptions,
): UseCanvasCollaborationResult {
  const { sessionId: initialSessionId, userId, username, editorRef, onLocalModelOp } = options

  const wsRef = useRef<WebSocket | null>(null)
  const [state, setState] = useState<CollaborationState>("disabled")
  const [participantCount, setParticipantCount] = useState(0)
  const sessionIdRef = useRef<string | undefined>(initialSessionId)
  const revisionRef = useRef(0)

  // ── Helper: send a JSON message ──
  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
      return true
    }
    return false
  }, [])

  // ── Handle incoming WebSocket messages ──
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>

        if (msg.type === "model_op") {
          // Remote ModelOp received — apply to CanvasEditor
          const envelope = msg.envelope as ModelOpEnvelope
          if (!envelope || !envelope.payload) return

          // Don't apply our own ops (echoed back)
          if (userId && envelope.user_id === userId) return

          // Apply remote operation to CanvasEditor
          editorRef.current?.applyOp(envelope.payload)

          // Update revision
          if (envelope.revision > revisionRef.current) {
            revisionRef.current = envelope.revision
          }
        } else if (msg.type === "participant_update") {
          const update = msg.update as { event: string; user_id: string }
          if (update) {
            setParticipantCount((prev) =>
              update.event === "joined" ? prev + 1 : Math.max(0, prev - 1),
            )
          }
        } else if (msg.type === "initial_state_msg") {
          const state = msg.state as { participants?: Array<unknown> }
          setParticipantCount(state?.participants?.length ?? 0)
        }
      } catch (err) {
        console.error("[useCanvasCollaboration] Failed to parse message:", err)
      }
    },
    [editorRef, userId],
  )

  // ── Connect to coauthoring service ──
  const connect = useCallback(
    (sessionId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return

      sessionIdRef.current = sessionId
      const wsUrl = COAUTHORING_WS_URL.replace("{session_id}", sessionId)
      revisionRef.current = 0

      try {
        setState("connecting")
        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          console.info("[useCanvasCollaboration] Connected to coauthoring service")
          setState("connected")

          // Send join event
          sendMessage({
            type: "join",
            user_id: userId,
            username: username ?? "Anonymous",
          })
        }

        ws.onmessage = handleMessage

        ws.onclose = (event) => {
          console.info("[useCanvasCollaboration] Disconnected:", event.reason)
          setState("disconnected")
          wsRef.current = null
        }

        ws.onerror = () => {
          console.error("[useCanvasCollaboration] WebSocket error")
          setState("error")
        }

        wsRef.current = ws
      } catch (err) {
        console.error("[useCanvasCollaboration] Failed to connect:", err)
        setState("error")
      }
    },
    [userId, username, handleMessage, sendMessage],
  )

  // ── Disconnect ──
  const disconnectFn = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect")
      wsRef.current = null
    }
    setState("disconnected")
  }, [])

  // ── Send a local ModelOp to peers ──
  const sendModelOp = useCallback(
    (payload: unknown) => {
      if (!sessionIdRef.current || !userId) return

      revisionRef.current += 1
      const envelope: ModelOpEnvelope = {
        session_id: sessionIdRef.current,
        user_id: userId,
        revision: revisionRef.current,
        timestamp: new Date().toISOString(),
        payload,
      }

      // Broadcast via WebSocket
      const sent = sendMessage({
        type: "model_op",
        envelope,
      })

      // Also fire the callback for local tracking
      onLocalModelOp?.(envelope)

      if (!sent) {
        console.warn("[useCanvasCollaboration] Cannot send: WebSocket not connected")
      }
    },
    [userId, sendMessage, onLocalModelOp],
  )

  // ── Connect if initial sessionId provided ──
  useEffect(() => {
    if (initialSessionId) {
      connect(initialSessionId)
    }
    return () => {
      disconnectFn()
    }
    // Only run on mount with an initial sessionId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    state,
    participantCount,
    connect,
    disconnect: disconnectFn,
    sendModelOp,
  }
}
