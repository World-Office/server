import type { ParticipantUpdate } from "@world-office/collaboration-client"
import { CollaborationStore } from "@world-office/editor-stores"

export const pdfCollaborationStore = new CollaborationStore()

export const collabSendRef: { send: ((update: ParticipantUpdate) => void) | null } = {
  send: null,
}

export const currentUser = {
  id: "",
  username: "",
}
