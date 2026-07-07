import {
  AlignEndVertical,
  AlignStartVertical,
  FileText,
  Grid3x3,
  MessageSquarePlus,
  MessageSquareX,
  Minimize2,
  Ruler,
  Search,
  SearchCheck,
  SearchX,
  SpellCheck2,
  WrapText,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import type { RichTextCommand } from "../../lib/rte-command"
import { documentStore } from "../../stores/DocumentStore"
import { ZOOM_LEVELS } from "../../types/document"
import type { MonacoCommand } from "./MonacoCommand"

interface ViewTabProps {
  onMonacoCommand: (command: MonacoCommand) => void
  onRichTextCommand?: (command: RichTextCommand, value?: string) => void
}

const ObservedViewTab = observer(function ObservedViewTab({
  onMonacoCommand,
  onRichTextCommand,
}: ViewTabProps) {
  return (
    <section className="de-viewtab-panel" data-tab="view" role="tabpanel" aria-labelledby="view">
      {/* Show/Hide */}
      <div className="de-viewtab-group">
        <span className="de-viewtab-label">Show</span>
        <div className="de-viewtab-elset">
          <label className="de-viewtab-checkbox">
            <input type="checkbox" />
            <Ruler size={14} />
            <span>Ruler</span>
          </label>
          <label className="de-viewtab-checkbox">
            <input type="checkbox" />
            <Grid3x3 size={14} />
            <span>Gridlines</span>
          </label>
          <label className="de-viewtab-checkbox">
            <input type="checkbox" />
            <FileText size={14} />
            <span>Navigation</span>
          </label>
        </div>
      </div>

      {/* Zoom */}
      <div className="de-viewtab-group">
        <span className="de-viewtab-label">Zoom</span>
        <div className="de-viewtab-elset">
          <select
            className="de-viewtab-select"
            value={documentStore.zoomLevel}
            onChange={(e) => documentStore.setZoomLevel(Number(e.target.value))}
            aria-label="Zoom"
          >
            {ZOOM_LEVELS.map((level) => (
              <option key={level} value={level}>{`${level}%`}</option>
            ))}
          </select>
        </div>
        <div className="de-viewtab-elset">
          <button
            type="button"
            className={`de-viewtab-btn${documentStore.fitToPage ? " active" : ""}`}
            onClick={() => documentStore.setFitToPage(!documentStore.fitToPage)}
            title="Fit to Page"
          >
            <AlignStartVertical size={18} />
            <span>Page</span>
          </button>
          <button
            type="button"
            className={`de-viewtab-btn${documentStore.fitToWidth ? " active" : ""}`}
            onClick={() => documentStore.setFitToWidth(!documentStore.fitToWidth)}
            title="Fit to Width"
          >
            <AlignEndVertical size={18} />
            <span>Width</span>
          </button>
        </div>
      </div>

      {/* Code Editor */}
      <div className="de-viewtab-group">
        <span className="de-viewtab-label">Code</span>
        <div className="de-viewtab-elset">
          <button
            type="button"
            className="de-viewtab-btn"
            onClick={() => onMonacoCommand("toggleWordWrap")}
            title="Toggle Word Wrap (Alt+Z)"
          >
            <WrapText size={18} />
            <span>Word Wrap</span>
          </button>
          <button
            type="button"
            className="de-viewtab-btn"
            onClick={() => onMonacoCommand("toggleMinimap")}
            title="Toggle Minimap"
          >
            <Minimize2 size={18} />
            <span>Minimap</span>
          </button>
        </div>
      </div>

      {/* Editing */}
      {onRichTextCommand && (
        <div className="de-viewtab-group">
          <span className="de-viewtab-label">Editing</span>
          <div className="de-viewtab-elset">
            <button
              type="button"
              className="de-viewtab-btn"
              onClick={() => onRichTextCommand("openSearch")}
              title="Find & Replace"
            >
              <Search size={18} />
              <span>Find</span>
            </button>
            <button
              type="button"
              className="de-viewtab-btn"
              onClick={() => onRichTextCommand("findNext")}
              title="Find Next"
            >
              <SearchCheck size={18} />
              <span>Next</span>
            </button>
            <button
              type="button"
              className="de-viewtab-btn"
              onClick={() => onRichTextCommand("findPrevious")}
              title="Find Previous"
            >
              <SearchX size={18} />
              <span>Prev</span>
            </button>
            <button
              type="button"
              className="de-viewtab-btn"
              onClick={() => onRichTextCommand("addComment")}
              title="Add Comment"
            >
              <MessageSquarePlus size={18} />
              <span>Comment</span>
            </button>
            <button
              type="button"
              className="de-viewtab-btn"
              onClick={() => onRichTextCommand("toggleComment")}
              title="Remove Comment"
            >
              <MessageSquareX size={18} />
              <span>Uncomment</span>
            </button>
            <button
              type="button"
              className="de-viewtab-btn"
              onClick={() => onRichTextCommand("toggleSpellCheck")}
              title="Toggle Spell Check"
            >
              <SpellCheck2 size={18} />
              <span>Spelling</span>
            </button>
          </div>
        </div>
      )}
    </section>
  )
})

export { ObservedViewTab as ViewTab }
