import {
  type ConnectionState,
  type ParticipantUpdate,
  type PresentationOperation,
  type PresentationStateData,
  WebSocketManager,
} from "@world-office/collaboration-client"
import { useCallback, useEffect, useRef, useState } from "react"

export interface UsePresentationCollaborationOptions {
  wsUrl: string
  userId: string
  username: string
  sessionId?: string
  coauthoringServiceUrl?: string
  onPresentationOp?: (op: PresentationOperation, userId: string) => void
  onPresentationState?: (state: PresentationStateData) => void
  onParticipantUpdate?: (update: ParticipantUpdate) => void
  onSessionJoined?: (participants: Array<{ user_id: string; username: string; color: string }>, myUserId: string) => void
}

export interface UsePresentationCollaborationResult {
  connectionState: ConnectionState
  connect: () => void
  disconnect: () => void
  sendPresentationOp: (op: PresentationOperation) => void
  sendCursorEvent: (update: ParticipantUpdate) => void
}

export function usePresentationCollaboration(
  options: UsePresentationCollaborationOptions,
): UsePresentationCollaborationResult {
  const {
    wsUrl,
    userId,
    username,
    sessionId: preCreatedSessionId,
    coauthoringServiceUrl = "http://localhost:8004",
  } = options

  // Use refs for callbacks to avoid stale closures in event handlers
  const callbacksRef = useRef({
    onPresentationOp: options.onPresentationOp,
    onPresentationState: options.onPresentationState,
    onParticipantUpdate: options.onParticipantUpdate,
    onSessionJoined: options.onSessionJoined,
  })
  callbacksRef.current = {
    onPresentationOp: options.onPresentationOp,
    onPresentationState: options.onPresentationState,
    onParticipantUpdate: options.onParticipantUpdate,
    onSessionJoined: options.onSessionJoined,
  }

  const managerRef = useRef<WebSocketManager | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected")

  const getOrCreateManager = useCallback(
    (resolvedSessionId: string): WebSocketManager => {
      const url = wsUrl.replace("{session_id}", resolvedSessionId)
      if (!managerRef.current || managerRef.current.state === "disconnected") {
        const manager = new WebSocketManager({
          url,
          userId,
          autoReconnect: true,
        })

        manager.on("stateChange", (state: ConnectionState) => {
          setConnectionState(state)
        })

        manager.on("presentationOp", (op: PresentationOperation, opUserId: string) => {
          callbacksRef.current.onPresentationOp?.(op, opUserId)
        })

        manager.on("presentationState", (state: PresentationStateData) => {
          callbacksRef.current.onPresentationState?.(state)
        })

        manager.on("participantUpdate", (update: ParticipantUpdate) => {
          callbacksRef.current.onParticipantUpdate?.(update)
        })

        managerRef.current = manager
      }
      return managerRef.current
    },
    [wsUrl, userId],
  )

  const connect = useCallback(async () => {
    try {
      // Disconnect any existing connection before reconnecting
      managerRef.current?.disconnect()
      managerRef.current = null

      let resolvedSessionId = preCreatedSessionId

      if (!resolvedSessionId) {
        const createResp = await fetch(`${coauthoringServiceUrl}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_id: "default-doc" }),
        })
        if (!createResp.ok) throw new Error("Failed to create session")
        const data = (await createResp.json()) as { session_id: string }
        resolvedSessionId = data.session_id
      }

      const joinResp = await fetch(`${coauthoringServiceUrl}/sessions/${resolvedSessionId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, username }),
      })
      if (!joinResp.ok) throw new Error("Failed to join session")

      const joinData = (await joinResp.json()) as {
        participants: Array<{ user_id: string; username: string; color: string }>
      }
      callbacksRef.current.onSessionJoined?.(joinData.participants ?? [], userId)

      const manager = getOrCreateManager(resolvedSessionId)
      manager.connect()
    } catch (err) {
      console.error("[usePresentationCollaboration] connect failed:", err)
    }
  }, [
    preCreatedSessionId,
    userId,
    username,
    coauthoringServiceUrl,
    getOrCreateManager,
  ])

  const disconnect = useCallback(() => {
    managerRef.current?.disconnect()
    managerRef.current = null
  }, [])

  const sendPresentationOp = useCallback((op: PresentationOperation) => {
    managerRef.current?.sendPresentationOp(op)
  }, [])

  const sendCursorEvent = useCallback((update: ParticipantUpdate) => {
    managerRef.current?.sendCursorEvent(update)
  }, [])

  useEffect(() => {
    return () => {
      managerRef.current?.disconnect()
      managerRef.current = null
    }
  }, [])

  return {
    connectionState,
    connect,
    disconnect,
    sendPresentationOp,
    sendCursorEvent,
  }
}
