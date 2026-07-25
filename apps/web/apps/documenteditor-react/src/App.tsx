import { ThemeProvider } from "@world-office/design-system"
import { useDocumentLoader } from "@world-office/wopi-client"
import { observer } from "mobx-react-lite"
import { Suspense, lazy, useCallback, useEffect, useState } from "react"
import { isDesktop, listenForMenuEvents, listenForUpdateEvents } from "./bridge"
import { getActiveEditor } from "./components/MonacoEditor"
import { type MonacoCommand, dispatchMonacoCommand } from "./components/Toolbar/MonacoCommand"
import { Viewport } from "./components/Viewport"
import { useEmbeddedAutoSave } from "./hooks/useEmbeddedAutoSave"
import { useEmbeddedBridge } from "./hooks/useEmbeddedBridge"
import { useEmbeddedMode } from "./hooks/useEmbeddedMode"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { usePlugins } from "./hooks/usePlugins"
import { useSpellchecker } from "./hooks/useSpellchecker"
import { isCollaborationConfigured } from "./lib/collaboration-config"
import { type RichTextCommand, dispatchRichTextCommand } from "./lib/rte-command"
import { SpellcheckContext } from "./lib/spellcheck-context"
import { documentStore } from "./stores/DocumentStore"

// Non-critical components loaded on demand
const DocumentCollaborationProvider = lazy(() =>
  import("./components/DocumentCollaborationProvider").then((m) => ({
    default: m.DocumentCollaborationProvider,
  })),
)
const ShortcutsOverlay = lazy(() =>
  import("./components/ShortcutsOverlay").then((m) => ({ default: m.ShortcutsOverlay })),
)
const SpellcheckContextMenu = lazy(() =>
  import("./components/SpellcheckContextMenu").then((m) => ({
    default: m.SpellcheckContextMenu,
  })),
)

export const App = observer(function App() {
  const [shortcutsVisible, setShortcutsVisible] = useState(false)

  useKeyboardShortcuts()
  usePlugins()

  const spellcheck = useSpellchecker()

  const { embedded } = useEmbeddedMode(
    documentStore.setToolbarVisible.bind(documentStore),
    documentStore.setStatusbarVisible.bind(documentStore),
    documentStore.setLeftMenuVisible.bind(documentStore),
    documentStore.setRightMenuVisible.bind(documentStore),
  )

  const bridge = useEmbeddedBridge({
    embedded,
    onSave: async () => {
      await documentStore.saveToWopi()
    },
  })

  useEmbeddedAutoSave(
    embedded,
    documentStore.wopiConnection,
    documentStore.isModified,
    () => documentStore.buildDocumentBlob(),
    bridge.notifyDocumentSaved,
    bridge.notifyError,
  )

  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag !== "INPUT" && tag !== "TEXTAREA" && !(e.target as HTMLElement).isContentEditable) {
          e.preventDefault()
          setShortcutsVisible((v) => !v)
        }
      }
    }
    window.addEventListener("keydown", handleGlobalKey)
    return () => window.removeEventListener("keydown", handleGlobalKey)
  }, [])

  const handleMonacoCommand = useCallback((command: MonacoCommand) => {
    dispatchMonacoCommand(command, getActiveEditor())
  }, [])

  const handleRichTextCommand = useCallback((command: RichTextCommand, value?: string) => {
    dispatchRichTextCommand(command, value)
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
      <Suspense fallback={null}>
        {isCollaborationConfigured() && <DocumentCollaborationProvider />}
      </Suspense>
      <Suspense fallback={null}>
        <ShortcutsOverlay visible={shortcutsVisible} onClose={() => setShortcutsVisible(false)} />
      </Suspense>
      <SpellcheckContext.Provider value={spellcheck}>
        <Viewport
          toolbarVisible={documentStore.toolbarVisible}
          statusbarVisible={documentStore.statusbarVisible}
          leftMenuVisible={documentStore.leftMenuVisible}
          rightMenuVisible={documentStore.rightMenuVisible}
          isCompactToolbar={documentStore.isCompactToolbar}
          onMonacoCommand={handleMonacoCommand}
          onRichTextCommand={handleRichTextCommand}
        />
        <Suspense fallback={null}>
          <SpellcheckContextMenu
            spellchecker={spellcheck.spellchecker}
            editorElement={null}
            addToDictionary={spellcheck.addToDictionary}
          />
        </Suspense>
      </SpellcheckContext.Provider>
    </ThemeProvider>
  )
})
