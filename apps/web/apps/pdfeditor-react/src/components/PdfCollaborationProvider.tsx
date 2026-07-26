import type {
  EditOperation,
  ParticipantUpdate,
  PdfAnnotationOperation,
} from "@world-office/collaboration-client"
import { useCollaboration } from "@world-office/collaboration-react"
import { useCallback, useEffect } from "react"
import { collabSendRef, currentUser, pdfCollaborationStore } from "../lib/collaboration"
import { COAUTHORING_API_URL, COAUTHORING_WS_URL } from "../lib/collaboration-config"
import { pdfStore } from "../stores/PdfStore"

const SESSION_STORAGE_KEY = "pdf-collab-session"

function getOrCreateUser(): { id: string; name: string } {
  const stored = sessionStorage.getItem("pdf-collab-user")
  if (stored) {
    try {
      return JSON.parse(stored) as { id: string; name: string }
    } catch {
      /* ignore */
    }
  }
  const user = {
    id: `user-${crypto.randomUUID().slice(0, 8)}`,
    name: `User-${Math.random().toString(36).slice(2, 6)}`,
  }
  sessionStorage.setItem("pdf-collab-user", JSON.stringify(user))
  return user
}

export function PdfCollaborationProvider(): null {
  const user = getOrCreateUser()

  const collab = useCollaboration({
    wsUrl: COAUTHORING_WS_URL,
    userId: user.id,
    username: user.name,
    collaborationStore: pdfCollaborationStore,
    sessionId: sessionStorage.getItem(SESSION_STORAGE_KEY) ?? undefined,
    coauthoringServiceUrl: COAUTHORING_API_URL,
    onRemoteOperation(_op: EditOperation) {
      pdfStore.isModified = true
    },
    onParticipantUpdate(_update: ParticipantUpdate) {
      // PDF cursor tracking handled by collaborationStore
    },
    onPdfAnnotationOp(op: PdfAnnotationOperation, _userId: string) {
      switch (op.action) {
        case "add_annotation": {
          const p = op.payload
          pdfStore.annotations.push({
            id: p.id,
            page: p.page,
            x: p.x,
            y: p.y,
            width: p.width ?? 0,
            height: p.height ?? 0,
            color: p.color ?? "#ff0000",
            text: p.text,
          })
          break
        }
        case "remove_annotation":
          pdfStore.annotations = pdfStore.annotations.filter((a) => a.id !== op.annotation_id)
          break
        case "modify_annotation": {
          const idx = pdfStore.annotations.findIndex((a) => a.id === op.annotation_id)
          if (idx >= 0) {
            pdfStore.annotations[idx] = { ...pdfStore.annotations[idx], ...op.changes }
          }
          break
        }
      }
      pdfStore.isModified = true
    },
  })

  // Watch for local annotation changes and broadcast them
  const broadcastAnnotationOp = useCallback(
    (op: PdfAnnotationOperation) => {
      collab.sendPdfAnnotationOp(op)
    },
    [collab.sendPdfAnnotationOp],
  )

  // Expose broadcast function so PdfViewer can call it
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__pdfCollabSendAnnotation =
      broadcastAnnotationOp
    return () => {
      ;(window as unknown as Record<string, unknown>).__pdfCollabSendAnnotation = undefined
    }
  }, [broadcastAnnotationOp])

  useEffect(() => {
    currentUser.id = user.id
    currentUser.username = user.name
  }, [user.id, user.name])

  useEffect(() => {
    collabSendRef.send = (update: ParticipantUpdate) => {
      collab.sendParticipantUpdate(update)
    }
  }, [collab.sendParticipantUpdate])

  useEffect(() => {
    collab.connect()
  }, [collab.connect])

  return null
}
