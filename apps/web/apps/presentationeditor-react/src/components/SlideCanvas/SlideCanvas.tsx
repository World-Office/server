import { observer } from "mobx-react-lite"
import { useRef, useCallback, useEffect, type JSX } from "react"
import { presentationStore } from "../../stores/PresentationStore"
import type { ShapeData } from "../../types/presentation"

const HANDLE_SIZE = 8

const RESIZE_HANDLES = [
  { name: "nw", cursor: "nw-resize", x: -4, y: -4 },
  { name: "n", cursor: "n-resize", x: "50%", y: -4 },
  { name: "ne", cursor: "ne-resize", x: "calc(100% - 4px)", y: -4 },
  { name: "e", cursor: "e-resize", x: "calc(100% - 4px)", y: "50%" },
  { name: "se", cursor: "se-resize", x: "calc(100% - 4px)", y: "calc(100% - 4px)" },
  { name: "s", cursor: "s-resize", x: "50%", y: "calc(100% - 4px)" },
  { name: "sw", cursor: "sw-resize", x: -4, y: "calc(100% - 4px)" },
  { name: "w", cursor: "w-resize", x: -4, y: "50%" },
]

function renderShape(
  shape: ShapeData,
  isSelected: boolean,
  onDragStart: (e: React.MouseEvent, shapeId: string) => void,
  onResizeStart: (e: React.MouseEvent, shapeId: string, handle: string) => void,
): JSX.Element | null {
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${shape.x}px`,
    top: `${shape.y}px`,
    width: `${shape.width}px`,
    height: `${shape.height}px`,
    outline: isSelected ? "2px solid var(--wo-prese-accent)" : "none",
    outlineOffset: "-1px",
    cursor: "pointer",
    zIndex: shape.zIndex,
    pointerEvents: "auto",
    transform: shape.rotation ? `rotate(${shape.rotation}deg)` : undefined,
  }

  const coreProps = {
    x: 0,
    y: 0,
    width: shape.width,
    height: shape.height,
    fill: shape.fillColor || "transparent",
    stroke: shape.strokeColor || "#333",
    strokeWidth: shape.strokeWidth || 1,
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    presentationStore.selectShape(shape.id)
    onDragStart(e, shape.id)
  }

  switch (shape.type) {
    case "rect":
      const el = <div key={shape.id} style={style} onMouseDown={handleMouseDown}>
        <svg width={shape.width} height={shape.height}>
          <rect {...coreProps} rx={0} />
          {shape.text && <text x={shape.width/2} y={shape.height/2} textAnchor="middle" dominantBaseline="central" fill={shape.fontColor || "#333"} fontSize={shape.fontSize || 14}>{shape.text}</text>}
        </svg>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
      </div>
      return el
    case "roundedRect":
      const roundedEl = <div key={shape.id} style={style} onMouseDown={handleMouseDown}>
        <svg width={shape.width} height={shape.height}>
          <rect {...coreProps} rx={8} />
          {shape.text && <text x={shape.width/2} y={shape.height/2} textAnchor="middle" dominantBaseline="central" fill={shape.fontColor || "#333"} fontSize={shape.fontSize || 14}>{shape.text}</text>}
        </svg>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
      </div>
      return roundedEl
    case "ellipse":
      const ellipseEl = <div key={shape.id} style={style} onMouseDown={handleMouseDown}>
        <svg width={shape.width} height={shape.height}>
          <ellipse cx={shape.width/2} cy={shape.height/2} rx={shape.width/2} ry={shape.height/2} fill={coreProps.fill} stroke={coreProps.stroke} strokeWidth={coreProps.strokeWidth} />
          {shape.text && <text x={shape.width/2} y={shape.height/2} textAnchor="middle" dominantBaseline="central" fill={shape.fontColor || "#333"} fontSize={shape.fontSize || 14}>{shape.text}</text>}
        </svg>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
      </div>
      return ellipseEl
    case "triangle":
      const triEl = <div key={shape.id} style={style} onMouseDown={handleMouseDown}>
        <svg width={shape.width} height={shape.height}>
          <polygon points={`${shape.width/2},0 ${shape.width},${shape.height} 0,${shape.height}`} fill={coreProps.fill} stroke={coreProps.stroke} strokeWidth={coreProps.strokeWidth} />
          {shape.text && <text x={shape.width/2} y={shape.height/2} textAnchor="middle" dominantBaseline="central" fill={shape.fontColor || "#333"} fontSize={shape.fontSize || 14}>{shape.text}</text>}
        </svg>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
      </div>
      return triEl
    case "diamond":
      const diamEl = <div key={shape.id} style={style} onMouseDown={handleMouseDown}>
        <svg width={shape.width} height={shape.height}>
          <polygon points={`${shape.width/2},0 ${shape.width},${shape.height/2} ${shape.width/2},${shape.height} 0,${shape.height/2}`} fill={coreProps.fill} stroke={coreProps.stroke} strokeWidth={coreProps.strokeWidth} />
          {shape.text && <text x={shape.width/2} y={shape.height/2} textAnchor="middle" dominantBaseline="central" fill={shape.fontColor || "#333"} fontSize={shape.fontSize || 14}>{shape.text}</text>}
        </svg>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
      </div>
      return diamEl
    case "line":
      const lineEl = <div key={shape.id} style={style} onMouseDown={handleMouseDown}>
        <svg width={shape.width} height={shape.height}>
          <line x1={0} y1={0} x2={shape.width} y2={shape.height} stroke={coreProps.stroke} strokeWidth={coreProps.strokeWidth || 2} />
        </svg>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
      </div>
      return lineEl
    case "arrow":
      const arrowEl = <div key={shape.id} style={style} onMouseDown={handleMouseDown}>
        <svg width={shape.width} height={shape.height}>
          <defs><marker id={`arrow-${shape.id}`} markerWidth={10} markerHeight={10} refX={9} refY={3} orient="auto"><path d="M0,0 L10,3 L0,6" fill={coreProps.stroke} /></marker></defs>
          <line x1={0} y1={shape.height/2} x2={shape.width - 5} y2={shape.height/2} stroke={coreProps.stroke} strokeWidth={coreProps.strokeWidth || 2} markerEnd={`url(#arrow-${shape.id})`} />
        </svg>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
      </div>
      return arrowEl
    case "textbox":
      const tbEl = <div key={shape.id} style={{
        ...style,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: shape.fillColor || "transparent",
      }} onMouseDown={handleMouseDown}>
        <span style={{
          color: shape.fontColor || "#333",
          fontSize: shape.fontSize || 14,
          textAlign: "center",
          userSelect: "none",
        }}>{shape.text || "Text"}</span>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
      </div>
      return tbEl
    default:
      return null
  }
}

function renderResizeHandles(
  shapeId: string,
  onResizeStart: (e: React.MouseEvent, shapeId: string, handle: string) => void,
): JSX.Element {
  return (
    <>
      {RESIZE_HANDLES.map((h) => (
        <div
          key={h.name}
          className="prese-canvas-resize-handle"
          style={{
            position: "absolute",
            left: h.x as string | number,
            top: h.y as string | number,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            marginLeft: -(HANDLE_SIZE / 2),
            marginTop: -(HANDLE_SIZE / 2),
            backgroundColor: "white",
            border: "1px solid var(--wo-prese-accent)",
            cursor: h.cursor,
            zIndex: 1000,
          }}
          onMouseDown={(e) => {
            e.stopPropagation()
            onResizeStart(e, shapeId, h.name)
          }}
        />
      ))}
    </>
  )
}

const ObservedSlideCanvas = observer(function ObservedSlideCanvas(): JSX.Element {
  const dragRef = useRef<{ shapeId: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizeRef = useRef<{ shapeId: string; handle: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null)
  const onDragStart = useCallback((e: React.MouseEvent, shapeId: string) => {
    const shape = presentationStore.slides[presentationStore.currentSlide]?.shapes?.find((s) => s.id === shapeId)
    if (!shape) return
    dragRef.current = {
      shapeId,
      startX: e.clientX,
      startY: e.clientY,
      origX: shape.x,
      origY: shape.y,
    }
  }, [])

  const onResizeStartCB = useCallback((e: React.MouseEvent, shapeId: string, handle: string) => {
    const shape = presentationStore.slides[presentationStore.currentSlide]?.shapes?.find((s) => s.id === shapeId)
    if (!shape) return
    resizeRef.current = {
      shapeId,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origX: shape.x,
      origY: shape.y,
      origW: shape.width,
      origH: shape.height,
    }
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragRef.current) {
      const { shapeId, startX, startY, origX, origY } = dragRef.current
      const dx = (e.clientX - startX) / (presentationStore.zoomLevel / 100)
      const dy = (e.clientY - startY) / (presentationStore.zoomLevel / 100)
      presentationStore.moveShape(presentationStore.currentSlide, shapeId, Math.round(origX + dx), Math.round(origY + dy))
    }
    if (resizeRef.current) {
      const { shapeId, handle, startX, startY, origX, origY, origW, origH } = resizeRef.current
      const dx = (e.clientX - startX) / (presentationStore.zoomLevel / 100)
      const dy = (e.clientY - startY) / (presentationStore.zoomLevel / 100)
      let newX = origX, newY = origY, newW = origW, newH = origH
      if (handle.includes("e")) newW = Math.max(20, origW + dx)
      if (handle.includes("w")) { newX = origX + dx; newW = Math.max(20, origW - dx) }
      if (handle.includes("s")) newH = Math.max(20, origH + dy)
      if (handle.includes("n")) { newY = origY + dy; newH = Math.max(20, origH - dy) }
      presentationStore.updateShape(presentationStore.currentSlide, shapeId, { x: Math.round(newX), y: Math.round(newY), width: Math.round(newW), height: Math.round(newH) })
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    dragRef.current = null
    resizeRef.current = null
  }, [])

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const { slides, currentSlide, zoomLevel, slideSize, isPreviewPlaying, previewStep, selectedShapeId } = presentationStore
  const slide = slides[currentSlide]
  if (!slide) return <div className="prese-canvas-empty">No slides</div>

  const aspectRatio = slideSize === "widescreen" ? 16 / 9 : 4 / 3
  const baseWidth = 960
  const baseHeight = baseWidth / aspectRatio
  const scale = zoomLevel / 100
  const canvasWidth = baseWidth * scale
  const canvasHeight = baseHeight * scale

  const previewAnim = isPreviewPlaying && slide.animations?.[previewStep]
  const previewClass = previewAnim
    ? `prese-canvas-slide prese-anim-${previewAnim.effect}`
    : "prese-canvas-slide"

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("prese-canvas-background")) {
      presentationStore.deselectShape()
    }
  }

  return (
    <div className="prese-canvas-container">
      <div
        className={previewClass}
        style={{
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          animationDuration: previewAnim ? `${previewAnim.duration}s` : undefined,
          animationDelay: previewAnim ? `${previewAnim.delay}s` : undefined,
        }}
        onClick={handleCanvasClick}
      >
        <div className="prese-canvas-background" />

        {slide.layout === "title" && (
          <div className="prese-canvas-placeholder prese-canvas-placeholder-title">
            <div
              className="prese-canvas-placeholder-text"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) =>
                presentationStore.setSlideTitle(
                  currentSlide,
                  e.currentTarget.textContent || "",
                )
              }
            >
              {slide.title || "Click to add title"}
            </div>
          </div>
        )}

        {slide.layout === "content" && (
          <>
            <div className="prese-canvas-placeholder prese-canvas-placeholder-title">
              <div
                className="prese-canvas-placeholder-text"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) =>
                  presentationStore.setSlideTitle(
                    currentSlide,
                    e.currentTarget.textContent || "",
                  )
                }
              >
                {slide.title || "Click to add title"}
              </div>
            </div>
            <div className="prese-canvas-placeholder prese-canvas-placeholder-body">
              <div className="prese-canvas-placeholder-text placeholder-muted">
                Click to add content
              </div>
            </div>
          </>
        )}

        {slide.layout === "blank" && (
          <div className="prese-canvas-placeholder prese-canvas-placeholder-blank">
            <div
              className="prese-canvas-placeholder-text"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) =>
                presentationStore.setSlideTitle(
                  currentSlide,
                  e.currentTarget.textContent || "",
                )
              }
            >
              {slide.title || "Click to add title"}
            </div>
          </div>
        )}

        {slide.shapes?.map((shape) => renderShape(shape, shape.id === selectedShapeId, onDragStart, onResizeStartCB))}

        {slide.notes && (
          <div className="prese-canvas-notes-indicator" title={slide.notes}>
            📝
          </div>
        )}
      </div>
    </div>
  )
})

export const SlideCanvas = ObservedSlideCanvas
