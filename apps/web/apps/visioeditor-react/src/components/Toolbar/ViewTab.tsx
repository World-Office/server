import type { JSX } from "react"
import { visioStore } from "../../stores/VisioStore"
import { flowchartStore } from "../../stores/FlowchartStore"
import { ZOOM_LEVELS } from "../../types/visio"

export function ViewTab(): JSX.Element {
  return (
    <section className="visio-viewtab-panel" data-tab="view" role="tabpanel" aria-labelledby="view">
      <div className="visio-viewtab-group">
        <div className="visio-viewtab-elset">
          <select
            className="visio-viewtab-zoom-select"
            value={visioStore.zoomLevel}
            onChange={(e) => visioStore.setZoomLevel(Number(e.target.value))}
            aria-label="Zoom"
          >
            {ZOOM_LEVELS.map((level) => (
              <option key={level} value={level}>{`${level}%`}</option>
            ))}
          </select>
        </div>
        <div className="visio-viewtab-elset">
          <span className="visio-viewtab-label">Zoom</span>
        </div>
      </div>

      <div className="visio-viewtab-group">
        <div className="visio-viewtab-elset">
          <button
            type="button"
            className={`visio-viewtab-btn${visioStore.fitToPage ? " active" : ""}`}
            onClick={() => visioStore.setFitToPage(!visioStore.fitToPage)}
            title="Fit to page"
          >
            Fit to Page
          </button>
        </div>
        <div className="visio-viewtab-elset">
          <button
            type="button"
            className={`visio-viewtab-btn${visioStore.fitToWidth ? " active" : ""}`}
            onClick={() => visioStore.setFitToWidth(!visioStore.fitToWidth)}
            title="Fit to width"
          >
            Fit to Width
          </button>
        </div>
      </div>

      <div className="visio-viewtab-separator" />

      <div className="visio-viewtab-group">
        <div className="visio-viewtab-elset">
          <button
            type="button"
            className={`visio-viewtab-btn${visioStore.editorMode === "flowchart" ? " active" : ""}`}
            onClick={() => {
              visioStore.toggleEditorMode()
              if (visioStore.editorMode === "flowchart") {
                flowchartStore.clear()
              }
            }}
            title="Switch between VSDX view and flowchart editor"
          >
            {visioStore.editorMode === "flowchart" ? "▦ Flowchart" : "▢ Diagram"}
          </button>
        </div>
        <div className="visio-viewtab-elset">
          <span className="visio-viewtab-label">Editor Mode</span>
        </div>
      </div>

      <div className="visio-viewtab-separator" />

      <div className="visio-viewtab-group">
        <button type="button" className="visio-viewtab-btn-theme" title="Interface theme">
          Interface Theme
        </button>
      </div>

      <div className="visio-viewtab-separator visio-viewtab-separator-theme" />

      <div className="visio-viewtab-group">
        <div className="visio-viewtab-elset">
          <label className="visio-viewtab-checkbox">
            <input
              type="checkbox"
              checked={!visioStore.isCompactToolbar}
              onChange={(e) => visioStore.setCompactToolbar(!e.target.checked)}
            />
            Always show toolbar
          </label>
        </div>
        <div className="visio-viewtab-elset">
          <label className="visio-viewtab-checkbox">
            <input
              type="checkbox"
              checked={visioStore.statusbarVisible}
              onChange={(e) => visioStore.setStatusbarVisible(e.target.checked)}
            />
            Status Bar
          </label>
        </div>
      </div>

      <div className="visio-viewtab-group">
        <div className="visio-viewtab-elset">
          <label className="visio-viewtab-checkbox">
            <input
              type="checkbox"
              checked={visioStore.leftMenuVisible}
              onChange={(e) => visioStore.setLeftMenuVisible(e.target.checked)}
            />
            Left Panel
          </label>
        </div>
      </div>
    </section>
  )
}
