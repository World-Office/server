import { observer } from "mobx-react-lite"
import { useEffect, useRef } from "react"
import { init, renderPage } from "../lib/wasm-renderer"
import { visioStore } from "../stores/VisioStore"
import { FlowchartCanvas } from "./FlowchartCanvas"

function VsdxCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const initialized = useRef(false)

  // Initialize renderer once on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || initialized.current) return
    initialized.current = true

    init(canvas)
    renderPage(visioStore.currentPageIndex, visioStore.zoomLevel)
  }, [])

  // Re-render when page or zoom changes
  const { currentPageIndex, zoomLevel } = visioStore
  useEffect(() => {
    if (!initialized.current) return
    renderPage(currentPageIndex, zoomLevel)
  }, [currentPageIndex, zoomLevel])

  return (
    <div
      className="visio-document-holder"
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
          className="visio-document-canvas"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)" }}
        />
      </div>
    </div>
  )
}

const ObservedDocumentHolder = observer(function ObservedDocumentHolder() {
  if (visioStore.editorMode === "flowchart") {
    return <FlowchartCanvas />
  }
  return <VsdxCanvas />
})

export { ObservedDocumentHolder as DocumentHolder }
