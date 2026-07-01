import { useCollaboration } from "@world-office/collaboration-react"
import { ThemeProvider } from "@world-office/design-system"
import { useDocumentLoader } from "@world-office/wopi-client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { isDesktop, listenForMenuEvents, listenForUpdateEvents } from "./bridge"
import { getActiveEditor } from "./components/MonacoEditor"
import { type MonacoCommand, dispatchMonacoCommand } from "./components/Toolbar/MonacoCommand"
import { Viewport } from "./components/Viewport"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { usePlugins } from "./hooks/usePlugins"
import { collabSendRef, collaborationStore, currentUser } from "./lib/collaboration"
import { documentStore } from "./stores/DocumentStore"

function generateUserId() {
  return `user-${Math.random().toString(36).slice(2, 9)}`
}

export function App() {
  useKeyboardShortcuts()
  usePlugins()

  const handleMonacoCommand = useCallback((command: MonacoCommand) => {
    dispatchMonacoCommand(command, getActiveEditor())
  }, [])

  const loadState = useDocumentLoader({
    onLoad: () => documentStore.detectAndLoadWopi(),
    isLoading: documentStore.isLoading,
    isError: documentStore.loadError !== null,
    isReady: documentStore.isDocReady,
  })
  const retry = () => {
    documentStore.loadError = null
    documentStore.detectAndLoadWopi()
  }

  const [updateAvailable, setUpdateAvailable] = useState(false)

  const userId = useMemo(() => generateUserId(), [])
  const username = useMemo(() => `User ${userId.slice(-4)}`, [userId])

  currentUser.id = userId
  currentUser.username = username

  const { sendParticipantUpdate, connect } = useCollaboration({
    wsUrl: `${import.meta.env.VITE_COLLABORATION_WS_URL}/ws/{session_id}?user_id=${userId}&username=${encodeURIComponent(username)}`,
    userId,
    username,
    collaborationStore,
    coauthoringServiceUrl: import.meta.env.VITE_COLLABORATION_HTTP_URL,
  })

  useEffect(() => {
    collabSendRef.send = sendParticipantUpdate
    connect()
  }, [sendParticipantUpdate, connect])

  useEffect(() => {
    const desktop = isDesktop()
    documentStore.setIsDesktop(desktop)
    if (!desktop) return

    let unlisten: (() => void) | undefined
    listenForMenuEvents((payload) => {
      switch (payload.action) {
        case "save":
          break
        case "save-as":
          documentStore.setActiveTab("file")
          documentStore.setActiveFileMenuPanel("saveas")
          break
        case "open":
          documentStore.setActiveTab("file")
          documentStore.setActiveFileMenuPanel("recent")
          break
        case "new":
          documentStore.setFilePath(null)
          documentStore.setDirty(false)
          documentStore.setActiveFileMenuPanel("create-new")
          break
        case "print":
          documentStore.setActiveTab("file")
          documentStore.setActiveFileMenuPanel("printpreview")
          break
        case "close":
          documentStore.setActiveFileMenuPanel(null)
          documentStore.setFileMenuOpen(false)
          break
        case "toggle-sidebar":
          documentStore.setLeftMenuVisible(!documentStore.leftMenuVisible)
          break
        default:
          break
      }
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    if (!isDesktop()) return

    let unlisten: (() => void) | undefined
    listenForUpdateEvents(() => {
      setUpdateAvailable(true)
    }).then((fn: () => void) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [])

  if (loadState === "loading") {
    return (
      <ThemeProvider>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            flexDirection: "column",
            gap: 16,
            fontFamily: "system-ui, sans-serif",
            color: "#666",
          }}
        >
          <div>Loading document…</div>
        </div>
      </ThemeProvider>
    )
  }

  if (loadState === "error") {
    return (
      <ThemeProvider>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            flexDirection: "column",
            gap: 16,
            fontFamily: "system-ui, sans-serif",
            color: "#c00",
          }}
        >
          <p>Failed to load document.</p>
          <p style={{ fontSize: 13, color: "#888" }}>{documentStore.loadError}</p>
          <button
            type="button"
            onClick={retry}
            style={{
              padding: "8px 24px",
              cursor: "pointer",
              background: "#2ecc71",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            Retry
          </button>
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      {updateAvailable && (
        <div
          style={{
            position: "fixed",
            top: 4,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10000,
            background: "#2ecc71",
            color: "#fff",
            padding: "6px 16px",
            borderRadius: 4,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>&#9650;</span> Update available
          <button
            type="button"
            onClick={() => setUpdateAvailable(false)}
            style={{
              marginLeft: 8,
              cursor: "pointer",
              background: "transparent",
              color: "#fff",
              border: "1px solid #fff",
              borderRadius: 2,
              padding: "1px 6px",
              fontSize: 12,
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      <Viewport
        toolbarVisible={documentStore.toolbarVisible}
        statusbarVisible={documentStore.statusbarVisible}
        leftMenuVisible={documentStore.leftMenuVisible}
        rightMenuVisible={documentStore.rightMenuVisible}
        isCompactToolbar={documentStore.isCompactToolbar}
        onMonacoCommand={handleMonacoCommand}
      />
    </ThemeProvider>
  )
}
