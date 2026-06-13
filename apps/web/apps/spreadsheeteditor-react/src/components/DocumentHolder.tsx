import { observer } from "mobx-react-lite"
import { useEffect, useRef } from "react"
import { init, renderPage } from "../lib/wasm-renderer"
import { spreadsheetStore } from "../stores/SpreadsheetStore"

const ObservedDocumentHolder = observer(function ObservedDocumentHolder() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const initialized = useRef(false)

  // Initialize renderer once on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || initialized.current) return
    initialized.current = true

    init(canvas)
    renderPage(0, spreadsheetStore.zoomLevel)
  }, [])

  // Re-render when zoom changes
  const { zoomLevel } = spreadsheetStore
  useEffect(() => {
    if (!initialized.current) return
    renderPage(0, zoomLevel)
  }, [zoomLevel])

  return (
    <div
      className="se-document-holder"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflow: "auto",
        height: "100%",
        backgroundColor: "#e8e8e8",
      }}
    >
      {/* Canvas container with shadow */}
      <div
        style={{ margin: "16px auto", flexShrink: 0, display: "flex", justifyContent: "center" }}
      >
        <canvas
          ref={canvasRef}
          className="se-document-canvas"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)" }}
        />
      </div>
    </div>
  )
})

export { ObservedDocumentHolder as DocumentHolder }
