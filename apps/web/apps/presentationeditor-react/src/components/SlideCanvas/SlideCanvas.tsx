import { loadDocument } from "@world-office/wopi-client"
import { observer } from "mobx-react-lite"
import { type JSX, useCallback, useEffect, useRef, useState } from "react"
import { presentationStore } from "../../stores/PresentationStore"
import type {
  ChartData,
  ConnectorData,
  GradientFill,
  ShadowEffect,
  ShapeData,
  TableData,
} from "../../types/presentation"
import { CollaborativeCursors } from "../CollaborativeCursors"

const HANDLE_SIZE = 8
const ROTATION_HANDLE_OFFSET = 24

/** Convert camelCase effect name to kebab-case CSS class suffix */
function effectToCssClass(effect: string): string {
  return effect.replace(/([A-Z])/g, "-$1").toLowerCase()
}

const RESIZE_HANDLES = [
  { name: "nw", cursor: "nw-resize", x: -4, y: -4 },
  { name: "n", cursor: "n-resize", x: "50%", y: -4 },
  { name: "ne", cursor: "ne-resize", x: "calc(100% - 4px)", y: -4 },
  { name: "e", cursor: "e-resize", x: "calc(100% - 4px)", y: "50%" },
  {
    name: "se",
    cursor: "se-resize",
    x: "calc(100% - 4px)",
    y: "calc(100% - 4px)",
  },
  { name: "s", cursor: "s-resize", x: "50%", y: "calc(100% - 4px)" },
  { name: "sw", cursor: "sw-resize", x: -4, y: "calc(100% - 4px)" },
  { name: "w", cursor: "w-resize", x: -4, y: "50%" },
]

const CHART_COLORS = [
  "#4472C4",
  "#ED7D31",
  "#A5A5A5",
  "#FFC000",
  "#5B9BD5",
  "#70AD47",
  "#264478",
  "#9B57A0",
]

function renderChartSvg(chart: ChartData, width: number, height: number): JSX.Element[] {
  const elements: JSX.Element[] = []
  const pad = { top: 20, right: 20, bottom: 40, left: 50 }
  const chartW = width - pad.left - pad.right
  const chartH = height - pad.top - pad.bottom

  if (chart.title) {
    elements.push(
      <text
        key="title"
        x={width / 2}
        y={16}
        textAnchor="middle"
        fontSize={14}
        fontWeight="bold"
        fill="#333"
      >
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
            <rect
              key={`bar-${label}-${series.name}`}
              x={pad.left}
              y={y}
              width={barW}
              height={barH}
              fill={color}
              rx={1}
            />,
          )
          if (si === 0) {
            elements.push(
              <text
                key={`lb-${label}`}
                x={pad.left - 4}
                y={y + barH / 2 + 4}
                textAnchor="end"
                fontSize={10}
                fill="#666"
              >
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
            <rect
              key={`col-${label}-${series.name}`}
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={color}
              rx={1}
            />,
          )
          if (si === 0) {
            elements.push(
              <text
                key={`lb-${label}`}
                x={x + barW / 2}
                y={pad.top + chartH + 14}
                textAnchor="middle"
                fontSize={10}
                fill="#666"
              >
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
        <path key={`line-${series.name}`} d={d} stroke={color} strokeWidth={2} fill="none" />,
      )
      pts.forEach((p, pi) => {
        elements.push(
          <circle
            key={`pt-${series.name}-${chart.labels[pi]}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={color}
          />,
        )
      })
    })
    chart.labels.forEach((label, li) => {
      const x = pad.left + (li / Math.max(pointCount - 1, 1)) * chartW
      elements.push(
        <text
          key={`lb-${label}`}
          x={x}
          y={pad.top + chartH + 14}
          textAnchor="middle"
          fontSize={10}
          fill="#666"
        >
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
          <path
            key={`pie-${series.name}-${chart.labels[vi]}`}
            d={d}
            fill={color}
            stroke="#fff"
            strokeWidth={1}
          />,
        )

        if (sliceAngle > 0.3) {
          const labelAngle = currentAngle + sliceAngle / 2
          const lr = radius * 0.7
          const lx = cx + lr * Math.cos(labelAngle)
          const ly = cy + lr * Math.sin(labelAngle)
          elements.push(
            <text
              key={`pv-${series.name}-${chart.labels[vi]}`}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fill="#fff"
              fontWeight="bold"
            >
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
          <text
            key={`plb-${label}`}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fill="#666"
          >
            {label}
          </text>,
        )
      })
    }
  }

  return elements
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

function renderConnectorSvg(
  connector: ConnectorData,
  width: number,
  height: number,
  stroke: string,
  strokeWidth: number,
): JSX.Element {
  const { connectorType, hasStartArrow, hasEndArrow, startX, startY, endX, endY } = connector
  const arrowSize = Math.max(8, strokeWidth * 4)

  const markerId = `conn-arrow-${connectorType}-${stroke.replace("#", "")}-${strokeWidth}`
  const markerEnd = hasEndArrow ? `url(#${markerId})` : undefined
  const markerStart = hasStartArrow ? `url(#${markerId}-start)` : undefined

  let pathD: string
  if (connectorType === "straight") {
    pathD = `M${startX},${startY} L${endX},${endY}`
  } else if (connectorType === "bent") {
    const midX = (startX + endX) / 2
    pathD = `M${startX},${startY} L${midX},${startY} L${midX},${endY} L${endX},${endY}`
  } else {
    const cpx = (startX + endX) / 2
    const cpy = (startY + endY) / 2
    pathD = `M${startX},${startY} Q${cpx},${startY} ${cpx},${cpy} Q${cpx},${endY} ${endX},${endY}`
  }

  return (
    <svg
      width={width}
      height={height}
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Connector"
    >
      <title>Connector</title>
      <defs>
        {hasEndArrow && (
          <marker
            id={markerId}
            markerWidth={arrowSize}
            markerHeight={arrowSize}
            refX={arrowSize}
            refY={arrowSize / 2}
            orient="auto"
          >
            <path d={`M0,0 L${arrowSize},${arrowSize / 2} L0,${arrowSize}`} fill={stroke} />
          </marker>
        )}
        {hasStartArrow && (
          <marker
            id={`${markerId}-start`}
            markerWidth={arrowSize}
            markerHeight={arrowSize}
            refX={0}
            refY={arrowSize / 2}
            orient="auto"
          >
            <path
              d={`M${arrowSize},0 L0,${arrowSize / 2} L${arrowSize},${arrowSize}`}
              fill={stroke}
            />
          </marker>
        )}
      </defs>
      <path
        d={pathD}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="none"
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
    </svg>
  )
}

function renderGradientSvg(gradient: GradientFill, id: string): JSX.Element | null {
  if (!gradient.stops.length) return null
  const gradId = `grad-${id}`
  if (gradient.kind === "linear") {
    const angle = gradient.angle || 0
    const rad = (angle * Math.PI) / 180
    const x1 = 0.5 - 0.5 * Math.cos(rad + Math.PI)
    const y1 = 0.5 - 0.5 * Math.sin(rad + Math.PI)
    const x2 = 0.5 + 0.5 * Math.cos(rad + Math.PI)
    const y2 = 0.5 + 0.5 * Math.sin(rad + Math.PI)
    return (
      <linearGradient id={gradId} x1={x1} y1={y1} x2={x2} y2={y2}>
        {gradient.stops.map((s) => (
          <stop
            key={`stop-${s.position}-${s.color}`}
            offset={`${s.position * 100}%`}
            stopColor={s.color}
          />
        ))}
      </linearGradient>
    )
  }
  return (
    <radialGradient id={gradId}>
      {gradient.stops.map((s) => (
        <stop
          key={`stop-${s.position}-${s.color}`}
          offset={`${s.position * 100}%`}
          stopColor={s.color}
        />
      ))}
    </radialGradient>
  )
}

function shadowToFilter(shadow: ShadowEffect, id: string): JSX.Element {
  const filterId = `shadow-${id}`
  const blur = shadow.blurRadius > 0 ? Math.max(1, shadow.blurRadius / 100) : 2
  return (
    <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow
        dx={shadow.dx / 100}
        dy={shadow.dy / 100}
        stdDeviation={blur}
        floodColor={shadow.color || "#000"}
        floodOpacity={shadow.opacity || 0.5}
      />
    </filter>
  )
}

function renderShape(
  shape: ShapeData,
  isSelected: boolean,
  onDragStart: (e: React.MouseEvent, shapeId: string) => void,
  onResizeStart: (e: React.MouseEvent, shapeId: string, handle: string) => void,
  onDoubleClick?: (shapeId: string) => void,
  onRotateStart?: (e: React.MouseEvent, shapeId: string) => void,
): JSX.Element | null {
  const hasGradient = !!shape.gradientFill?.stops?.length
  const hasShadow = !!shape.shadow

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

  const fillValue = hasGradient ? `url(#grad-${shape.id})` : shape.fillColor || "transparent"
  const coreProps = {
    x: 0,
    y: 0,
    width: shape.width,
    height: shape.height,
    fill: fillValue,
    stroke: shape.strokeColor || "#333",
    strokeWidth: shape.strokeWidth || 1,
    filter: hasShadow ? `url(#shadow-${shape.id})` : undefined,
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.shiftKey) {
      presentationStore.toggleShapeSelection(shape.id)
    } else if (!isSelected) {
      presentationStore.selectShape(shape.id)
    }
    onDragStart(e, shape.id)
  }

  const handleShapeDoubleClick = (e: React.MouseEvent, shapeId: string): void => {
    e.stopPropagation()
    onDoubleClick?.(shapeId)
  }

  if (shape.chart) {
    const chartSvg = renderChartSvg(shape.chart, shape.width, shape.height)
    return (
      <div
        key={shape.id}
        style={style}
        onMouseDown={handleMouseDown}
        onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
      >
        <svg width={shape.width} height={shape.height} role="img" aria-label="Chart">
          <title>Chart</title>
          {chartSvg}
        </svg>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
        {isSelected && renderRotationHandle(shape.id, shape.width, onRotateStart)}
      </div>
    )
  }

  if (shape.table) {
    const tableSvg = renderTableSvg(shape.table, shape.width, shape.height)
    return (
      <div
        key={shape.id}
        style={style}
        onMouseDown={handleMouseDown}
        onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
      >
        <svg width={shape.width} height={shape.height} role="img" aria-label="Table">
          <title>Table</title>
          {tableSvg}
        </svg>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
        {isSelected && renderRotationHandle(shape.id, shape.width, onRotateStart)}
      </div>
    )
  }

  const defsEl =
    hasGradient || hasShadow ? (
      <defs>
        {hasGradient && shape.gradientFill && renderGradientSvg(shape.gradientFill, shape.id)}
        {hasShadow && shape.shadow && shadowToFilter(shape.shadow, shape.id)}
      </defs>
    ) : undefined

  switch (shape.type) {
    case "rect": {
      const el = (
        <div
          key={shape.id}
          style={style}
          onMouseDown={handleMouseDown}
          onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
        >
          <svg width={shape.width} height={shape.height} role="img" aria-label="Rectangle">
            <title>Rectangle</title>
            {defsEl}
            <rect {...coreProps} rx={0} />
            {shape.text && (
              <text
                x={shape.width / 2}
                y={shape.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill={shape.fontColor || "#333"}
                fontSize={shape.fontSize || 14}
              >
                {shape.text}
              </text>
            )}
          </svg>
          {isSelected && renderResizeHandles(shape.id, onResizeStart)}
          {isSelected && renderRotationHandle(shape.id, shape.width, onRotateStart)}
        </div>
      )
      return el
    }
    case "roundedRect": {
      const roundedEl = (
        <div
          key={shape.id}
          style={style}
          onMouseDown={handleMouseDown}
          onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
        >
          <svg width={shape.width} height={shape.height} role="img" aria-label="Rounded Rectangle">
            <title>Rounded Rectangle</title>
            {defsEl}
            <rect {...coreProps} rx={8} />
            {shape.text && (
              <text
                x={shape.width / 2}
                y={shape.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill={shape.fontColor || "#333"}
                fontSize={shape.fontSize || 14}
              >
                {shape.text}
              </text>
            )}
          </svg>
          {isSelected && renderResizeHandles(shape.id, onResizeStart)}
          {isSelected && renderRotationHandle(shape.id, shape.width, onRotateStart)}
        </div>
      )
      return roundedEl
    }
    case "ellipse": {
      const ellipseEl = (
        <div
          key={shape.id}
          style={style}
          onMouseDown={handleMouseDown}
          onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
        >
          <svg width={shape.width} height={shape.height} role="img" aria-label="Ellipse">
            <title>Ellipse</title>
            {defsEl}
            <ellipse
              cx={shape.width / 2}
              cy={shape.height / 2}
              rx={shape.width / 2}
              ry={shape.height / 2}
              fill={coreProps.fill}
              stroke={coreProps.stroke}
              strokeWidth={coreProps.strokeWidth}
            />
            {shape.text && (
              <text
                x={shape.width / 2}
                y={shape.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill={shape.fontColor || "#333"}
                fontSize={shape.fontSize || 14}
              >
                {shape.text}
              </text>
            )}
          </svg>
          {isSelected && renderResizeHandles(shape.id, onResizeStart)}
          {isSelected && renderRotationHandle(shape.id, shape.width, onRotateStart)}
        </div>
      )
      return ellipseEl
    }
    case "triangle": {
      const triEl = (
        <div
          key={shape.id}
          style={style}
          onMouseDown={handleMouseDown}
          onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
        >
          <svg width={shape.width} height={shape.height} role="img" aria-label="Triangle">
            <title>Triangle</title>
            {defsEl}
            <polygon
              points={`${shape.width / 2},0 ${shape.width},${shape.height} 0,${shape.height}`}
              fill={coreProps.fill}
              stroke={coreProps.stroke}
              strokeWidth={coreProps.strokeWidth}
            />
            {shape.text && (
              <text
                x={shape.width / 2}
                y={shape.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill={shape.fontColor || "#333"}
                fontSize={shape.fontSize || 14}
              >
                {shape.text}
              </text>
            )}
          </svg>
          {isSelected && renderResizeHandles(shape.id, onResizeStart)}
          {isSelected && renderRotationHandle(shape.id, shape.width, onRotateStart)}
        </div>
      )
      return triEl
    }
    case "diamond": {
      const diamEl = (
        <div
          key={shape.id}
          style={style}
          onMouseDown={handleMouseDown}
          onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
        >
          <svg width={shape.width} height={shape.height} role="img" aria-label="Diamond">
            <title>Diamond</title>
            {defsEl}
            <polygon
              points={`${shape.width / 2},0 ${shape.width},${shape.height / 2} ${shape.width / 2},${shape.height} 0,${shape.height / 2}`}
              fill={coreProps.fill}
              stroke={coreProps.stroke}
              strokeWidth={coreProps.strokeWidth}
            />
            {shape.text && (
              <text
                x={shape.width / 2}
                y={shape.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill={shape.fontColor || "#333"}
                fontSize={shape.fontSize || 14}
              >
                {shape.text}
              </text>
            )}
          </svg>
          {isSelected && renderResizeHandles(shape.id, onResizeStart)}
          {isSelected && renderRotationHandle(shape.id, shape.width, onRotateStart)}
        </div>
      )
      return diamEl
    }
    case "line": {
      const lineEl = (
        <div
          key={shape.id}
          style={style}
          onMouseDown={handleMouseDown}
          onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
        >
          <svg width={shape.width} height={shape.height} role="img" aria-label="Line">
            <title>Line</title>
            {defsEl}
            <line
              x1={0}
              y1={0}
              x2={shape.width}
              y2={shape.height}
              stroke={coreProps.stroke}
              strokeWidth={coreProps.strokeWidth || 2}
            />
          </svg>
          {isSelected && renderResizeHandles(shape.id, onResizeStart)}
          {isSelected && renderRotationHandle(shape.id, shape.width, onRotateStart)}
        </div>
      )
      return lineEl
    }
    case "arrow": {
      const arrowEl = (
        <div
          key={shape.id}
          style={style}
          onMouseDown={handleMouseDown}
          onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
        >
          <svg width={shape.width} height={shape.height} role="img" aria-label="Arrow">
            <title>Arrow</title>
            <defs>
              <marker
                id={`arrow-${shape.id}`}
                markerWidth={10}
                markerHeight={10}
                refX={9}
                refY={3}
                orient="auto"
              >
                <path d="M0,0 L10,3 L0,6" fill={coreProps.stroke} />
              </marker>
              {hasGradient && shape.gradientFill && renderGradientSvg(shape.gradientFill, shape.id)}
              {hasShadow && shape.shadow && shadowToFilter(shape.shadow, shape.id)}
            </defs>
            <line
              x1={0}
              y1={shape.height / 2}
              x2={shape.width - 5}
              y2={shape.height / 2}
              stroke={coreProps.stroke}
              strokeWidth={coreProps.strokeWidth || 2}
              markerEnd={`url(#arrow-${shape.id})`}
            />
          </svg>
          {isSelected && renderResizeHandles(shape.id, onResizeStart)}
          {isSelected && renderRotationHandle(shape.id, shape.width, onRotateStart)}
        </div>
      )
      return arrowEl
    }
    case "connector":
      if (shape.connector) {
        return (
          <div
            key={shape.id}
            style={style}
            onMouseDown={handleMouseDown}
            onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
          >
            {renderConnectorSvg(
              shape.connector,
              shape.width,
              shape.height,
              coreProps.stroke,
              coreProps.strokeWidth || 2,
            )}
            {isSelected && renderResizeHandles(shape.id, onResizeStart)}
            {isSelected && renderRotationHandle(shape.id, shape.width, onRotateStart)}
          </div>
        )
      }
      return null
    case "textbox": {
      const tbEl = (
        <div
          key={shape.id}
          style={{
            ...style,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: shape.fillColor || "transparent",
          }}
          onMouseDown={handleMouseDown}
          onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
        >
          <span
            style={{
              color: shape.fontColor || "#333",
              fontSize: shape.fontSize || 14,
              textAlign: "center",
              userSelect: "none",
            }}
          >
            {shape.text || "Text"}
          </span>
          {isSelected && renderResizeHandles(shape.id, onResizeStart)}
          {isSelected && renderRotationHandle(shape.id, shape.width, onRotateStart)}
        </div>
      )
      return tbEl
    }
    case "image": {
      const imgEl = (
        <div
          key={shape.id}
          style={style}
          onMouseDown={handleMouseDown}
          onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
        >
          <img
            src={shape.imageData?.src}
            alt={shape.imageData?.alt || ""}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              pointerEvents: "none",
            }}
            draggable={false}
          />
          {isSelected && renderResizeHandles(shape.id, onResizeStart)}
          {isSelected && renderRotationHandle(shape.id, shape.width, onRotateStart)}
        </div>
      )
      return imgEl
    }
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

function renderRotationHandle(
  shapeId: string,
  _width: number,
  onRotateStart?: (e: React.MouseEvent, shapeId: string) => void,
): JSX.Element {
  const top = -ROTATION_HANDLE_OFFSET
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: "calc(50% - 0.5px)",
          top: -(ROTATION_HANDLE_OFFSET - HANDLE_SIZE / 2),
          width: 1,
          height: ROTATION_HANDLE_OFFSET - HANDLE_SIZE / 2,
          backgroundColor: "var(--wo-prese-accent)",
          pointerEvents: "none",
          zIndex: 1000,
        }}
      />
      <div
        className="prese-canvas-rotate-handle"
        data-shape-id={shapeId}
        style={{
          position: "absolute",
          left: "50%",
          top,
          width: HANDLE_SIZE + 4,
          height: HANDLE_SIZE + 4,
          marginLeft: -(HANDLE_SIZE + 4) / 2,
          marginTop: -(HANDLE_SIZE + 4) / 2,
          backgroundColor: "white",
          border: "2px solid var(--wo-prese-accent)",
          borderRadius: "50%",
          cursor: "grab",
          zIndex: 1001,
        }}
        onMouseDown={(e) => {
          e.stopPropagation()
          onRotateStart?.(e, shapeId)
        }}
      />
    </>
  )
}

function InlineEditOverlay({
  shape,
  initialText,
  onSave,
  onCancel,
  onUpdate,
}: {
  shape: ShapeData | undefined
  initialText: string
  onSave: () => void
  onCancel: () => void
  onUpdate: (t: string) => void
}): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  // Set initial content and focus on mount
  useEffect(() => {
    if (ref.current && !mounted) {
      ref.current.textContent = initialText
      ref.current.focus()
      // Place cursor at end
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(ref.current)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
      setMounted(true)
    }
  }, [initialText, mounted])

  if (!shape) return null

  return (
    <div
      className="prese-canvas-inline-edit"
      style={{
        position: "absolute",
        left: shape.x,
        top: shape.y,
        width: shape.width,
        height: shape.height,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "auto",
      }}
    >
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="prese-canvas-inline-edit-field"
        style={{
          width: "100%",
          height: "100%",
          outline: "2px solid var(--wo-prese-accent, #4a90d9)",
          outlineOffset: "-1px",
          backgroundColor: "rgba(255,255,255,0.95)",
          color: shape.fontColor || "#333",
          fontSize: shape.fontSize || 14,
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px",
          boxSizing: "border-box",
          cursor: "text",
          overflow: "hidden",
          borderRadius: "2px",
        }}
        onBlur={onSave}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            onCancel()
          }
        }}
        onInput={(e) => {
          onUpdate(e.currentTarget.textContent || "")
        }}
      />
    </div>
  )
}

const ObservedSlideCanvas = observer(function ObservedSlideCanvas(): JSX.Element {
  interface DragState {
    shapeIds: string[]
    startX: number
    startY: number
    origins: Array<{ id: string; x: number; y: number }>
  }
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<{
    shapeId: string
    handle: string
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)
  const rotateRef = useRef<{
    shapeId: string
    startX: number
    startY: number
    origAngle: number
    cx: number
    cy: number
  } | null>(null)
  const svgRef = useRef<HTMLDivElement>(null)
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [isSvgLoading, setIsSvgLoading] = useState(false)
  const onDragStart = useCallback((e: React.MouseEvent, shapeId: string) => {
    const slide = presentationStore.slides[presentationStore.currentSlide]
    // Determine which shapes to drag: if the clicked shape is part of multi-selection, drag all selected
    const selectedSet = new Set(presentationStore.selectedShapeIds)
    const shapeIds = selectedSet.has(shapeId) ? presentationStore.selectedShapeIds : [shapeId]
    const origins = shapeIds
      .map((id) => {
        const s = slide?.shapes?.find((sh) => sh.id === id)
        return s ? { id, x: s.x, y: s.y } : null
      })
      .filter((o): o is { id: string; x: number; y: number } => o !== null)
    dragRef.current = {
      shapeIds,
      startX: e.clientX,
      startY: e.clientY,
      origins,
    }
  }, [])

  const handleInlineDoubleClick = useCallback((shapeId: string) => {
    presentationStore.startInlineEdit(shapeId)
  }, [])

  const onRotateStart = useCallback((e: React.MouseEvent, shapeId: string) => {
    const shape = presentationStore.slides[presentationStore.currentSlide]?.shapes?.find(
      (s) => s.id === shapeId,
    )
    if (!shape) return
    const slideEl = e.currentTarget.closest('[class*="prese-canvas-slide"]') as HTMLElement | null
    if (!slideEl) return
    const slideRect = slideEl.getBoundingClientRect()
    const scale = presentationStore.zoomLevel / 100
    const cx = slideRect.left + (shape.x + shape.width / 2) * scale
    const cy = slideRect.top + (shape.y + shape.height / 2) * scale
    rotateRef.current = {
      shapeId,
      startX: e.clientX,
      startY: e.clientY,
      origAngle: shape.rotation || 0,
      cx,
      cy,
    }
  }, [])

  const onResizeStartCB = useCallback((e: React.MouseEvent, shapeId: string, handle: string) => {
    const shape = presentationStore.slides[presentationStore.currentSlide]?.shapes?.find(
      (s) => s.id === shapeId,
    )
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
      const { origins, startX, startY } = dragRef.current
      const dx = (e.clientX - startX) / (presentationStore.zoomLevel / 100)
      const dy = (e.clientY - startY) / (presentationStore.zoomLevel / 100)
      // Use moveShapes for transient drag (no snapshot) — snapshot pushed on mouseup
      const shapeIds = origins.map((o) => o.id)
      presentationStore.moveShapes(presentationStore.currentSlide, shapeIds, dx, dy)
    }
    if (resizeRef.current) {
      const { shapeId, handle, startX, startY, origX, origY, origW, origH } = resizeRef.current
      const dx = (e.clientX - startX) / (presentationStore.zoomLevel / 100)
      const dy = (e.clientY - startY) / (presentationStore.zoomLevel / 100)
      let newX = origX
      let newY = origY
      let newW = origW
      let newH = origH
      if (handle.includes("e")) newW = Math.max(20, origW + dx)
      if (handle.includes("w")) {
        newX = origX + dx
        newW = Math.max(20, origW - dx)
      }
      if (handle.includes("s")) newH = Math.max(20, origH + dy)
      if (handle.includes("n")) {
        newY = origY + dy
        newH = Math.max(20, origH - dy)
      }
      presentationStore.updateShape(presentationStore.currentSlide, shapeId, {
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newW),
        height: Math.round(newH),
      })
    }
    if (rotateRef.current) {
      const { shapeId, startX, startY, origAngle, cx, cy } = rotateRef.current
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI)
      // Account for the initial drag angle so we rotate relative to original position
      const startAngle = Math.atan2(startY - cy, startX - cx) * (180 / Math.PI)
      const deltaAngle = angle - startAngle
      const newAngle = (((origAngle + deltaAngle) % 360) + 360) % 360
      presentationStore.updateShape(presentationStore.currentSlide, shapeId, {
        rotation: Math.round(newAngle),
      })
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    if (dragRef.current && dragRef.current.origins.length > 0) {
      // Push a single snapshot after transient multi-drag ends
      const { shapeIds } = dragRef.current
      const slide = presentationStore.slides[presentationStore.currentSlide]
      if (slide) {
        // Use the first shape's move to trigger a snapshot (moveShape pushes snapshot)
        if (shapeIds.length > 0) {
          const first = slide.shapes.find((s) => s.id === shapeIds[0])
          if (first) {
            presentationStore.moveShape(
              presentationStore.currentSlide,
              shapeIds[0],
              first.x,
              first.y,
            )
          }
        }
      }
    }
    dragRef.current = null
    resizeRef.current = null
    rotateRef.current = null
  }, [])

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const {
    slides,
    currentSlide,
    zoomLevel,
    slideSize,
    isPreviewPlaying,
    previewStep,
    selectedShapeIds,
    editingShapeId,
  } = presentationStore
  const slide = slides[currentSlide]

  const bgStyle = slide?.background
    ? (() => {
        // biome-ignore lint/style/noNonNullAssertion: guarded by ternary condition above
        const bg = slide.background!
        if (bg.type === "none") return {}
        if (bg.type === "solid") return { backgroundColor: bg.color || "#ffffff" }
        if (bg.type === "gradient" && bg.gradientStops?.length) {
          const stops = bg.gradientStops.map((s) => `${s.color} ${s.position * 100}%`).join(", ")
          return {
            background: `linear-gradient(${bg.gradientAngle || 0}deg, ${stops})`,
          }
        }
        if (bg.type === "image" && bg.imageData) {
          return {
            backgroundImage: `url(${bg.imageData})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        }
        return {}
      })()
    : {}

  useEffect(() => {
    if (!slide || !isPreviewPlaying) return
    const anim = slide.animations?.[previewStep]
    if (!anim) return
    const delay = (anim.duration + anim.delay) * 1000
    const timer = setTimeout(() => {
      presentationStore.nextPreviewStep()
    }, delay)
    return () => clearTimeout(timer)
  }, [isPreviewPlaying, previewStep, slide, slide?.animations])

  // Load SVG when format=svg is requested
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadSvg inner function captures presentationStore
  useEffect(() => {
    if (
      presentationStore.format !== "svg" ||
      !presentationStore.isDocReady ||
      !presentationStore.wopiFileId
    )
      return

    setIsSvgLoading(true)
    setSvgContent(null)

    const loadSvg = async () => {
      try {
        const conn =
          presentationStore.wopiFileId &&
          presentationStore.wopiAccessToken &&
          presentationStore.docserverBase
            ? {
                wopiFileId: presentationStore.wopiFileId,
                wopiAccessToken: presentationStore.wopiAccessToken,
                docserverBase: presentationStore.docserverBase,
              }
            : null
        if (!conn) return
        const { content } = await loadDocument({
          // biome-ignore lint/style/noNonNullAssertion: guarded by !conn check above
          wopiFileId: conn.wopiFileId!,
          // biome-ignore lint/style/noNonNullAssertion: guarded by !conn check above
          wopiAccessToken: conn.wopiAccessToken!,
          docserverBase: conn.docserverBase,
          format: "svg",
        })
        const text = await content.text()
        setSvgContent(text)
      } catch (err) {
        console.error("Failed to load SVG:", err)
      } finally {
        setIsSvgLoading(false)
      }
    }

    loadSvg()
  }, [
    presentationStore.format,
    presentationStore.isDocReady,
    presentationStore.wopiFileId,
    presentationStore.wopiAccessToken,
    presentationStore.docserverBase,
  ])

  if (!slide) return <div className="prese-canvas-empty">No slides</div>

  const aspectRatio = slideSize === "widescreen" ? 16 / 9 : 4 / 3
  const baseWidth = 960
  const baseHeight = baseWidth / aspectRatio
  const scale = zoomLevel / 100
  const canvasWidth = baseWidth * scale
  const canvasHeight = baseHeight * scale

  const previewAnim = isPreviewPlaying && slide.animations?.[previewStep]
  const previewAnimClass = previewAnim ? `prese-anim-${effectToCssClass(previewAnim.effect)}` : ""
  const previewExitClass =
    previewStep > 0 && slide.animations?.[previewStep - 1]?.category === "exit"
      ? "prese-anim-exit"
      : ""
  const previewClass = previewAnim
    ? `prese-canvas-slide ${previewAnimClass} ${previewExitClass}`.trim()
    : "prese-canvas-slide"

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (
      e.target === e.currentTarget ||
      (e.target as HTMLElement).classList.contains("prese-canvas-background")
    ) {
      presentationStore.deselectAllShapes()
    }
  }

  const handleCanvasKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      presentationStore.deselectAllShapes()
    }
  }

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return
      const rect = e.currentTarget.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const scale = zoomLevel / 100
      const x = Math.round(screenX / scale)
      const y = Math.round(screenY / scale)
      presentationStore.lastCursorX = x
      presentationStore.lastCursorY = y
      presentationStore.notifyCursorMove()
    },
    [zoomLevel],
  )

  const handlePointerLeave = useCallback(() => {
    presentationStore.lastCursorX = null
    presentationStore.lastCursorY = null
    presentationStore.notifyCursorMove()
  }, [])

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
        onKeyDown={handleCanvasKeyDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <div className="prese-canvas-background" style={bgStyle} />

        {slide.layout === "title" && (
          <div className="prese-canvas-placeholder prese-canvas-placeholder-title">
            <div
              className="prese-canvas-placeholder-text"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) =>
                presentationStore.setSlideTitle(currentSlide, e.currentTarget.textContent || "")
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
                  presentationStore.setSlideTitle(currentSlide, e.currentTarget.textContent || "")
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
                presentationStore.setSlideTitle(currentSlide, e.currentTarget.textContent || "")
              }
            >
              {slide.title || "Click to add title"}
            </div>
          </div>
        )}

        {presentationStore.format === "svg" ? (
          <div
            className="prese-canvas-slide"
            style={{
              width: `${canvasWidth}px`,
              height: `${canvasHeight}px`,
            }}
          >
            {isSvgLoading ? (
              <div className="prese-canvas-empty">Loading SVG...</div>
            ) : svgContent ? (
              <div
                ref={svgRef}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: required for SVG rendering from server
                dangerouslySetInnerHTML={{ __html: svgContent }}
                style={{
                  width: "100%",
                  height: "100%",
                }}
              />
            ) : (
              <div className="prese-canvas-empty">No SVG content</div>
            )}
          </div>
        ) : (
          slide.shapes?.map((shape) =>
            renderShape(
              shape,
              selectedShapeIds.includes(shape.id),
              onDragStart,
              onResizeStartCB,
              handleInlineDoubleClick,
              onRotateStart,
            ),
          )
        )}

        {/* Inline text editing overlay */}
        {editingShapeId && (
          <InlineEditOverlay
            shape={slide.shapes?.find((s) => s.id === editingShapeId)}
            initialText={presentationStore.inlineEditText}
            onSave={() => presentationStore.endInlineEdit()}
            onCancel={() => {
              presentationStore.editingShapeId = null
              presentationStore.inlineEditText = ""
            }}
            onUpdate={(t) => presentationStore.updateInlineText(t)}
          />
        )}

        {slide.notes && (
          <div className="prese-canvas-notes-indicator" title={slide.notes}>
            📝
          </div>
        )}

        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
          }}
        >
          <CollaborativeCursors />
        </div>
      </div>
    </div>
  )
})

export const SlideCanvas = ObservedSlideCanvas
