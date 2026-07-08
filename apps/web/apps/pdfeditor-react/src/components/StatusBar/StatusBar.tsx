import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Hand,
  Maximize,
  MousePointer,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { pdfStore } from "../../stores/PdfStore"

function ZoomControls(): JSX.Element {
  return (
    <>
      <div className="pdf-statusbar-separator" />
      <button
        type="button"
        className={`pdf-statusbar-btn${pdfStore.fitToPage ? " active" : ""}`}
        title="Fit to page"
        onClick={() => pdfStore.setFitToPage(!pdfStore.fitToPage)}
      >
        <Maximize size={14} />
      </button>
      <button
        type="button"
        className={`pdf-statusbar-btn${pdfStore.fitToWidth ? " active" : ""}`}
        title="Fit to width"
        onClick={() => pdfStore.setFitToWidth(!pdfStore.fitToWidth)}
      >
        <Columns2 size={14} />
      </button>
      <button
        type="button"
        className="pdf-statusbar-btn"
        title="Zoom Out"
        onClick={() => pdfStore.zoomOut()}
      >
        <ZoomOut size={14} />
      </button>
      <div className="pdf-statusbar-zoom-label">
        <span className="pdf-statusbar-label">{`${pdfStore.zoomLevel}%`}</span>
      </div>
      <button
        type="button"
        className="pdf-statusbar-btn"
        title="Zoom In"
        onClick={() => pdfStore.zoomIn()}
      >
        <ZoomIn size={14} />
      </button>
    </>
  )
}

const ObservedStatusBar = observer(function ObservedStatusBar(): JSX.Element {
  return (
    <div className="pdf-statusbar">
      {/* Page navigation */}
      <div className="pdf-statusbar-page-nav">
        <span className="pdf-statusbar-page-label">
          {pdfStore.pageCount > 0
            ? `Page ${pdfStore.currentPage + 1} of ${pdfStore.pageCount}`
            : ""}
        </span>
        <button
          type="button"
          className="pdf-statusbar-btn"
          title="Previous page"
          disabled={pdfStore.currentPage <= 0}
          onClick={() => pdfStore.setCurrentPage(pdfStore.currentPage - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          className="pdf-statusbar-btn"
          title="Next page"
          disabled={pdfStore.currentPage >= pdfStore.pageCount - 1}
          onClick={() => pdfStore.setCurrentPage(pdfStore.currentPage + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Tool buttons */}
      <div className="pdf-statusbar-tools">
        <button
          type="button"
          className={`pdf-statusbar-btn${pdfStore.currentTool === "select" ? " active" : ""}`}
          title="Select Tool"
          onClick={() => pdfStore.setCurrentTool("select")}
        >
          <MousePointer size={14} />
        </button>
        <button
          type="button"
          className={`pdf-statusbar-btn${pdfStore.currentTool === "hand" ? " active" : ""}`}
          title="Hand Tool"
          onClick={() => pdfStore.setCurrentTool("hand")}
        >
          <Hand size={14} />
        </button>
      </div>

      {/* Zoom controls */}
      <div className="pdf-statusbar-zoom-box">
        <ZoomControls />
      </div>
    </div>
  )
})

export { ObservedStatusBar as StatusBar }
