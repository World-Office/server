import type {
  EditOperation,
  ParticipantUpdate,
  PdfAnnotationOperation,
} from "@world-office/collaboration-client"
import { useCollaboration } from "@world-office/collaboration-react"
import { reaction } from "mobx"
import { useCallback, useEffect, useRef } from "react"
import {
  collabSendRef,
  currentUser,
  pdfAnnotationBroadcastRef,
  pdfCollaborationStore,
} from "../lib/collaboration"
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
      applyingRemoteRef.current = true
      try {
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
      } finally {
        applyingRemoteRef.current = false
      }
    },
  })

  // Flag to avoid re-broadcasting ops received from remote
  const applyingRemoteRef = useRef(false)

  // Watch for local annotation changes and broadcast them
  const broadcastAnnotationOp = useCallback(
    (op: PdfAnnotationOperation) => {
      if (applyingRemoteRef.current) return
      collab.sendPdfAnnotationOp(op)
    },
    [collab.sendPdfAnnotationOp],
  )

  // MobX reaction: auto-broadcast any annotation array change
  useEffect(() => {
    const disposer = reaction(
      () => pdfStore.annotations.length,
      (_len, prevLen) => {
        if (applyingRemoteRef.current) return
        const curLen = pdfStore.annotations.length
        if (curLen > prevLen) {
          // Annotation was added locally — find the newest one
          const added = pdfStore.annotations[curLen - 1]
          if (added) {
            broadcastAnnotationOp({
              action: "add_annotation",
              payload: {
                id: added.id,
                page: added.page,
                type: "text-comment",
                x: added.x,
                y: added.y,
                width: added.width,
                height: added.height,
                color: added.color,
                text: added.text,
              },
            })
          }
        }
      },
    )
    return () => disposer()
  }, [broadcastAnnotationOp])

  // Expose broadcast function via typed ref so PdfViewer can call it
  useEffect(() => {
    pdfAnnotationBroadcastRef.send = broadcastAnnotationOp
    return () => {
      pdfAnnotationBroadcastRef.send = null
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
