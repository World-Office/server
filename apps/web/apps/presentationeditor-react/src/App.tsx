import { ThemeProvider } from "@world-office/design-system"
import { useDocumentLoader } from "@world-office/wopi-client"
import { type JSX, useCallback } from "react"
import { getActiveEditor } from "./components/MonacoEditor"
import { PresentationCollaborationProvider } from "./components/PresentationCollaborationProvider"
import { SlidePresenter } from "./components/SlidePresenter/SlidePresenter"
import { type MonacoCommand, dispatchMonacoCommand } from "./components/Toolbar/MonacoCommand"
import { Viewport } from "./components/Viewport"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { useTheme } from "./hooks/useTheme"
import { presentationStore } from "./stores/PresentationStore"

function onLoad(): Promise<void> {
  const hasWopi = presentationStore.detectWopiParams()
  if (hasWopi) {
    return presentationStore.loadFromWopi()
  }
  presentationStore.document = {
    title: "Untitled Presentation",
    fileType: "pptx",
    info: {},
  }
  presentationStore.isDocReady = true
  return Promise.resolve()
}

export function App(): JSX.Element {
  useKeyboardShortcuts()
  useTheme()

  const handleMonacoCommand = useCallback((command: MonacoCommand) => {
    dispatchMonacoCommand(command, getActiveEditor())
  }, [])
  const loadState = useDocumentLoader({
    onLoad,
    isLoading: presentationStore.isLoading,
    isError: presentationStore.isLoadingError !== null,
    isReady: presentationStore.isDocReady,
  })

  if (loadState === "loading") {
    return <div className="prese-loading">Loading presentation…</div>
  }
  if (loadState === "error") {
    return (
      <div className="prese-loading">
        <p>Failed to load document: {presentationStore.isLoadingError}</p>
        <button onClick={() => window.location.reload()} type="button">
          Retry
        </button>
      </div>
    )
  }

  return (
    <ThemeProvider>
      <PresentationCollaborationProvider />
      {presentationStore.isPresenting && <SlidePresenter />}
      <Viewport
        toolbarVisible={presentationStore.toolbarVisible}
        statusbarVisible={presentationStore.statusbarVisible}
        leftMenuVisible={presentationStore.leftMenuVisible}
        rightMenuVisible={presentationStore.rightMenuVisible}
        isCompactToolbar={presentationStore.isCompactToolbar}
        onMonacoCommand={handleMonacoCommand}
      />
    </ThemeProvider>
  )
}
