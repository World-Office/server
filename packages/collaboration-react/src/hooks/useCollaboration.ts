import { useCallback, useEffect, useRef, useState } from "react"
import {
  WebSocketManager,
  type ConnectionState,
  type EditOperation,
  type ParticipantUpdate,
  type InitialState,
  type CommentEventData,
  createSelectionUpdate,
  type Selection,
} from "@world-office/collaboration-client"
import { AuthClient } from "@world-office/collaboration-client"
import type { CollaborationStore } from "@world-office/editor-stores"

export interface UseCollaborationOptions {
  wsUrl: string
  userId: string
  username: string
  collaborationStore: CollaborationStore | null
  /** Pre-created session ID from storage-service. */
  sessionId?: string
  /** REST API base URL for session-service. */
  sessionServiceUrl?: string
  /** REST API base URL for coauthoring-service. */
  coauthoringServiceUrl?: string
  onRemoteOperation?: (op: EditOperation) => void
  onParticipantUpdate?: (update: ParticipantUpdate) => void
  onInitialState?: (state: InitialState) => void
  onCommentEvent?: (data: CommentEventData) => void
}

export interface UseCollaborationResult {
  connectionState: ConnectionState
  connect: () => void
  disconnect: () => void
  sendInsert: (position: number, text: string) => void
  sendDelete: (position: number, length: number) => void
  sendParticipantUpdate: (update: ParticipantUpdate) => void
  sendSelectionUpdate: (selection: Selection) => void
  sendCommentEvent: (data: CommentEventData) => void
}

export function useCollaboration(options: UseCollaborationOptions): UseCollaborationResult {
  const {
    wsUrl,
    userId,
    username,
    collaborationStore,
    sessionId: preCreatedSessionId,
    sessionServiceUrl = "http://localhost:8001",
    coauthoringServiceUrl = "http://localhost:8004",
    onRemoteOperation,
    onParticipantUpdate,
    onInitialState,
    onCommentEvent,
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
          collaborationStore?.setConnectionStatus(state)
        })

        manager.on("open", () => {
          collaborationStore?.setConnectionStatus("connected")
        })

        manager.on("close", () => {
          collaborationStore?.setConnectionStatus("disconnected")
        })

        manager.on("operation", (op: EditOperation) => {
          onRemoteOperation?.(op)
        })

        manager.on("participantUpdate", (update: ParticipantUpdate) => {
          if (update.event === "joined") {
            collaborationStore?.addUser({
              id: update.user_id,
              name: update.username,
              color: update.color,
              isCurrentUser: false,
            })
          } else if (update.event === "left") {
            collaborationStore?.removeUser(update.user_id)
          } else if (update.event === "cursor_moved" && update.cursor_position) {
            collaborationStore?.updateRemoteCursor(update.user_id, {
              page: update.cursor_position.page,
              x: update.cursor_position.x,
              y: update.cursor_position.y,
            })
          }
          onParticipantUpdate?.(update)
        })

        manager.on("initialState", (state: InitialState) => {
          for (const participant of state.participants) {
            if (participant.user_id === userId) continue
            collaborationStore?.addUser({
              id: participant.user_id,
              name: participant.username,
              color: participant.color,
              isCurrentUser: false,
            })
            if (participant.cursor_position) {
              collaborationStore?.updateRemoteCursor(participant.user_id, {
                page: participant.cursor_position.page,
                x: participant.cursor_position.x,
                y: participant.cursor_position.y,
              })
            }
          }
          onInitialState?.(state)
        })

        manager.on("commentEvent", (data: CommentEventData) => {
          if (data.type === "added") {
            if (data.parent_id) {
              // Reply to an existing parent comment
              collaborationStore?.addReply(data.parent_id, {
                id: data.comment_id,
                userId: data.author_id,
                userName: data.author_name,
                text: data.text,
                timestamp: Date.parse(data.created_at),
                resolved: data.resolved,
                replies: [],
              })
            } else {
              // New top-level comment
              collaborationStore?.addComment({
                id: data.comment_id,
                userId: data.author_id,
                userName: data.author_name,
                text: data.text,
                timestamp: Date.parse(data.created_at),
                resolved: data.resolved,
                replies: [],
              })
            }
          } else if (data.type === "resolved") {
            collaborationStore?.resolveComment(data.comment_id)
          }
          onCommentEvent?.(data)
        })

        managerRef.current = manager
        tokenRef.current = token
      }
      return managerRef.current
    },
    [wsUrl, userId, collaborationStore, onRemoteOperation, onParticipantUpdate, onInitialState],
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
      console.error("[useCollaboration] connect failed:", err)
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

  const sendInsert = useCallback((position: number, text: string) => {
    managerRef.current?.sendInsert(position, text)
  }, [])

  const sendDelete = useCallback((position: number, length: number) => {
    managerRef.current?.sendDelete(position, length)
  }, [])

  const sendSelectionUpdate = useCallback((selection: Selection) => {
    const manager = managerRef.current
    if (!manager) return

    const update = createSelectionUpdate({
      session_id: "", // Will be derived from session context in future
      user_id: userId,
      username: username,
      color: "", // Will be looked up in future
      selection,
    })
    manager.sendParticipantUpdate(update)
  }, [userId, username])

  const sendParticipantUpdate = useCallback((update: ParticipantUpdate) => {
    managerRef.current?.sendParticipantUpdate(update)
  }, [])

  const sendCommentEvent = useCallback((data: CommentEventData) => {
    managerRef.current?.sendCommentEvent(data)
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
    sendInsert,
    sendDelete,
    sendParticipantUpdate,
    sendSelectionUpdate,
    sendCommentEvent,
  }
}