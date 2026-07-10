import { loadDocument } from "@world-office/wopi-client"
import { observer } from "mobx-react-lite"
import { useEffect, useRef, useState } from "react"
import { convertVsdxToHtml } from "../lib/conversion"
import { init, renderPage } from "../lib/wasm-renderer"
import { visioStore } from "../stores/VisioStore"
import { FlowchartCanvas } from "./FlowchartCanvas"
import { ShapeTextEditor } from "./ShapeTextEditor"

function VsdxCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [isSvgLoading, setIsSvgLoading] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || initialized.current) return
    initialized.current = true

    init(canvas)
    renderPage(visioStore.currentPageIndex, visioStore.zoomLevel)
  }, [])

  const { currentPageIndex, zoomLevel } = visioStore
  useEffect(() => {
    if (!initialized.current) return
    renderPage(currentPageIndex, zoomLevel)
  }, [currentPageIndex, zoomLevel])

  const { format: vsdxFormat, isDocReady, wopiFileId, wopiAccessToken, docserverBase } = visioStore
  useEffect(() => {
    if (vsdxFormat !== "svg" || !isDocReady || !wopiFileId) return

    setIsSvgLoading(true)
    setSvgContent(null)

    const loadSvg = async () => {
      try {
        const conn =
          wopiFileId && wopiAccessToken && docserverBase
            ? {
                wopiFileId,
                wopiAccessToken,
                docserverBase,
              }
            : null
        if (!conn) return
        const { content } = await loadDocument({
          wopiFileId: conn.wopiFileId,
          wopiAccessToken: conn.wopiAccessToken,
          docserverBase: conn.docserverBase,
          format: "svg",
        })
        const text = await content.text()
        setSvgContent(text)
      } catch (err) {
        console.error("Failed to load SVG:", err)
      } finally {
        setIsSvgLoading(false)
      }
    }

    loadSvg()
  }, [vsdxFormat, isDocReady, wopiFileId, wopiAccessToken, docserverBase])

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
      {visioStore.format === "svg" ? (
        <div
          style={{
            margin: "16px auto",
            flexShrink: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          {isSvgLoading ? (
            <div className="visio-document-canvas">Loading SVG...</div>
          ) : svgContent ? (
            <div
              ref={svgRef}
              className="visio-document-canvas"
              style={{
                boxShadow: "0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)",
                width: "100%",
                height: "100%",
              }}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG content from own server, not user input
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          ) : (
            <div className="visio-document-canvas">No SVG content</div>
          )}
        </div>
      ) : (
        <div
          style={{
            margin: "16px auto",
            flexShrink: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <canvas
            ref={canvasRef}
            className="visio-document-canvas"
            style={{
              boxShadow: "0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)",
            }}
          />
        </div>
      )}
    </div>
  )
}

type ViewMode = "canvas" | "flowchart" | "text"

const ObservedDocumentHolder = observer(function ObservedDocumentHolder() {
  const [viewMode, setViewMode] = useState<ViewMode>(
    visioStore.editorMode === "flowchart" ? "flowchart" : "canvas",
  )
  const [convertedHtml, setConvertedHtml] = useState<string | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger on WOPI connection changes to load content
  useEffect(() => {
    const fileId = visioStore.wopiFileId
    const token = visioStore.wopiAccessToken
    if (!fileId || !token) return

    const ext = visioStore.document?.fileType?.toLowerCase()
    if (ext === "vsdx" || ext === "vsdm" || ext === "vdx") {
      const loadHtml = async () => {
        try {
          const conn = {
            wopiFileId: fileId,
            wopiAccessToken: token,
            docserverBase: visioStore.docserverBase,
          }
          const { content } = await loadDocument(conn)
          const buf = await content.arrayBuffer()
          const html = await convertVsdxToHtml(buf)
          setConvertedHtml(html)
        } catch (e) {
          console.warn("VSDX conversion failed:", e)
        }
      }
      loadHtml()
    }
  }, [visioStore.isDocReady])

  const hasFlowchart = visioStore.editorMode === "flowchart"
  const hasHtml = convertedHtml !== null

  return (
    <div
      className="visio-document-holder"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        overflow: "hidden",
        height: "100%",
        backgroundColor: "#e8e8e8",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "4px 8px",
          backgroundColor: "#f5f5f5",
          borderBottom: "1px solid #ccc",
        }}
      >
        {hasFlowchart && (
          <button
            type="button"
            onClick={() => setViewMode("flowchart")}
            style={{
              padding: "4px 12px",
              fontWeight: viewMode === "flowchart" ? 700 : 400,
              backgroundColor: viewMode === "flowchart" ? "#fff" : "transparent",
              border: "1px solid #ccc",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Diagram Editor
          </button>
        )}
        {hasHtml && (
          <button
            type="button"
            onClick={() => setViewMode("text")}
            style={{
              padding: "4px 12px",
              fontWeight: viewMode === "text" ? 700 : 400,
              backgroundColor: viewMode === "text" ? "#fff" : "transparent",
              border: "1px solid #ccc",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Text View
          </button>
        )}
        <button
          type="button"
          onClick={() => setViewMode("canvas")}
          style={{
            padding: "4px 12px",
            fontWeight: viewMode === "canvas" ? 700 : 400,
            backgroundColor: viewMode === "canvas" ? "#fff" : "transparent",
            border: "1px solid #ccc",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Rendered View
        </button>
      </div>

      {viewMode === "flowchart" && hasFlowchart && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <FlowchartCanvas />
        </div>
      )}
      {viewMode === "text" && hasHtml && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <ShapeTextEditor value={convertedHtml} onChange={setConvertedHtml} />
        </div>
      )}
      {viewMode === "canvas" && <VsdxCanvas />}
    </div>
  )
})

export { ObservedDocumentHolder as DocumentHolder }
