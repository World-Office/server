import { useEffect, useMemo } from "react"
import { ThemeProvider } from "@world-office/design-system"
import { Viewport } from "./components/Viewport"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { usePlugins } from "./hooks/usePlugins"
import { documentStore } from "./stores/DocumentStore"
import { isDesktop, listenForMenuEvents } from "./bridge"
import { useCollaboration } from "@world-office/collaboration-react"
import { collaborationStore, collabSendRef, currentUser } from "./lib/collaboration"

function generateUserId() {
  return `user-${Math.random().toString(36).slice(2, 9)}`
}

export function App() {
  useKeyboardShortcuts()
  usePlugins()

  const userId = useMemo(() => generateUserId(), [])
  const username = useMemo(() => `User ${userId.slice(-4)}`, [userId])

  currentUser.id = userId
  currentUser.username = username

  const { sendParticipantUpdate, connect } = useCollaboration({
    wsUrl: `ws://localhost:8004/ws/{session_id}?user_id=${userId}&username=${encodeURIComponent(username)}`,
    userId,
    username,
    collaborationStore,
    coauthoringServiceUrl: "http://localhost:8004",
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

    return () => { unlisten?.() }
  }, [])

  return (
    <ThemeProvider>
      <Viewport
        toolbarVisible={documentStore.toolbarVisible}
        statusbarVisible={documentStore.statusbarVisible}
        leftMenuVisible={documentStore.leftMenuVisible}
        rightMenuVisible={documentStore.rightMenuVisible}
        isCompactToolbar={documentStore.isCompactToolbar}
      />
    </ThemeProvider>
  )
}