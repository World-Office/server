import {
  type ConnectionState,
  type PresentationOperation,
  type PresentationStateData,
  WebSocketManager,
} from "@world-office/collaboration-client"
import { AuthClient } from "@world-office/collaboration-client"
import { useCallback, useEffect, useRef, useState } from "react"

export interface UsePresentationCollaborationOptions {
  wsUrl: string
  userId: string
  username: string
  sessionId?: string
  sessionServiceUrl?: string
  coauthoringServiceUrl?: string
  onPresentationOp?: (op: PresentationOperation, userId: string) => void
  onPresentationState?: (state: PresentationStateData) => void
}

export interface UsePresentationCollaborationResult {
  connectionState: ConnectionState
  connect: () => void
  disconnect: () => void
  sendPresentationOp: (op: PresentationOperation) => void
}

export function usePresentationCollaboration(
  options: UsePresentationCollaborationOptions,
): UsePresentationCollaborationResult {
  const {
    wsUrl,
    userId,
    username,
    sessionId: preCreatedSessionId,
    sessionServiceUrl = "http://localhost:8001",
    coauthoringServiceUrl = "http://localhost:8004",
    onPresentationOp,
    onPresentationState,
  } = options

  const managerRef = useRef<WebSocketManager | null>(null)
  const tokenRef = useRef<string | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected")

  const getOrCreateManager = useCallback(
    (resolvedSessionId: string, token: string): WebSocketManager => {
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
          onPresentationOp?.(op, opUserId)
        })

        manager.on("presentationState", (state: PresentationStateData) => {
          onPresentationState?.(state)
        })

        managerRef.current = manager
        tokenRef.current = token
      }
      return managerRef.current
    },
    [wsUrl, userId, onPresentationOp, onPresentationState],
  )

  const connect = useCallback(async () => {
    try {
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

      const authClient = new AuthClient({ baseUrl: sessionServiceUrl })
      const { accessToken } = await authClient.createSession({ userId, username })

      await fetch(`${coauthoringServiceUrl}/sessions/${resolvedSessionId}/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId, username }),
      })

      const manager = getOrCreateManager(resolvedSessionId, accessToken)
      manager.connect(accessToken)
    } catch (err) {
      console.error("[usePresentationCollaboration] connect failed:", err)
    }
  }, [
    preCreatedSessionId,
    userId,
    username,
    sessionServiceUrl,
    coauthoringServiceUrl,
    getOrCreateManager,
  ])

  const disconnect = useCallback(() => {
    managerRef.current?.disconnect()
    managerRef.current = null
    tokenRef.current = null
  }, [])

  const sendPresentationOp = useCallback((op: PresentationOperation) => {
    managerRef.current?.sendPresentationOp(op)
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
  }
}
