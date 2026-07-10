import { observer } from "mobx-react-lite"
import { type JSX, useCallback, useMemo, useRef } from "react"
import { flowchartStore } from "../stores/FlowchartStore"

const MAP_WIDTH = 160
const MAP_HEIGHT = 120
const PAD = 8
const BG = "#ffffff"
const BORDER = "#d0d0d0"
const NODE_FILL = "#cccccc"
const NODE_STROKE = "#999999"
const VIEWPORT_STROKE = "#4472c4"
const VIEWPORT_FILL = "rgba(68, 114, 196, 0.08)"

export const MiniMap = observer(function MiniMap({
  containerWidth,
  containerHeight,
}: { containerWidth: number; containerHeight: number }): JSX.Element | null {
  const store = flowchartStore
  const svgRef = useRef<SVGSVGElement>(null)

  const { nodes, edges } = store.document
  const hasContent = nodes.length > 0

  const bounds = useMemo(() => {
    if (!hasContent) return { minX: 0, minY: 0, maxX: 800, maxY: 600, w: 800, h: 600 }
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const n of nodes) {
      if (n.x < minX) minX = n.x
      if (n.y < minY) minY = n.y
      if (n.x + n.width > maxX) maxX = n.x + n.width
      if (n.y + n.height > maxY) maxY = n.y + n.height
    }
    minX -= PAD
    minY -= PAD
    maxX += PAD
    maxY += PAD
    return { minX, minY, maxX, maxY, w: maxX - minX || 1, h: maxY - minY || 1 }
  }, [nodes, hasContent])

  const scaleX = (MAP_WIDTH - 8) / bounds.w
  const scaleY = (MAP_HEIGHT - 8) / bounds.h
  const scale = Math.min(scaleX, scaleY, 1)
  const offsetX = (MAP_WIDTH - bounds.w * scale) / 2 - bounds.minX * scale
  const offsetY = (MAP_HEIGHT - bounds.h * scale) / 2 - bounds.minY * scale

  const tx = (x: number) => x * scale + offsetX
  const ty = (y: number) => y * scale + offsetY

  // Viewport rectangle
  const vp = useMemo(() => {
    const ox = store.canvasOffset.x
    const oy = store.canvasOffset.y
    const txi = (x: number) => x * scale + offsetX
    const tyi = (y: number) => y * scale + offsetY
    return {
      x: txi(ox),
      y: tyi(oy),
      w: containerWidth * scale,
      h: containerHeight * scale,
    }
  }, [
    store.canvasOffset.x,
    store.canvasOffset.y,
    containerWidth,
    containerHeight,
    scale,
    offsetX,
    offsetY,
  ])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const mx = (e.clientX - rect.left) / scale - offsetX / scale
      const my = (e.clientY - rect.top) / scale - offsetY / scale
      store.canvasOffset = {
        x: mx - containerWidth / 2,
        y: my - containerHeight / 2,
      }
    },
    [store, scale, offsetX, offsetY, containerWidth, containerHeight],
  )

  if (!hasContent) return null

  return (
    <div
      style={{
        position: "absolute",
        bottom: 8,
        right: 8,
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        border: `1px solid ${BORDER}`,
        borderRadius: 4,
        background: BG,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        overflow: "hidden",
        zIndex: 10,
        cursor: "crosshair",
      }}
    >
      <svg
        ref={svgRef}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleClick(e as unknown as React.MouseEvent)
        }}
        role="img"
        aria-label="Mini map"
      >
        {/* Edges as thin lines */}
        {edges.map((edge) => {
          const src = nodes.find((n) => n.id === edge.sourceId)
          const tgt = nodes.find((n) => n.id === edge.targetId)
          if (!src || !tgt) return null
          return (
            <line
              key={edge.id}
              x1={tx(src.x + src.width / 2)}
              y1={ty(src.y + src.height / 2)}
              x2={tx(tgt.x + tgt.width / 2)}
              y2={ty(tgt.y + tgt.height / 2)}
              stroke="#bbb"
              strokeWidth={0.5}
            />
          )
        })}

        {/* Nodes as small rects */}
        {nodes.map((node) => (
          <rect
            key={node.id}
            x={tx(node.x)}
            y={ty(node.y)}
            width={Math.max(2, node.width * scale)}
            height={Math.max(2, node.height * scale)}
            fill={NODE_FILL}
            stroke={NODE_STROKE}
            strokeWidth={0.5}
            rx={1}
          />
        ))}

        {/* Viewport indicator */}
        <rect
          x={vp.x}
          y={vp.y}
          width={Math.max(4, vp.w)}
          height={Math.max(4, vp.h)}
          fill={VIEWPORT_FILL}
          stroke={VIEWPORT_STROKE}
          strokeWidth={1}
          pointerEvents="none"
        />
      </svg>
    </div>
  )
})
