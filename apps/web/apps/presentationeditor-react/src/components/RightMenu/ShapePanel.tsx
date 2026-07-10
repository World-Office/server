import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { presentationStore } from "../../stores/PresentationStore"

function ShapePanelInner(): JSX.Element {
  const { slides, currentSlide, selectedShapeId, updateShape, removeShape, deselectShape } =
    presentationStore
  const slide = slides[currentSlide]
  const shape = slide?.shapes?.find((s) => s.id === selectedShapeId)

  if (!shape) {
    return <div className="prese-shape-panel-empty">No shape selected</div>
  }

  const slideIndex = currentSlide
  const sid = shape.id

  const set = (updates: Record<string, unknown>): void => {
    updateShape(slideIndex, sid, updates as Partial<typeof shape>)
  }

  return (
    <div className="prese-shape-panel">
      <div className="prese-shape-panel-header">Shape Properties</div>

      <div className="prese-shape-panel-grid">
        <label className="prese-shape-panel-field">
          <span className="prese-shape-panel-label">X</span>
          <input
            className="prese-shape-panel-input"
            type="number"
            step={1}
            value={shape.x}
            onChange={(e) => set({ x: Number(e.target.value) })}
          />
        </label>
        <label className="prese-shape-panel-field">
          <span className="prese-shape-panel-label">Y</span>
          <input
            className="prese-shape-panel-input"
            type="number"
            step={1}
            value={shape.y}
            onChange={(e) => set({ y: Number(e.target.value) })}
          />
        </label>
        <label className="prese-shape-panel-field">
          <span className="prese-shape-panel-label">Width</span>
          <input
            className="prese-shape-panel-input"
            type="number"
            step={1}
            min={1}
            value={shape.width}
            onChange={(e) => set({ width: Number(e.target.value) })}
          />
        </label>
        <label className="prese-shape-panel-field">
          <span className="prese-shape-panel-label">Height</span>
          <input
            className="prese-shape-panel-input"
            type="number"
            step={1}
            min={1}
            value={shape.height}
            onChange={(e) => set({ height: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="prese-shape-panel-grid">
        <label className="prese-shape-panel-field">
          <span className="prese-shape-panel-label">Rotation</span>
          <input
            className="prese-shape-panel-input"
            type="number"
            step={1}
            min={0}
            max={360}
            value={shape.rotation}
            onChange={(e) => set({ rotation: Number(e.target.value) })}
          />
        </label>
        <label className="prese-shape-panel-field">
          <span className="prese-shape-panel-label">Z-Index</span>
          <input
            className="prese-shape-panel-input"
            type="number"
            step={1}
            value={shape.zIndex}
            onChange={(e) => set({ zIndex: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="prese-shape-panel-grid">
        <label className="prese-shape-panel-field">
          <span className="prese-shape-panel-label">Fill</span>
          <input
            className="prese-shape-panel-color"
            type="color"
            value={shape.fillColor || "#ffffff"}
            onChange={(e) => set({ fillColor: e.target.value })}
          />
        </label>
        <label className="prese-shape-panel-field">
          <span className="prese-shape-panel-label">Stroke</span>
          <input
            className="prese-shape-panel-color"
            type="color"
            value={shape.strokeColor || "#cccccc"}
            onChange={(e) => set({ strokeColor: e.target.value })}
          />
        </label>
        <label className="prese-shape-panel-field">
          <span className="prese-shape-panel-label">Stroke Width</span>
          <input
            className="prese-shape-panel-input"
            type="number"
            step={1}
            min={0}
            value={shape.strokeWidth ?? 0}
            onChange={(e) => set({ strokeWidth: Number(e.target.value) })}
          />
        </label>
        <label className="prese-shape-panel-field">
          <span className="prese-shape-panel-label">Font Size</span>
          <input
            className="prese-shape-panel-input"
            type="number"
            step={1}
            min={8}
            value={shape.fontSize ?? 16}
            onChange={(e) => set({ fontSize: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="prese-shape-panel-grid">
        <label className="prese-shape-panel-field">
          <span className="prese-shape-panel-label">Font Color</span>
          <input
            className="prese-shape-panel-color"
            type="color"
            value={shape.fontColor || "#000000"}
            onChange={(e) => set({ fontColor: e.target.value })}
          />
        </label>
      </div>

      <label className="prese-shape-panel-field">
        <span className="prese-shape-panel-label">Text</span>
        <textarea
          className="prese-shape-panel-textarea"
          rows={4}
          value={shape.text ?? ""}
          onChange={(e) => set({ text: e.target.value })}
          placeholder="Shape text…"
        />
      </label>

      <button
        type="button"
        className="prese-shape-panel-delete"
        onClick={() => {
          removeShape(slideIndex, sid)
          deselectShape()
        }}
      >
        Delete Shape
      </button>
    </div>
  )
}

export const ShapePanel = observer(ShapePanelInner)
