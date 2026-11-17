import type { EditOperation, ParticipantUpdate } from "@world-office/collaboration-client"
import { useCollaboration } from "@world-office/collaboration-react"
import { observer } from "mobx-react-lite"
import { useEffect } from "react"
import {
  collabSendCommentRef,
  collabSendRef,
  collaborationStore,
  currentUser,
} from "../lib/collaboration"
import { COAUTHORING_API_URL, COAUTHORING_WS_URL, isCollaborationConfigured } from "../lib/collaboration-config"
import { getActiveRichTextEditor } from "../lib/rte-command"
import { documentStore } from "../stores/DocumentStore"

const SESSION_STORAGE_KEY = "doc-collab-session"

function getOrCreateUser(): { id: string; name: string } {
  const stored = sessionStorage.getItem("doc-collab-user")
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
  sessionStorage.setItem("doc-collab-user", JSON.stringify(user))
  return user
}

export const DocumentCollaborationProvider = observer(function DocumentCollaborationProvider(): null {
  const user = getOrCreateUser()

  const collab = useCollaboration({
    wsUrl: COAUTHORING_WS_URL,
    userId: user.id,
    username: user.name,
    collaborationStore: collaborationStore,
    sessionId: sessionStorage.getItem(SESSION_STORAGE_KEY) ?? undefined,
    coauthoringServiceUrl: COAUTHORING_API_URL,
    onRemoteOperation(op: EditOperation) {
      const editor = getActiveRichTextEditor()
      if (!editor) return

      if (op.type === "insert") {
        const { tr } = editor.state
        tr.insert(op.position, editor.state.schema.text(op.content))
        editor.view.dispatch(tr)
      } else if (op.type === "delete") {
        const { tr } = editor.state
        tr.delete(op.position, op.position + op.length)
        editor.view.dispatch(tr)
      }
    },
    onParticipantUpdate(update: ParticipantUpdate) {
      if (update.event === "cursor_moved" && update.cursor_position) {
        documentStore.currentPage = update.cursor_position.page
      }
    },
  })

  useEffect(() => {
    currentUser.id = user.id
    currentUser.username = user.name
  }, [user.id, user.name])

  useEffect(() => {
    collabSendRef.send = (update: ParticipantUpdate) => {
      collab.sendParticipantUpdate(update)
    }
    collabSendCommentRef.send = (data) => {
      collab.sendCommentEvent(data)
    }
  }, [collab.sendParticipantUpdate, collab.sendCommentEvent])

  useEffect(() => {
    // Only connect if collaboration is configured AND co-editing mode is enabled
    if (isCollaborationConfigured() && documentStore.coEditingMode) {
      collab.connect()
    } else {
      collab.disconnect()
    }
  }, [collab.connect, collab.disconnect, documentStore.coEditingMode])

  return null
}
