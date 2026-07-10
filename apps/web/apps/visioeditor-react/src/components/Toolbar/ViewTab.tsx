import { Columns2, Download, Maximize, Monitor, Palette, Workflow, WrapText } from "lucide-react"
import type { JSX } from "react"
import { flowchartStore } from "../../stores/FlowchartStore"
import { visioStore } from "../../stores/VisioStore"
import { ZOOM_LEVELS } from "../../types/visio"
import { exportFlowchartAsSvg } from "../FlowchartCanvas"
import type { MonacoCommand } from "./MonacoCommand"

interface ViewTabProps {
  onMonacoCommand: (command: MonacoCommand) => void
}

export function ViewTab({ onMonacoCommand }: ViewTabProps): JSX.Element {
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
            <Maximize size={16} />
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
            <Columns2 size={16} />
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
            <Workflow size={16} />
            {visioStore.editorMode === "flowchart" ? "▦ Flowchart" : "▢ Diagram"}
          </button>
        </div>
        <div className="visio-viewtab-elset">
          <span className="visio-viewtab-label">Editor Mode</span>
        </div>
      </div>

      <div className="visio-viewtab-separator" />

      <div className="visio-viewtab-group">
        <div className="visio-viewtab-elset">
          <button
            type="button"
            className={`visio-viewtab-btn${visioStore.editorMode === "flowchart" ? "" : " hidden"}`}
            onClick={() => exportFlowchartAsSvg(flowchartStore.document)}
            title="Export flowchart as SVG (Ctrl+Shift+E)"
            style={{
              display: visioStore.editorMode === "flowchart" ? undefined : "none",
            }}
          >
            <Download size={16} />
            Export SVG
          </button>
        </div>
        <div className="visio-viewtab-elset">
          <label
            className="visio-viewtab-checkbox"
            style={{
              display: visioStore.editorMode === "flowchart" ? undefined : "none",
            }}
          >
            <input
              type="checkbox"
              checked={flowchartStore.snapToGridEnabled}
              onChange={() => flowchartStore.toggleSnapToGrid()}
            />
            Snap to Grid
          </label>
        </div>
      </div>

      <div
        className="visio-viewtab-separator"
        style={{
          display: visioStore.editorMode === "flowchart" ? undefined : "none",
        }}
      />

      <div className="visio-viewtab-group">
        <button type="button" className="visio-viewtab-btn-theme" title="Interface theme">
          <Palette size={16} />
          Interface Theme
        </button>
      </div>

      <div className="visio-viewtab-separator" />

      <div className="visio-viewtab-group">
        <div className="visio-viewtab-elset">
          <button
            type="button"
            className="visio-viewtab-btn"
            onClick={() => onMonacoCommand("toggleMinimap")}
            title="Toggle code editor minimap (no-op when Monaco is not mounted)"
          >
            <Monitor size={16} />
            Toggle Minimap
          </button>
        </div>
        <div className="visio-viewtab-elset">
          <button
            type="button"
            className="visio-viewtab-btn"
            onClick={() => onMonacoCommand("toggleWordWrap")}
            title="Toggle code editor word wrap (no-op when Monaco is not mounted)"
          >
            <WrapText size={16} />
            Toggle Word Wrap
          </button>
        </div>
      </div>
      <div className="visio-viewtab-elset">
        <span className="visio-viewtab-label">Code Editor</span>
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
