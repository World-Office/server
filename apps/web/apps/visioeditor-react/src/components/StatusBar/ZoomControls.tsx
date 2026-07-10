import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { visioStore } from "../../stores/VisioStore"

function ZoomControlsInner(): JSX.Element {
  return (
    <>
      <button
        type="button"
        className={`visio-statusbar-btn${visioStore.fitToPage ? " active" : ""}`}
        title="Fit to page"
        onClick={() => visioStore.setFitToPage(!visioStore.fitToPage)}
      >
        ⊞
      </button>
      <button
        type="button"
        className={`visio-statusbar-btn${visioStore.fitToWidth ? " active" : ""}`}
        title="Fit to width"
        onClick={() => visioStore.setFitToWidth(!visioStore.fitToWidth)}
      >
        ⇔
      </button>
      <button
        type="button"
        className="visio-statusbar-btn"
        title="Zoom Out"
        onClick={() => visioStore.zoomOut()}
      >
        −
      </button>
      <div className="visio-statusbar-zoom-label">
        <span className="visio-statusbar-label">{`${visioStore.zoomLevel}%`}</span>
      </div>
      <button
        type="button"
        className="visio-statusbar-btn"
        title="Zoom In"
        onClick={() => visioStore.zoomIn()}
      >
        +
      </button>
    </>
  )
}

export const ZoomControls = observer(ZoomControlsInner)
