// Bidirectional postMessage protocol between React editor and parent iframe (Nextcloud)
//
// Upstream events (editor → parent):
//   { type: 'app_ready' }
//   { type: 'document_ready' }
//   { type: 'document_modified' }
//   { type: 'document_saved', version: string }
//   { type: 'error', code: string, message: string }
//   { type: 'request_close' }
//
// Downstream commands (parent → editor):
//   { type: 'save' }
//   { type: 'close' }
//   { type: 'set_user', userId: string, userName: string }
//   { type: 'theme', theme: 'light' | 'dark' }

import { useCallback, useEffect } from "react"

type UpstreamEvent =
  | { type: "app_ready" }
  | { type: "document_ready" }
  | { type: "document_modified" }
  | { type: "document_saved"; version: string }
  | { type: "error"; code: string; message: string }
  | { type: "request_close" }

type DownstreamCommand =
  | { type: "save" }
  | { type: "close" }
  | { type: "set_user"; userId: string; userName: string }
  | { type: "theme"; theme: "light" | "dark" }

export function useEmbeddedBridge(options: {
  embedded: boolean
  onSave?: () => Promise<void>
  onClose?: () => void
  onSetUser?: (userId: string, userName: string) => void
  onThemeChange?: (theme: "light" | "dark") => void
}) {
  const { embedded, onSave, onClose, onSetUser, onThemeChange } = options

  const postToParent = useCallback((event: UpstreamEvent) => {
    if (window.parent !== window) {
      window.parent.postMessage({ source: "worldoffice-editor", ...event }, "*")
    }
  }, [])

  useEffect(() => {
    if (!embedded) return

    postToParent({ type: "app_ready" })

    const handleDownstream = (event: MessageEvent) => {
      const data = event.data
      if (data?.source !== "worldoffice-nextcloud") return

      const cmd = data as DownstreamCommand
      switch (cmd.type) {
        case "save":
          if (onSave) {
            onSave()
              .then(() => postToParent({ type: "document_saved", version: "" }))
              .catch(() =>
                postToParent({
                  type: "error",
                  code: "SAVE_FAILED",
                  message: "Failed to save document",
                }),
              )
          }
          break
        case "close":
          if (onClose) onClose()
          break
        case "set_user":
          if (onSetUser) onSetUser(cmd.userId, cmd.userName)
          break
        case "theme":
          if (onThemeChange) onThemeChange(cmd.theme)
          break
      }
    }

    window.addEventListener("message", handleDownstream)
    return () => window.removeEventListener("message", handleDownstream)
  }, [embedded, onSave, onClose, onSetUser, onThemeChange, postToParent])

  return {
    notifyDocumentReady: useCallback(
      () => postToParent({ type: "document_ready" }),
      [postToParent],
    ),
    notifyDocumentModified: useCallback(
      () => postToParent({ type: "document_modified" }),
      [postToParent],
    ),
    notifyDocumentSaved: useCallback(
      (version: string) => postToParent({ type: "document_saved", version }),
      [postToParent],
    ),
    notifyError: useCallback(
      (code: string, message: string) => postToParent({ type: "error", code, message }),
      [postToParent],
    ),
    notifyRequestClose: useCallback(() => postToParent({ type: "request_close" }), [postToParent]),
  }
}
