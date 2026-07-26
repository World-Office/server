import type { ParticipantUpdate, PdfAnnotationOperation } from "@world-office/collaboration-client"
import { CollaborationStore } from "@world-office/editor-stores"

export const pdfCollaborationStore = new CollaborationStore()

export const collabSendRef: { send: ((update: ParticipantUpdate) => void) | null } = {
  send: null,
}

/** Ref set by PdfCollaborationProvider so PdfViewer can broadcast annotation changes. */
export const pdfAnnotationBroadcastRef: {
  send: ((op: PdfAnnotationOperation) => void) | null
} = {
  send: null,
}

export const currentUser = {
  id: "",
  username: "",
}
