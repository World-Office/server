// WasmRenderer — canvas rendering bridge for wo-renderer-wasm
//
// This module provides the integration surface that will eventually call
// into wo-renderer-wasm's render_page(). For now it draws a realistic
// document preview (white page with margins, simulated text lines, and
// a page number) directly on an HTML5 Canvas.
//
// TODO: Connect to wo-renderer-wasm render_page() when WASM is bundled

/** Dimensions of an A4 page in points (1 point = 1/72 inch). */
const PAGE_WIDTH_PT = 595
const PAGE_HEIGHT_PT = 842
const MARGIN_PT = 72
const CONTENT_TOP_PT = MARGIN_PT + 20
const LINE_HEIGHT_PT = 16
const CHAR_WIDTH_PT = 7.2

/** Canvas pixel density for crisp rendering. */
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1

interface RendererState {
  canvas: HTMLCanvasElement | null
  ctx: CanvasRenderingContext2D | null
  totalPages: number
}

const state: RendererState = {
  canvas: null,
  ctx: null,
  totalPages: 3,
}

/** Seeded pseudo-random for deterministic line widths per page. */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

function drawPage(pageIndex: number): void {
  const { ctx, canvas, totalPages } = state
  if (!ctx || !canvas) return

  ctx.save()
  ctx.scale(DPR, DPR)
  ctx.clearRect(0, 0, PAGE_WIDTH_PT, PAGE_HEIGHT_PT)

  // Page background
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, PAGE_WIDTH_PT, PAGE_HEIGHT_PT)

  // Page shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)"
  ctx.fillRect(2, 2, PAGE_WIDTH_PT, PAGE_HEIGHT_PT)

  // Re-draw page on top of shadow
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, PAGE_WIDTH_PT, PAGE_HEIGHT_PT)

  // Margins guide (very subtle)
  ctx.strokeStyle = "rgba(0, 0, 0, 0.03)"
  ctx.lineWidth = 0.5
  ctx.strokeRect(
    MARGIN_PT,
    MARGIN_PT,
    PAGE_WIDTH_PT - 2 * MARGIN_PT,
    PAGE_HEIGHT_PT - 2 * MARGIN_PT,
  )

  // Draw simulated document content
  const rng = seededRandom(pageIndex * 1000 + 42)
  const contentWidth = PAGE_WIDTH_PT - 2 * MARGIN_PT
  let y = CONTENT_TOP_PT

  // Title block on first page
  if (pageIndex === 0) {
    ctx.fillStyle = "#1a1a2e"
    ctx.font = "bold 22pt 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    ctx.fillText("World Office Document", MARGIN_PT, y)
    y += LINE_HEIGHT_PT * 2.2

    ctx.fillStyle = "#666666"
    ctx.font = "11pt 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    ctx.fillText("Sample document rendered via Canvas", MARGIN_PT, y)
    y += LINE_HEIGHT_PT * 1.8

    // Horizontal rule
    ctx.strokeStyle = "#cccccc"
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(MARGIN_PT, y)
    ctx.lineTo(PAGE_WIDTH_PT - MARGIN_PT, y)
    ctx.stroke()
    y += LINE_HEIGHT_PT * 1.5
  }

  // Paragraph text lines
  ctx.fillStyle = "#333333"
  ctx.font = "11pt 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"

  const pageBottom = PAGE_HEIGHT_PT - MARGIN_PT - 30
  let paraGap = 0

  while (y < pageBottom) {
    paraGap++
    if (paraGap > 6 && rng() > 0.6) {
      y += LINE_HEIGHT_PT * 1.2
      paraGap = 0
      continue
    }

    // Simulate paragraph indentation for first line
    const indent = paraGap === 1 ? 24 : 0

    // Line width varies randomly to simulate natural text
    const lineWidth = contentWidth * (0.65 + rng() * 0.33) - indent
    const lineLen = Math.floor(lineWidth / CHAR_WIDTH_PT)

    // Generate a pseudo-text line from repeated chars
    const chars = "abcdefghijklmnopqrstuvwxyz"
    let text = ""
    for (let i = 0; i < lineLen; i++) {
      text += chars[Math.floor(rng() * chars.length)]
      if (rng() < 0.15) text += " "
    }
    text = text.charAt(0).toUpperCase() + text.slice(1)

    ctx.fillText(text, MARGIN_PT + indent, y)
    y += LINE_HEIGHT_PT
  }

  // Page number at bottom center
  ctx.fillStyle = "#888888"
  ctx.font = "9pt 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
  ctx.textAlign = "center"
  ctx.fillText(
    `${pageIndex + 1} / ${totalPages}`,
    PAGE_WIDTH_PT / 2,
    PAGE_HEIGHT_PT - MARGIN_PT / 2 + 10,
  )
  ctx.textAlign = "start"

  // Page border
  ctx.strokeStyle = "#dddddd"
  ctx.lineWidth = 0.5
  ctx.strokeRect(0, 0, PAGE_WIDTH_PT, PAGE_HEIGHT_PT)

  ctx.restore()
}

/** Initialize the renderer with a canvas element. */
export function init(canvas: HTMLCanvasElement): void {
  state.canvas = canvas
  state.ctx = canvas.getContext("2d", { alpha: false })

  if (state.ctx) {
    const logicalWidth = PAGE_WIDTH_PT
    const logicalHeight = PAGE_HEIGHT_PT
    canvas.width = logicalWidth * DPR
    canvas.height = logicalHeight * DPR
    canvas.style.width = `${logicalWidth}px`
    canvas.style.height = `${logicalHeight}px`
  }
}

/** Render a specific page with the given zoom level (1 = 100%). */
export function renderPage(pageIndex: number, zoom: number): void {
  if (!state.canvas || !state.ctx) return

  const clampedPage = Math.max(0, Math.min(pageIndex, state.totalPages - 1))
  const scale = zoom / 100

  state.canvas.style.width = `${PAGE_WIDTH_PT * scale}px`
  state.canvas.style.height = `${PAGE_HEIGHT_PT * scale}px`

  drawPage(clampedPage)
}

/** Set total page count (called after document load). */
export function setTotalPages(count: number): void {
  state.totalPages = Math.max(1, count)
}

/** Get the total page count. */
export function getTotalPages(): number {
  return state.totalPages
}
