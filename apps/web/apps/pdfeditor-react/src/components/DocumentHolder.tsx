import { observer } from "mobx-react-lite"
import { useEffect, useRef } from "react"
import { getTotalPages, init, renderPage, setTotalPages } from "../lib/wasm-renderer"
import { pdfStore } from "../stores/PdfStore"

const DEMO_PAGE_COUNT = 5

const ObservedDocumentHolder = observer(function ObservedDocumentHolder() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const initialized = useRef(false)

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
      {/* Canvas container with shadow */}
      <div
        style={{ margin: "16px auto", flexShrink: 0, display: "flex", justifyContent: "center" }}
      >
        <canvas
          ref={canvasRef}
          className="pdf-document-canvas"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
        />
      </div>

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
