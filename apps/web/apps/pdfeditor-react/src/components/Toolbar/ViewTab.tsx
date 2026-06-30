import { observer } from "mobx-react-lite"
import { pdfStore } from "../../stores/PdfStore"
import { ZOOM_LEVELS } from "../../types/pdf"
import type { MonacoCommand } from "./MonacoCommand"

interface ViewTabProps {
  onMonacoCommand: (command: MonacoCommand) => void
}

const ObservedViewTab = observer(function ObservedViewTab({ onMonacoCommand }: ViewTabProps) {
  return (
    <section className="pdf-viewtab-panel" data-tab="view" role="tabpanel" aria-labelledby="view">
      <div className="pdf-viewtab-group">
        <div className="pdf-viewtab-elset">
          <select
            className="pdf-viewtab-zoom-select"
            value={pdfStore.zoomLevel}
            onChange={(e) => pdfStore.setZoomLevel(Number(e.target.value))}
            aria-label="Zoom"
          >
            {ZOOM_LEVELS.map((level) => (
              <option key={level} value={level}>{`${level}%`}</option>
            ))}
          </select>
        </div>
        <div className="pdf-viewtab-elset">
          <span className="pdf-viewtab-label">Zoom</span>
        </div>
      </div>

      <div className="pdf-viewtab-group">
        <div className="pdf-viewtab-elset">
          <button
            type="button"
            className={`pdf-viewtab-btn${pdfStore.fitToPage ? " active" : ""}`}
            onClick={() => pdfStore.setFitToPage(!pdfStore.fitToPage)}
            title="Fit to page"
          >
            Fit to Page
          </button>
        </div>
        <div className="pdf-viewtab-elset">
          <button
            type="button"
            className={`pdf-viewtab-btn${pdfStore.fitToWidth ? " active" : ""}`}
            onClick={() => pdfStore.setFitToWidth(!pdfStore.fitToWidth)}
            title="Fit to width"
          >
            Fit to Width
          </button>
        </div>
      </div>

      <div className="pdf-viewtab-separator" />

      <div className="pdf-viewtab-group">
        <button type="button" className="pdf-viewtab-btn-theme" title="Interface theme">
          Interface Theme
        </button>
      </div>

      <div className="pdf-viewtab-separator pdf-viewtab-separator-theme" />

      <div className="pdf-viewtab-group">
        <div className="pdf-viewtab-elset">
          <label className="pdf-viewtab-checkbox">
            <input
              type="checkbox"
              checked={!pdfStore.isCompactToolbar}
              onChange={(e) => pdfStore.setCompactToolbar(!e.target.checked)}
            />
            Always show toolbar
          </label>
        </div>
        <div className="pdf-viewtab-elset">
          <label className="pdf-viewtab-checkbox">
            <input
              type="checkbox"
              checked={pdfStore.statusbarVisible}
              onChange={(e) => pdfStore.setStatusbarVisible(e.target.checked)}
            />
            Status Bar
          </label>
        </div>
      </div>

      <div className="pdf-viewtab-group">
        <div className="pdf-viewtab-elset">
          <label className="pdf-viewtab-checkbox">
            <input
              type="checkbox"
              checked={pdfStore.leftMenuVisible}
              onChange={(e) => pdfStore.setLeftMenuVisible(e.target.checked)}
            />
            Left Panel
          </label>
        </div>
        <div className="pdf-viewtab-elset">
          <label className="pdf-viewtab-checkbox">
            <input
              type="checkbox"
              checked={pdfStore.rightMenuVisible}
              onChange={(e) => pdfStore.setRightMenuVisible(e.target.checked)}
            />
            Right Panel
          </label>
        </div>
      </div>

      <div className="pdf-viewtab-separator" />

      <div className="pdf-viewtab-group">
        <div className="pdf-viewtab-elset">
          <span className="pdf-viewtab-label">Code Editor</span>
        </div>
        <div className="pdf-viewtab-elset">
          <button
            type="button"
            className="pdf-viewtab-btn"
            onClick={() => onMonacoCommand("toggleWordWrap")}
            title="Toggle Word Wrap (Alt+Z)"
          >
            Toggle Word Wrap
          </button>
          <button
            type="button"
            className="pdf-viewtab-btn"
            onClick={() => onMonacoCommand("toggleMinimap")}
            title="Toggle Minimap"
          >
            Toggle Minimap
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedViewTab as ViewTab }
