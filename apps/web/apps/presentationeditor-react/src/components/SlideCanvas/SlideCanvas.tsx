import { observer } from "mobx-react-lite"
import { useRef, useCallback, useEffect, type JSX } from "react"
import { presentationStore } from "../../stores/PresentationStore"
import type { ChartData, ShapeData, TableData, TableCell, TableRow } from "../../types/presentation"

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

const CHART_COLORS = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47", "#264478", "#9B57A0"]

function renderChartSvg(chart: ChartData, width: number, height: number): JSX.Element[] {
  const elements: JSX.Element[] = []
  const pad = { top: 20, right: 20, bottom: 40, left: 50 }
  const chartW = width - pad.left - pad.right
  const chartH = height - pad.top - pad.bottom

  if (chart.title) {
    elements.push(
      <text key="title" x={width / 2} y={16} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#333">
        {chart.title}
      </text>,
    )
  }

  const allValues = chart.series.flatMap((s) => s.values)
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues, 0)

  if (chart.type === "column" || chart.type === "bar") {
    const isBar = chart.type === "bar"
    const groupCount = chart.labels.length
    const seriesCount = chart.series.length
    const totalGap = 4
    const itemSize = isBar
      ? Math.max(8, (chartH - groupCount * totalGap) / groupCount / seriesCount)
      : Math.max(8, (chartW - groupCount * totalGap) / groupCount / seriesCount)

    chart.labels.forEach((label, li) => {
      chart.series.forEach((series, si) => {
        const val = series.values[li] || 0
        const color = series.color || CHART_COLORS[si % CHART_COLORS.length]
        const frac = (val - minVal) / (maxVal - minVal)

        if (isBar) {
          const barH = Math.max(2, itemSize - 1)
          const barW = Math.max(1, frac * chartW)
          const y = pad.top + li * seriesCount * itemSize + si * itemSize
          elements.push(
            <rect key={`bar-${li}-${si}`} x={pad.left} y={y} width={barW} height={barH} fill={color} rx={1} />,
          )
          if (si === 0) {
            elements.push(
              <text key={`lb-${li}`} x={pad.left - 4} y={y + barH / 2 + 4} textAnchor="end" fontSize={10} fill="#666">
                {label}
              </text>,
            )
          }
        } else {
          const barW = Math.max(2, itemSize - 1)
          const barH = Math.max(1, frac * chartH)
          const x = pad.left + li * seriesCount * itemSize + si * itemSize
          const y = pad.top + chartH - barH
          elements.push(
            <rect key={`col-${li}-${si}`} x={x} y={y} width={barW} height={barH} fill={color} rx={1} />,
          )
          if (si === 0) {
            elements.push(
              <text key={`lb-${li}`} x={x + barW / 2} y={pad.top + chartH + 14} textAnchor="middle" fontSize={10} fill="#666">
                {label}
              </text>,
            )
          }
        }
      })
    })
  }

  if (chart.type === "line") {
    const pointCount = chart.labels.length
    chart.series.forEach((series, si) => {
      const pts = series.values.map((val, vi) => ({
        x: pad.left + (vi / Math.max(pointCount - 1, 1)) * chartW,
        y: pad.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH,
      }))
      const color = series.color || CHART_COLORS[si % CHART_COLORS.length]
      const d = pts.map((p, pi) => `${pi === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
      elements.push(
        <path key={`line-${si}`} d={d} stroke={color} strokeWidth={2} fill="none" />,
      )
      pts.forEach((p, pi) => {
        elements.push(
          <circle key={`pt-${si}-${pi}`} cx={p.x} cy={p.y} r={3} fill={color} />,
        )
      })
    })
    chart.labels.forEach((label, li) => {
      const x = pad.left + (li / Math.max(pointCount - 1, 1)) * chartW
      elements.push(
        <text key={`lb-${li}`} x={x} y={pad.top + chartH + 14} textAnchor="middle" fontSize={10} fill="#666">
          {label}
        </text>,
      )
    })
  }

  if (chart.type === "pie" || chart.type === "doughnut") {
    const cx = width / 2
    const cy = height / 2 + 8
    const radius = Math.min(chartW, chartH) / 2 - 4
    const total = chart.series.reduce((sum, s) => sum + s.values.reduce((a, b) => a + b, 0), 0) || 1
    const holeR = chart.type === "doughnut" ? radius * 0.55 : 0
    let currentAngle = -Math.PI / 2

    chart.series.forEach((series, si) => {
      series.values.forEach((val, vi) => {
        if (val <= 0) return
        const sliceAngle = (val / total) * Math.PI * 2
        const color = series.color || CHART_COLORS[(si + vi) % CHART_COLORS.length]
        const startX = cx + radius * Math.cos(currentAngle)
        const startY = cy + radius * Math.sin(currentAngle)
        const endX = cx + radius * Math.cos(currentAngle + sliceAngle)
        const endY = cy + radius * Math.sin(currentAngle + sliceAngle)
        const largeArc = sliceAngle > Math.PI ? 1 : 0
        const d = [
          `M${cx + holeR * Math.cos(currentAngle)},${cy + holeR * Math.sin(currentAngle)}`,
          `L${startX},${startY}`,
          `A${radius},${radius} 0 ${largeArc} 1 ${endX},${endY}`,
          `L${cx + holeR * Math.cos(currentAngle + sliceAngle)},${cy + holeR * Math.sin(currentAngle + sliceAngle)}`,
          `A${holeR},${holeR} 0 ${largeArc} 0 ${cx + holeR * Math.cos(currentAngle)},${cy + holeR * Math.sin(currentAngle)}`,
          "Z",
        ].join(" ")

        elements.push(
          <path key={`pie-${si}-${vi}`} d={d} fill={color} stroke="#fff" strokeWidth={1} />,
        )

        if (sliceAngle > 0.3) {
          const labelAngle = currentAngle + sliceAngle / 2
          const lr = radius * 0.7
          const lx = cx + lr * Math.cos(labelAngle)
          const ly = cy + lr * Math.sin(labelAngle)
          elements.push(
            <text key={`pv-${si}-${vi}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#fff" fontWeight="bold">
              {Math.round((val / total) * 100)}%
            </text>,
          )
        }
        currentAngle += sliceAngle
      })
    })

    if (chart.series.length === 1) {
      chart.labels.forEach((label, li) => {
        const val = chart.series[0].values[li] || 0
        if (val <= 0) return
        const sliceAngle = (val / total) * Math.PI * 2
        const labelAngle = currentAngle - sliceAngle + sliceAngle / 2
        const lr = radius + 14
        const lx = cx + lr * Math.cos(labelAngle)
        const ly = cy + lr * Math.sin(labelAngle)
        elements.push(
          <text key={`plb-${li}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="#666">
            {label}
          </text>,
        )
      })
    }
  }

  return elements
}

function getSampleTable(rows: number, columns: number): TableData {
  const cells: TableRow[] = []
  for (let ri = 0; ri < rows; ri++) {
    const row: TableCell[] = []
    for (let ci = 0; ci < columns; ci++) {
      row.push({ text: ri === 0 ? `Header ${ci + 1}` : "" })
    }
    cells.push({ cells: row })
  }
  return { rows, columns, headerRow: true, cells }
}

function renderTableSvg(table: TableData, width: number, height: number): JSX.Element[] {
  const elements: JSX.Element[] = []
  const numRows = Math.max(table.rows, 1)
  const numCols = Math.max(table.columns, 1)
  const colWidth = width / numCols
  const rowHeight = height / numRows
  const headerBg = "#4472C4"
  const headerFg = "#ffffff"
  const borderColor = "#ccc"

  for (let ri = 0; ri < numRows; ri++) {
    for (let ci = 0; ci < numCols; ci++) {
      const x = ci * colWidth
      const y = ri * rowHeight
      const cellText = table.cells?.[ri]?.cells?.[ci]?.text ?? ""
      const isHeader = table.headerRow && ri === 0

      elements.push(
        <rect
          key={`bg-${ri}-${ci}`}
          x={x}
          y={y}
          width={colWidth}
          height={rowHeight}
          fill={isHeader ? headerBg : "white"}
          stroke={borderColor}
          strokeWidth={0.5}
        />,
      )

      elements.push(
        <text
          key={`txt-${ri}-${ci}`}
          x={x + colWidth / 2}
          y={y + rowHeight / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fill={isHeader ? headerFg : "#333"}
          fontWeight={isHeader ? "bold" : "normal"}
        >
          {cellText || (isHeader ? `Header ${ci + 1}` : "")}
        </text>,
      )
    }
  }

  return elements
}

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

  if (shape.chart) {
    const chartSvg = renderChartSvg(shape.chart, shape.width, shape.height)
    return (
      <div key={shape.id} style={style} onMouseDown={handleMouseDown}>
        <svg width={shape.width} height={shape.height}>
          {chartSvg}
        </svg>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
      </div>
    )
  }

  if (shape.table) {
    const tableSvg = renderTableSvg(shape.table, shape.width, shape.height)
    return (
      <div key={shape.id} style={style} onMouseDown={handleMouseDown}>
        <svg width={shape.width} height={shape.height}>
          {tableSvg}
        </svg>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
      </div>
    )
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
