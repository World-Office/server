/**
 * WasmRenderer — canvas rendering bridge for wo-renderer-wasm
 *
 * Dynamically loads the WASM rendering engine and renders document pages
 * to HTML5 Canvas elements. Falls back to a placeholder when the WASM
 * module is not available.
 *
 * This module provides the bridge between the TypeScript frontend and
 * the Rust WASM rendering engine. For interactive editing (ONLYOFFICE
 * style), use the newer CanvasEditor component instead.
 */

/** API surface exposed by wo-renderer-wasm after wasm-pack build. */
export interface WasmRenderApi {
  /** Async wasm loader (wasm-bindgen web target default export). */
  default?: () => Promise<void>
  init(): void
  // Basic canvas operations
  create_canvas(width: number, height: number): number
  render_rect(handle: number, x: number, y: number, w: number, h: number, color: string): void
  render_text(
    handle: number,
    text: string,
    x: number,
    y: number,
    color?: string | null,
    size?: number | null,
  ): void
  get_pixel_data(handle: number): Uint8Array
  get_canvas_size(handle: number): string
  flush_to_canvas(handle: number, canvas_id: string): void
  clear_canvas(handle: number): void
  release_canvas(handle: number): void
  // Static page rendering (legacy)
  render_page(
    docBytes: Uint8Array,
    format: string,
    width?: number | null,
    height?: number | null,
  ): number
  // New: document-level operations (CanvasEditor)
  create_document(docBytes: Uint8Array, format: string): number
  layout_document(
    docHandle: number,
    pageSize: string,
    orientation: string,
    marginPt: number,
  ): string
  render_laid_out_page(docHandle: number, pageIndex: number, canvasHandle: number): void
  release_document(docHandle: number): void
  // Interactive editing (Phase 2)
  handle_key_event(
    docHandle: number,
    key: string,
    ctrl: boolean,
    shift: boolean,
    pageSize: string,
    orientation: string,
    marginPt: number,
  ): string
  handle_mouse_event(docHandle: number, pageIndex: number, x: number, y: number): string
  serialize_document(docHandle: number): Uint8Array
  get_cursor_position(docHandle: number): string
  // Formatting (Phase 4)
  apply_formatting(
    docHandle: number,
    formatJson: string,
    pageSize: string,
    orientation: string,
    marginPt: number,
  ): string
  get_run_formatting(docHandle: number): string
}

let wasmApi: WasmRenderApi | null = null
let loadAttempted = false
let loadingPromise: Promise<boolean> | null = null

/**
 * Attempt to load the WASM rendering module.
 * Returns true on success, false if unavailable (pkg not built yet).
 * Safe to call multiple times — subsequent calls return cached result.
 */
export async function loadWasmRenderer(): Promise<boolean> {
  if (wasmApi) return true
  if (loadAttempted) return false
  if (loadingPromise) return loadingPromise

  loadAttempted = true
  loadingPromise = (async () => {
    try {
      const mod = (await import(
        /* @vite-ignore */
        "@world-office/wo-renderer-wasm"
      )) as unknown as WasmRenderApi
      if (typeof mod.default === "function") {
        await mod.default()
      }
      mod.init()
      wasmApi = mod
      console.info("[WasmRenderer] WASM module loaded")
      return true
    } catch (err) {
      // WASM module not built — graceful degradation, not an error
      console.info("[WasmRenderer] WASM renderer not available, using HTML fallback")
      return false
    } finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}

/** Check whether the WASM renderer was loaded successfully. */
export function isWasmReady(): boolean {
  return wasmApi !== null
}

/** Get the raw WASM API object for advanced use (CanvasEditor). */
export function getWasmApi(): WasmRenderApi | null {
  return wasmApi
}

/**
 * Render a document page to a canvas element.
 *
 * For supported formats (currently docx), uses the WASM renderer.
 * For unsupported formats or when WASM is unavailable, draws a
 * placeholder with a clear message.
 *
 * @returns `true` if real content was rendered, `false` if placeholder was used
 */
export function renderDocumentToCanvas(
  docBytes: Uint8Array,
  format: string,
  canvas: HTMLCanvasElement,
  width = 794, // A4 at 96 DPI
  height = 1123,
): boolean {
  if (!wasmApi || !["docx"].includes(format)) {
    renderPlaceholder(canvas, width, height, format, wasmApi === null)
    return false
  }

  let handle = -1
  try {
    handle = wasmApi.render_page(docBytes, format, width, height)
    if (typeof handle !== "number" || handle <= 0) {
      console.error("[WasmRenderer] render_page returned invalid handle:", handle)
      renderPlaceholder(canvas, width, height, format, false)
      return false
    }

    const pixels = wasmApi.get_pixel_data(handle)
    const ctx = canvas.getContext("2d")
    if (ctx && pixels.length === width * height * 4) {
      canvas.width = width
      canvas.height = height
      const imageData = new ImageData(
        new Uint8ClampedArray(pixels.buffer as ArrayBuffer, pixels.byteOffset, pixels.byteLength),
        width,
        height,
      )
      ctx.putImageData(imageData, 0, 0)
    }
    return true
  } catch (err) {
    console.error("[WasmRenderer] render_page failed:", err)
    renderPlaceholder(canvas, width, height, format, false)
    return false
  } finally {
    if (handle > 0) {
      try {
        wasmApi.release_canvas(handle)
      } catch {
        // Best-effort cleanup
      }
    }
  }
}

/** Supported document formats for canvas rendering (vs Monaco text). */
export const CANVAS_FORMATS = new Set(["docx"])

/** Check if a file extension should be rendered via canvas instead of Monaco. */
export function isCanvasFormat(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop() ?? ""
  return CANVAS_FORMATS.has(ext)
}

function renderPlaceholder(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  format: string,
  wasmNotBuilt: boolean,
): void {
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = "rgba(0, 0, 0, 0.06)"
  ctx.fillRect(3, 3, width, height)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = "#dddddd"
  ctx.lineWidth = 0.5
  ctx.strokeRect(0, 0, width, height)
  ctx.textAlign = "center"

  if (wasmNotBuilt) {
    ctx.fillStyle = "#666666"
    ctx.font = "bold 16px sans-serif"
    ctx.fillText("Document rendering not available", width / 2, height / 2 - 40)
    ctx.fillStyle = "#888888"
    ctx.font = "13px sans-serif"
    ctx.fillText(
      `The WASM renderer for .${format.toUpperCase()} files has not been built yet.`,
      width / 2,
      height / 2 - 10,
    )
  } else {
    ctx.fillStyle = "#666666"
    ctx.font = "bold 16px sans-serif"
    ctx.fillText(`Rendering for .${format} is not yet supported`, width / 2, height / 2 - 20)
    ctx.fillStyle = "#888888"
    ctx.font = "13px sans-serif"
    ctx.fillText(
      "Only DOCX format is currently supported by the WASM renderer.",
      width / 2,
      height / 2 + 10,
    )
  }

  ctx.textAlign = "start"
}
