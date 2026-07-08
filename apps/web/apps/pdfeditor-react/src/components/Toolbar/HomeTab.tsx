import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clipboard,
  Columns2,
  Copy,
  Edit3,
  Hand,
  Maximize,
  MousePointer,
  Replace,
  Scissors,
  Search,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import { pdfStore } from "../../stores/PdfStore"
import { ZOOM_LEVELS } from "../../types/pdf"
import type { MonacoCommand } from "./MonacoCommand"

interface HomeTabProps {
  onMonacoCommand: (command: MonacoCommand) => void
}

const ObservedHomeTab = observer(function ObservedHomeTab({ onMonacoCommand }: HomeTabProps) {
  function goToFirstPage() {
    pdfStore.setCurrentPage(0)
  }

  function goToPrevPage() {
    pdfStore.setCurrentPage(Math.max(0, pdfStore.currentPage - 1))
  }

  function goToNextPage() {
    pdfStore.setCurrentPage(Math.min(pdfStore.pageCount - 1, pdfStore.currentPage + 1))
  }

  function goToLastPage() {
    pdfStore.setCurrentPage(pdfStore.pageCount - 1)
  }

  function toggleEditMode() {
    pdfStore.setEditMode(!pdfStore.isEditMode)
  }

  function toggleSelectTool() {
    pdfStore.setCurrentTool(pdfStore.currentTool === "select" ? "hand" : "select")
  }

  function toggleHandTool() {
    pdfStore.setCurrentTool(pdfStore.currentTool === "hand" ? "select" : "hand")
  }

  return (
    <section className="pdf-hometab-panel" data-tab="home" role="tabpanel" aria-labelledby="home">
      <div className="pdf-hometab-group">
        <div className="pdf-hometab-elset">
          <button
            type="button"
            className="pdf-hometab-btn"
            onClick={goToFirstPage}
            title="First Page"
          >
            <ChevronsLeft size={18} />
            First
          </button>
          <button
            type="button"
            className="pdf-hometab-btn"
            onClick={goToPrevPage}
            title="Previous Page"
          >
            <ChevronLeft size={18} />
            Previous
          </button>
          <button
            type="button"
            className="pdf-hometab-btn"
            onClick={goToNextPage}
            title="Next Page"
          >
            <ChevronRight size={18} />
            Next
          </button>
          <button
            type="button"
            className="pdf-hometab-btn"
            onClick={goToLastPage}
            title="Last Page"
          >
            <ChevronsRight size={18} />
            Last
          </button>
        </div>
      </div>

      <div className="pdf-hometab-separator" />

      <div className="pdf-hometab-group">
        <div className="pdf-hometab-elset">
          <select
            className="pdf-hometab-zoom-select"
            value={pdfStore.zoomLevel}
            onChange={(e) => pdfStore.setZoomLevel(Number(e.target.value))}
            aria-label="Zoom"
          >
            {ZOOM_LEVELS.map((level) => (
              <option key={level} value={level}>{`${level}%`}</option>
            ))}
          </select>
        </div>
        <div className="pdf-hometab-elset">
          <span className="pdf-hometab-label">Zoom</span>
        </div>
      </div>

      <div className="pdf-hometab-group">
        <div className="pdf-hometab-elset">
          <button
            type="button"
            className={`pdf-hometab-btn${pdfStore.fitToPage ? " active" : ""}`}
            onClick={() => pdfStore.setFitToPage(!pdfStore.fitToPage)}
            title="Fit to Page"
          >
            <Maximize size={18} />
            Fit to Page
          </button>
        </div>
        <div className="pdf-hometab-elset">
          <button
            type="button"
            className={`pdf-hometab-btn${pdfStore.fitToWidth ? " active" : ""}`}
            onClick={() => pdfStore.setFitToWidth(!pdfStore.fitToWidth)}
            title="Fit to Width"
          >
            <Columns2 size={18} />
            Fit to Width
          </button>
        </div>
      </div>

      <div className="pdf-hometab-separator" />

      <div className="pdf-hometab-group">
        <div className="pdf-hometab-elset">
          <button
            type="button"
            className={`pdf-hometab-btn${pdfStore.isEditMode ? " active" : ""}`}
            onClick={toggleEditMode}
            title="Toggle Edit Mode"
          >
            <Edit3 size={18} />
            Edit Mode
          </button>
        </div>
      </div>

      <div className="pdf-hometab-separator" />

      <div className="pdf-hometab-group">
        <div className="pdf-hometab-elset">
          <button
            type="button"
            className={`pdf-hometab-btn${pdfStore.currentTool === "select" ? " active" : ""}`}
            onClick={toggleSelectTool}
            title="Select Tool"
          >
            <MousePointer size={18} />
            Select
          </button>
          <button
            type="button"
            className={`pdf-hometab-btn${pdfStore.currentTool === "hand" ? " active" : ""}`}
            onClick={toggleHandTool}
            title="Hand Tool"
          >
            <Hand size={18} />
            Hand
          </button>
        </div>
      </div>

      <div className="pdf-hometab-separator" />

      {/* Clipboard */}
      <div className="pdf-hometab-group">
        <div className="pdf-hometab-elset">
          <button
            type="button"
            className="pdf-hometab-btn"
            onClick={() => onMonacoCommand("cut")}
            title="Cut"
          >
            <Scissors size={18} />
            Cut
          </button>
          <button
            type="button"
            className="pdf-hometab-btn"
            onClick={() => onMonacoCommand("copy")}
            title="Copy"
          >
            <Copy size={18} />
            Copy
          </button>
          <button
            type="button"
            className="pdf-hometab-btn"
            onClick={() => onMonacoCommand("paste")}
            title="Paste"
          >
            <Clipboard size={18} />
            Paste
          </button>
        </div>
      </div>

      <div className="pdf-hometab-separator" />

      {/* Editing */}
      <div className="pdf-hometab-group">
        <div className="pdf-hometab-elset">
          <button
            type="button"
            className="pdf-hometab-btn"
            onClick={() => onMonacoCommand("find")}
            title="Find"
          >
            <Search size={18} />
            Find
          </button>
          <button
            type="button"
            className="pdf-hometab-btn"
            onClick={() => onMonacoCommand("replace")}
            title="Replace"
          >
            <Replace size={18} />
            Replace
          </button>
          <button
            type="button"
            className="pdf-hometab-btn"
            onClick={() => onMonacoCommand("selectAll")}
            title="Select All"
          >
            <CheckSquare size={18} />
            Select All
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedHomeTab as HomeTab }
