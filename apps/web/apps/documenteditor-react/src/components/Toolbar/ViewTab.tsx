import { observer } from "mobx-react-lite"
import type { RichTextCommand } from "../../lib/rte-command"
import { documentStore } from "../../stores/DocumentStore"
import { ZOOM_LEVELS } from "../../types/document"
import type { MonacoCommand } from "./MonacoCommand"

interface ViewTabProps {
  onMonacoCommand: (command: MonacoCommand) => void
  onRichTextCommand?: (command: RichTextCommand) => void
}

const ObservedViewTab = observer(function ObservedViewTab({
  onMonacoCommand,
  onRichTextCommand,
}: ViewTabProps) {
  return (
    <section className="de-viewtab-panel" data-tab="view" role="tabpanel" aria-labelledby="view">
      {/* Show/Hide */}
      <div className="de-viewtab-group">
        <div className="de-viewtab-elset">
          <span className="de-viewtab-label">Show</span>
        </div>
        <div className="de-viewtab-elset">
          <label className="de-viewtab-checkbox">
            <input type="checkbox" />
            <span>Ruler</span>
          </label>
          <label className="de-viewtab-checkbox">
            <input type="checkbox" />
            <span>Gridlines</span>
          </label>
          <label className="de-viewtab-checkbox">
            <input type="checkbox" />
            <span>Navigation Pane</span>
          </label>
        </div>
      </div>

      <div className="de-viewtab-separator" />

      {/* Zoom */}
      <div className="de-viewtab-group">
        <div className="de-viewtab-elset">
          <span className="de-viewtab-label">Zoom</span>
        </div>
        <div className="de-viewtab-elset">
          <select
            className="de-viewtab-zoom-select"
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
            Fit to Page
          </button>
        </div>
        <div className="de-viewtab-elset">
          <button
            type="button"
            className={`de-viewtab-btn${documentStore.fitToWidth ? " active" : ""}`}
            onClick={() => documentStore.setFitToWidth(!documentStore.fitToWidth)}
            title="Fit to Width"
          >
            Fit to Width
          </button>
        </div>
      </div>

      <div className="de-viewtab-separator" />

      <div className="de-viewtab-group">
        <div className="de-viewtab-elset">
          <span className="de-viewtab-label">Code Editor</span>
        </div>
        <div className="de-viewtab-elset">
          <button
            type="button"
            className="de-viewtab-btn"
            onClick={() => onMonacoCommand("toggleWordWrap")}
            title="Toggle Word Wrap (Alt+Z)"
          >
            Toggle Word Wrap
          </button>
          <button
            type="button"
            className="de-viewtab-btn"
            onClick={() => onMonacoCommand("toggleMinimap")}
            title="Toggle Minimap"
          >
            Toggle Minimap
          </button>
        </div>
      </div>

      <div className="de-viewtab-separator" />

      {/* Views */}
      <div className="de-viewtab-group">
        <div className="de-viewtab-elset">
          <span className="de-viewtab-label">Views</span>
        </div>
        <div className="de-viewtab-elset">
          <button
            type="button"
            className="de-viewtab-btn"
            disabled
            title="Page View (not available in code editor)"
          >
            Page
          </button>
          <button
            type="button"
            className="de-viewtab-btn"
            disabled
            title="Web View (not available in code editor)"
          >
            Web
          </button>
          <button
            type="button"
            className="de-viewtab-btn"
            disabled
            title="Read Mode (not available in code editor)"
          >
            Read
          </button>
        </div>
      </div>

      <div className="de-viewtab-separator" />

      {/* Find & Replace */}
      {onRichTextCommand && (
        <>
          <div className="de-viewtab-group">
            <div className="de-viewtab-elset">
              <span className="de-viewtab-label">Editing</span>
            </div>
            <div className="de-viewtab-elset">
              <button
                type="button"
                className="de-viewtab-btn"
                onClick={() => onRichTextCommand("openSearch")}
                title="Find & Replace"
              >
                Find & Replace
              </button>
              <button
                type="button"
                className="de-viewtab-btn"
                onClick={() => onRichTextCommand("findNext")}
                title="Find Next"
              >
                Find Next
              </button>
              <button
                type="button"
                className="de-viewtab-btn"
                onClick={() => onRichTextCommand("findPrevious")}
                title="Find Previous"
              >
                Find Prev
              </button>
              <button
                type="button"
                className="de-viewtab-btn"
                onClick={() => onRichTextCommand("replace")}
                title="Replace"
              >
                Replace
              </button>
              <button
                type="button"
                className="de-viewtab-btn"
                onClick={() => onRichTextCommand("addComment")}
                title="Add Comment"
              >
                Add Comment
              </button>
              <button
                type="button"
                className="de-viewtab-btn"
                onClick={() => onRichTextCommand("toggleComment")}
                title="Remove Comment"
              >
                Remove Comment
              </button>
              <button
                type="button"
                className="de-viewtab-btn"
                onClick={() => onRichTextCommand("toggleSpellCheck")}
                title="Toggle Spell Check"
              >
                Spell Check
              </button>
            </div>
          </div>
          <div className="de-viewtab-separator" />
        </>
      )}

      {/* Macros */}
      <div className="de-viewtab-group">
        <div className="de-viewtab-elset">
          <button
            type="button"
            className="de-viewtab-btn"
            disabled
            title="Macros (not yet implemented)"
          >
            Macros
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedViewTab as ViewTab }
