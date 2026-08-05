// WasmRenderer — canvas rendering bridge for wo-renderer-wasm (Editor Shell)
//
// This module provides the integration surface that will eventually call
// into wo-renderer-wasm's render_page(). For now it draws a document
// preview with toolbar/menu chrome directly on an HTML5 Canvas.
//
// Note: When wo-renderer-wasm is bundled, replace renderEditorPreview()
// with a call to the WASM render_page() function.

/** Page dimensions in CSS pixels. */
const PAGE_WIDTH = 680
const PAGE_HEIGHT = 880

/** Chrome (toolbar/statusbar) heights in CSS pixels. */
const TOOLBAR_HEIGHT = 40
const STATUSBAR_HEIGHT = 28

/** Canvas pixel density for crisp rendering. */
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1

interface RendererState {
  canvas: HTMLCanvasElement | null
  ctx: CanvasRenderingContext2D | null
}

const state: RendererState = {
  canvas: null,
  ctx: null,
}

function drawPreview(): void {
  const { ctx } = state
  if (!ctx) return

  const totalHeight = TOOLBAR_HEIGHT + PAGE_HEIGHT + STATUSBAR_HEIGHT

  ctx.save()
  ctx.scale(DPR, DPR)
  ctx.clearRect(0, 0, PAGE_WIDTH, totalHeight)

  // Toolbar background
  ctx.fillStyle = "#f0f0f0"
  ctx.fillRect(0, 0, PAGE_WIDTH, TOOLBAR_HEIGHT)
  ctx.strokeStyle = "#d0d0d0"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, TOOLBAR_HEIGHT + 0.5)
  ctx.lineTo(PAGE_WIDTH, TOOLBAR_HEIGHT + 0.5)
  ctx.stroke()

  // Toolbar buttons
  const toolbarButtons = ["File", "Edit", "View", "Insert", "Format", "Tools"]
  ctx.font = "12px 'Segoe UI', Arial, sans-serif"
  ctx.textBaseline = "middle"
  let btnX = 12
  for (const label of toolbarButtons) {
    const metrics = ctx.measureText(label)
    const btnW = metrics.width + 16
    ctx.fillStyle = "#e0e0e0"
    ctx.fillRect(btnX, 6, btnW, TOOLBAR_HEIGHT - 12)
    ctx.strokeStyle = "#c0c0c0"
    ctx.lineWidth = 0.5
    ctx.strokeRect(btnX, 6, btnW, TOOLBAR_HEIGHT - 12)
    ctx.fillStyle = "#333333"
    ctx.textAlign = "center"
    ctx.fillText(label, btnX + btnW / 2, TOOLBAR_HEIGHT / 2)
    btnX += btnW + 4
  }
  ctx.textAlign = "start"

  // Page area background (gray workspace)
  ctx.fillStyle = "#e8e8e8"
  ctx.fillRect(0, TOOLBAR_HEIGHT, PAGE_WIDTH, PAGE_HEIGHT)

  // White page with shadow
  const pageMargin = 40
  const pageW = PAGE_WIDTH - 2 * pageMargin
  const pageH = PAGE_HEIGHT - 2 * pageMargin
  const pageX = pageMargin
  const pageY = TOOLBAR_HEIGHT + pageMargin

  ctx.fillStyle = "rgba(0, 0, 0, 0.06)"
  ctx.fillRect(pageX + 3, pageY + 3, pageW, pageH)

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(pageX, pageY, pageW, pageH)

  // Simulated text on page
  ctx.fillStyle = "#1a1a2e"
  ctx.font = "bold 18px 'Segoe UI', Arial, sans-serif"
  ctx.fillText("World Office", pageX + 40, pageY + 40)

  ctx.fillStyle = "#666666"
  ctx.font = "11px 'Segoe UI', Arial, sans-serif"
  ctx.fillText("Document Editor — Canvas Preview", pageX + 40, pageY + 62)

  ctx.strokeStyle = "#e0e0e0"
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(pageX + 40, pageY + 74)
  ctx.lineTo(pageX + pageW - 40, pageY + 74)
  ctx.stroke()

  // Simulated paragraph lines
  ctx.fillStyle = "#333333"
  ctx.font = "11px 'Segoe UI', Arial, sans-serif"
  let lineY = pageY + 96
  const lineGap = 18
  const lineWidths = [0.9, 0.85, 0.92, 0.78, 0, 0.88, 0.91, 0.83, 0.86, 0, 0.94, 0.79, 0.87, 0.91]

  for (const widthPct of lineWidths) {
    if (widthPct === 0) {
      lineY += lineGap * 0.6
      continue
    }
    const lw = (pageW - 80) * widthPct
    ctx.fillStyle = "#cccccc"
    ctx.fillRect(pageX + 40, lineY - 4, lw, 10)
    lineY += lineGap
  }

  // Page border
  ctx.strokeStyle = "#dddddd"
  ctx.lineWidth = 0.5
  ctx.strokeRect(pageX, pageY, pageW, pageH)

  // Status bar background
  ctx.fillStyle = "#f0f0f0"
  ctx.fillRect(0, TOOLBAR_HEIGHT + PAGE_HEIGHT, PAGE_WIDTH, STATUSBAR_HEIGHT)
  ctx.strokeStyle = "#d0d0d0"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, TOOLBAR_HEIGHT + PAGE_HEIGHT + 0.5)
  ctx.lineTo(PAGE_WIDTH, TOOLBAR_HEIGHT + PAGE_HEIGHT + 0.5)
  ctx.stroke()

  // Status bar text
  ctx.fillStyle = "#666666"
  ctx.font = "11px 'Segoe UI', Arial, sans-serif"
  ctx.fillText("Page 1 of 1", 12, TOOLBAR_HEIGHT + PAGE_HEIGHT + STATUSBAR_HEIGHT / 2)
  ctx.textAlign = "right"
  ctx.fillText("100%", PAGE_WIDTH - 12, TOOLBAR_HEIGHT + PAGE_HEIGHT + STATUSBAR_HEIGHT / 2)
  ctx.textAlign = "start"
  ctx.textBaseline = "alphabetic"

  ctx.restore()
}

/** Initialize the renderer with a canvas element. */
export function init(canvas: HTMLCanvasElement): void {
  state.canvas = canvas
  state.ctx = canvas.getContext("2d", { alpha: false })

  if (state.ctx) {
    const totalHeight = TOOLBAR_HEIGHT + PAGE_HEIGHT + STATUSBAR_HEIGHT
    canvas.width = PAGE_WIDTH * DPR
    canvas.height = totalHeight * DPR
    canvas.style.width = `${PAGE_WIDTH}px`
    canvas.style.height = `${totalHeight}px`
  }
}

/** Render the preview with the given zoom level (1 = 100%). */
export function renderPage(_pageIndex: number, zoom: number): void {
  if (!state.canvas || !state.ctx) return

  const scale = zoom / 100
  const totalHeight = TOOLBAR_HEIGHT + PAGE_HEIGHT + STATUSBAR_HEIGHT
  state.canvas.style.width = `${PAGE_WIDTH * scale}px`
  state.canvas.style.height = `${totalHeight * scale}px`

  drawPreview()
}
