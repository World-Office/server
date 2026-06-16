import { observer } from "mobx-react-lite"
import { useEffect, useRef, useState } from "react"
import { getTotalPages, init, renderPage, setTotalPages } from "../lib/wasm-renderer"
import { WopiClient } from "@world-office/wopi-client"
import { pdfStore } from "../stores/PdfStore"

const DEMO_PAGE_COUNT = 5

const ObservedDocumentHolder = observer(function ObservedDocumentHolder() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [isSvgLoading, setIsSvgLoading] = useState(false)

  // Initialize renderer once on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || initialized.current) return
    initialized.current = true

    init(canvas)
    setTotalPages(DEMO_PAGE_COUNT)
    pdfStore.setPageCount(DEMO_PAGE_COUNT)
    renderPage(pdfStore.currentPage, pdfStore.zoomLevel)
  }, [])

  // Re-render when page or zoom changes
  const { currentPage, zoomLevel } = pdfStore
  useEffect(() => {
    if (!initialized.current) return
    renderPage(currentPage, zoomLevel)
  }, [currentPage, zoomLevel])

  // Load SVG when format=svg is requested
  useEffect(() => {
    if (pdfStore.format !== "svg" || !pdfStore.isDocReady || !pdfStore.wopiConnection) return

    setIsSvgLoading(true)
    setSvgContent(null)

    const loadSvg = async () => {
      try {
        const conn = pdfStore.wopiConnection
        if (!conn) return
        const { content } = await WopiClient.loadDocument({
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
  }, [pdfStore.format, pdfStore.isDocReady, pdfStore.wopiConnection])

  const totalPages = getTotalPages()
  const canPrev = pdfStore.currentPage > 0
  const canNext = pdfStore.currentPage < totalPages - 1

  return (
    <div
      className="pdf-document-holder"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflow: "auto",
        height: "100%",
        backgroundColor: "#404040",
      }}
    >
      {pdfStore.format === "svg" ? (
        <div
          style={{ margin: "16px auto", flexShrink: 0, display: "flex", justifyContent: "center" }}
        >
          {isSvgLoading ? (
            <div className="pdf-document-canvas">Loading SVG...</div>
          ) : svgContent ? (
            <div
              ref={svgRef}
              className="pdf-document-canvas"
              style={{
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                width: "100%",
                height: "100%",
              }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          ) : (
            <div className="pdf-document-canvas">No SVG content</div>
          )}
        </div>
      ) : (
        <div
          style={{ margin: "16px auto", flexShrink: 0, display: "flex", justifyContent: "center" }}
        >
          <canvas
            ref={canvasRef}
            className="pdf-document-canvas"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
          />
        </div>
      )}

      {/* Page navigation controls */}
      <div
        className="pdf-page-nav"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 16px",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          className="pdf-page-nav-btn"
          disabled={!canPrev}
          onClick={() => pdfStore.setCurrentPage(pdfStore.currentPage - 1)}
          aria-label="Previous page"
          style={{
            padding: "4px 10px",
            cursor: canPrev ? "pointer" : "default",
            opacity: canPrev ? 1 : 0.4,
            border: "1px solid #555",
            borderRadius: "3px",
            background: "#555",
            color: "#fff",
            fontSize: "13px",
          }}
        >
          ‹ Prev
        </button>

        <span
          className="pdf-page-nav-label"
          style={{ fontSize: "12px", color: "#ccc", minWidth: "70px", textAlign: "center" }}
        >
          Page {pdfStore.currentPage + 1} of {totalPages}
        </span>

        <button
          type="button"
          className="pdf-page-nav-btn"
          disabled={!canNext}
          onClick={() => pdfStore.setCurrentPage(pdfStore.currentPage + 1)}
          aria-label="Next page"
          style={{
            padding: "4px 10px",
            cursor: canNext ? "pointer" : "default",
            opacity: canNext ? 1 : 0.4,
            border: "1px solid #555",
            borderRadius: "3px",
            background: "#555",
            color: "#fff",
            fontSize: "13px",
          }}
        >
          Next ›
        </button>
      </div>
    </div>
  )
})

export { ObservedDocumentHolder as DocumentHolder }
