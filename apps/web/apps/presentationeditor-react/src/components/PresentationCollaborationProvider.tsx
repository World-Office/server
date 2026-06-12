import { WebSocketManager, createCursorUpdate } from "@world-office/collaboration-client"
import type {
  PresentationOperation,
  PresentationStateData,
  ShapePayload,
} from "@world-office/collaboration-client"
import { useEffect, useRef } from "react"
import { presentationStore } from "../stores/PresentationStore"
import type { ShapeData, SlideLayout } from "../types/presentation"

const WS_URL = "ws://localhost:8004/ws/{session_id}"
const COAUTHORING_URL = "http://localhost:8004"

export function PresentationCollaborationProvider(): null {
  const managerRef = useRef<WebSocketManager | null>(null)

  useEffect(() => {
    const userId = `user-${Date.now()}`
    const username = "User"

    function handlePresentationOp(op: PresentationOperation): void {
      const { action, ...rest } = op
      presentationStore.applyRemoteOp(action, rest as Record<string, unknown>)
    }

    function handlePresentationState(state: PresentationStateData): void {
      const slides = state.slides.map((slide, index) => {
        const shapes: ShapeData[] = slide.order
          .map((shapeId) => slide.shapes[shapeId])
          .filter((s): s is ShapePayload => Boolean(s))
          .map((sp) => ({
            id: sp.id,
            type: sp.type as ShapeData["type"],
            x: sp.x,
            y: sp.y,
            width: sp.width,
            height: sp.height,
            rotation: sp.rotation,
            zIndex: sp.z_index,
            fillColor: sp.fill_color ?? undefined,
            strokeColor: sp.stroke_color ?? undefined,
            strokeWidth: sp.stroke_width ?? undefined,
            text: sp.text ?? undefined,
            fontSize: sp.font_size ?? undefined,
            fontColor: sp.font_color ?? undefined,
            chart: undefined,
            table: undefined,
            connector: undefined,
            gradientFill: undefined,
            shadow: undefined,
            imageData: sp.image_data
              ? { src: sp.image_data.src, width: sp.image_data.width, height: sp.image_data.height }
              : undefined,
            groupId: sp.group_id ?? undefined,
          }))
        return {
          id: `slide-${index}`,
          title: `Slide ${index + 1}`,
          layout: "blank" as SlideLayout,
          notes: "",
          shapes,
        }
      })
      presentationStore.setSlides(slides)
    }

    async function init(): Promise<void> {
      try {
        const createResp = await fetch(`${COAUTHORING_URL}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_id: "presentation-doc" }),
        })
        if (!createResp.ok) throw new Error("Failed to create session")
        const sessionData = (await createResp.json()) as { session_id: string }
        const sessionId = sessionData.session_id

        const joinResp = await fetch(`${COAUTHORING_URL}/sessions/${sessionId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, username }),
        })
        if (!joinResp.ok) throw new Error("Failed to join session")

        const url = WS_URL.replace("{session_id}", sessionId)
        const manager = new WebSocketManager({ url, userId, autoReconnect: true })

        manager.on("presentationOp", (op: PresentationOperation) => {
          handlePresentationOp(op)
        })
        manager.on("presentationState", (state: PresentationStateData) => {
          handlePresentationState(state)
        })

        manager.on("participantUpdate", (update) => {
          if (update.event === "cursor_moved" && update.cursor_position) {
            presentationStore.updateRemoteCursor(
              update.user_id,
              update.username,
              update.color,
              update.cursor_position.x,
              update.cursor_position.y,
              update.cursor_position.page,
            )
          }
        })

        manager.connect()
        managerRef.current = manager

        presentationStore.registerCursorSendCallback((page, x, y) => {
          const cursorUpdate = createCursorUpdate({
            session_id: sessionId,
            user_id: userId,
            username,
            color: "#4472C4",
            cursor_position: { page, x, y },
          })
          manager.sendCursorEvent(cursorUpdate)
        })

        presentationStore.registerMutationCallback(
          (action: string, data: Record<string, unknown>) => {
            const payload: Record<string, unknown> = { action, ...data }
            manager.sendPresentationOp(payload as unknown as PresentationOperation)
          },
        )
      } catch (err) {
        console.error("[CollaborationProvider] init failed:", err)
      }
    }

    init()

    return () => {
      managerRef.current?.disconnect()
      managerRef.current = null
    }
  }, [])

  return null
}
