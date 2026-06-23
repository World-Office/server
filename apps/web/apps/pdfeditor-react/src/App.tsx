import { ThemeProvider } from "@world-office/design-system"
import { useDocumentLoader } from "@world-office/wopi-client"
import { Viewport } from "./components/Viewport"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { pdfStore } from "./stores/PdfStore"

export function App() {
  useKeyboardShortcuts()
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
      <Viewport
        toolbarVisible={pdfStore.toolbarVisible}
        statusbarVisible={pdfStore.statusbarVisible}
        leftMenuVisible={pdfStore.leftMenuVisible}
        rightMenuVisible={pdfStore.rightMenuVisible}
        isCompactToolbar={pdfStore.isCompactToolbar}
      />
    </ThemeProvider>
  )
}
