import { ThemeProvider } from "@world-office/design-system"
import { useDocumentLoader, useWoCommandListener } from "@world-office/wopi-client"
import { observer } from "mobx-react-lite"
import { Suspense, lazy, useCallback } from "react"
import { getActiveEditor } from "./components/MonacoEditor"
import { type MonacoCommand, dispatchMonacoCommand } from "./components/Toolbar/MonacoCommand"
import { Viewport } from "./components/Viewport"
import { useEmbeddedAutoSave } from "./hooks/useEmbeddedAutoSave"
import { useEmbeddedBridge } from "./hooks/useEmbeddedBridge"
import { useEmbeddedMode } from "./hooks/useEmbeddedMode"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { isCollaborationConfigured } from "./lib/collaboration-config"
import { pdfStore } from "./stores/PdfStore"

const PdfCollaborationProvider = lazy(() =>
  import("./components/PdfCollaborationProvider").then((m) => ({
    default: m.PdfCollaborationProvider,
  })),
)

export const App = observer(function App() {
  useKeyboardShortcuts()

  const { embedded } = useEmbeddedMode(
    pdfStore.setToolbarVisible.bind(pdfStore),
    pdfStore.setStatusbarVisible.bind(pdfStore),
    pdfStore.setLeftMenuVisible.bind(pdfStore),
    pdfStore.setRightMenuVisible.bind(pdfStore),
  )

  const bridge = useEmbeddedBridge({
    embedded,
    onSave: async () => {
      await pdfStore.saveToWopi()
    },
  })

  useEmbeddedAutoSave(
    embedded,
    pdfStore.wopiConnection,
    pdfStore.isModified,
    () => pdfStore.buildDocumentBlob(),
    bridge.notifyDocumentSaved,
    bridge.notifyError,
    undefined,
    () => {
      pdfStore.isModified = false
    },
  )

  const handleMonacoCommand = useCallback((command: MonacoCommand) => {
    dispatchMonacoCommand(command, getActiveEditor())
  }, [])

  useWoCommandListener({
    onCommand: (command, _value) => {
      handleMonacoCommand(command as MonacoCommand)
    },
    onSave: () => pdfStore.saveToWopi(),
    onDownload: () => pdfStore.exportAsDownload(),
  })

  const loadState = useDocumentLoader({
    onLoad: () => pdfStore.detectAndLoadWopi(),
    isLoading: pdfStore.isLoading,
    isError: pdfStore.isLoadingError !== null,
    isReady: pdfStore.isDocReady,
  })

  if (loadState === "loading") {
    return (
      <ThemeProvider>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
          }}
        >
          <p>Loading document...</p>
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
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
          }}
        >
          <p>Failed to load document</p>
          <p style={{ color: "#888" }}>{pdfStore.isLoadingError}</p>
          <button type="button" onClick={() => pdfStore.detectAndLoadWopi()}>
            Retry
          </button>
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      {isCollaborationConfigured() && (
        <Suspense fallback={null}>
          <PdfCollaborationProvider />
        </Suspense>
      )}
      <Viewport
        toolbarVisible={pdfStore.toolbarVisible}
        statusbarVisible={pdfStore.statusbarVisible}
        leftMenuVisible={pdfStore.leftMenuVisible}
        rightMenuVisible={pdfStore.rightMenuVisible}
        isCompactToolbar={pdfStore.isCompactToolbar}
        onMonacoCommand={handleMonacoCommand}
      />
    </ThemeProvider>
  )
})
