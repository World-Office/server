/**
 * CanvasEditor — Canvas-based document editor (ONLYOFFICE-style)
 *
 * Replaces TipTap/ProseMirror for DOCX/ODT file editing.
 * Renders document pages directly to <canvas> elements using the
 * WASM rendering engine, avoiding the lossy HTML conversion pipeline.
 *
 * Architecture (matching ONLYOFFICE's approach):
 *   DOCX bytes → WASM engine → pixel buffer → <canvas>
 *                          ↑ native OOXML model, no HTML loss
 *
 * Phase 2 complete: Keyboard/mouse event handling, cursor rendering.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { getWasmApi, isWasmReady, loadWasmRenderer } from "../lib/wasm-renderer"

interface CanvasEditorProps {
  /** DOCX blob to render */
  docBlob: Blob
  /** File name (to detect format) */
  fileName: string
  /** Called when the document is modified (for save tracking) */
  onChange?: () => void
  /** Called to get the current document bytes for saving */
  onSerialize?: (bytes: Uint8Array) => void
}

interface PageInfo {
  width: number
  height: number
  marginPx: number
  index: number
}

interface CursorPos {
  page: number
  para: number
  line: number
  charIdx: number
  x: number
  y: number
}

/**
 * CanvasEditor renders a DOCX document as a series of <canvas> pages,
 * matching ONLYOFFICE's canvas-based editing approach.
 */
// Expose imperative methods via useImperativeHandle
// Use forwardRef so the parent can call applyFormatting, etc.
import { forwardRef, useImperativeHandle } from "react"

export interface CanvasEditorHandle {
  applyFormatting: (format: Record<string, unknown>) => void
}

// Named function gives forwardRef a proper displayName
const CanvasEditorInternal = (
  { docBlob, fileName, onChange: _onChange, onSerialize: _onSerialize }: CanvasEditorProps,
  ref: React.Ref<CanvasEditorHandle>,
) => {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<
    "loading-wasm" | "loading-doc" | "rendering" | "ready" | "error"
  >("loading-wasm")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pages, setPages] = useState<PageInfo[]>([])
  const docHandleRef = useRef<number | null>(null)
  const canvasHandlesRef = useRef<number[]>([])
  const cursorPosRef = useRef<CursorPos | null>(null)
  const blinkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cursorVisibleRef = useRef(true)

  // The wasm renderer accepts docx natively; odt blobs are converted to
  // docx in the DocumentStore load flow, so map odt→docx here too.
  const rawFormat = fileName.toLowerCase().split(".").pop() ?? ""
  const format = rawFormat === "odt" ? "docx" : rawFormat

  // ── Cursor blink ──────────────────────────────────────────────────
  useEffect(() => {
    blinkIntervalRef.current = setInterval(() => {
      cursorVisibleRef.current = !cursorVisibleRef.current
      drawCursorOverlay()
    }, 530)

    return () => {
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current)
      }
    }
  }, [])

  function drawCursorOverlay() {
    if (!cursorPosRef.current || !docHandleRef.current) return
    const api = getWasmApi()
    if (!api) return

    const cursor = cursorPosRef.current
    const canvasEl = canvasRefs.current[cursor.page]
    if (!canvasEl) return

    const ctx = canvasEl.getContext("2d")
    if (!ctx) return

    // Re-render the page to erase old cursor (piggyback on existing pixel data)
    // For cursor, just redraw the page
    const canvasHandle = canvasHandlesRef.current[cursor.page]
    if (canvasHandle === undefined) return

    const page = pages[cursor.page]
    if (!page) return

    // Redraw full page pixel data
    const pixels = api.get_pixel_data(canvasHandle)
    const imageData = new ImageData(
      new Uint8ClampedArray(pixels.buffer as ArrayBuffer, pixels.byteOffset, pixels.byteLength),
      page.width,
      page.height,
    )
    ctx.putImageData(imageData, 0, 0)

    // Draw blinking cursor
    if (cursorVisibleRef.current) {
      const cursorX = cursor.x
      const cursorY = cursor.y
      const cursorH = 18 // approximate cursor height
      ctx.fillStyle = "#333333"
      ctx.fillRect(cursorX, cursorY, 2, cursorH)
    }
  }

  // ── Step 1: Load WASM module ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function loadWasm() {
      setStatus("loading-wasm")
      await loadWasmRenderer()
      if (cancelled) return
      setStatus("loading-doc")
    }

    loadWasm()

    return () => {
      cancelled = true
      const api = getWasmApi()
      if (api && docHandleRef.current !== null) {
        try {
          api.release_document(docHandleRef.current)
        } catch {
          // Best-effort cleanup
        }
      }
      for (const h of canvasHandlesRef.current) {
        try {
          api?.release_canvas(h)
        } catch {
          // Best-effort cleanup
        }
      }
    }
  }, [])

  // ── Step 2: Parse and layout document ──────────────────────────────
  useEffect(() => {
    if (status !== "loading-doc" || !isWasmReady()) return

    let cancelled = false

    async function loadDocument() {
      try {
        const wasmApi = getWasmApi()
        if (!wasmApi) throw new Error("WASM renderer not available")
        const api = wasmApi
        const buffer = await docBlob.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        if (cancelled) return

        const docHandle = api.create_document(bytes, format)
        docHandleRef.current = docHandle

        const layoutJson = api.layout_document(docHandle, "A4", "portrait", 72.0)
        const layoutPages: PageInfo[] = JSON.parse(layoutJson).map(
          (p: { width: number; height: number; marginPx: number }, i: number) => ({
            width: p.width,
            height: p.height,
            marginPx: p.marginPx,
            index: i,
          }),
        )

        if (cancelled) return
        setPages(layoutPages)
        // Go straight to "ready" — the page canvases render in the ready
        // branch, so their refs exist when the render effect runs.
        setStatus("ready")

        // Set cursor to start of first page
        cursorPosRef.current = { page: 0, para: 0, line: 0, charIdx: 0, x: 0, y: 0 }
      } catch (err) {
        if (!cancelled) {
          setStatus("error")
          setErrorMsg(err instanceof Error ? err.message : String(err))
        }
      }
    }

    loadDocument()
    return () => {
      cancelled = true
    }
  }, [status, docBlob, format])

  // ── Step 3: Render pages to canvas elements ───────────────────────
  useEffect(() => {
    if (status !== "ready" || !isWasmReady() || docHandleRef.current === null || pages.length === 0) return

    const wasmApi = getWasmApi()
    if (!wasmApi) {
      setStatus("error")
      setErrorMsg("WASM renderer not available")
      return
    }
    const api = wasmApi
    const docHandle = docHandleRef.current
    let cancelled = false

    const canvasHandles: number[] = []

    for (let i = 0; i < pages.length; i++) {
      if (cancelled) break
      const page = pages[i]
      const canvasHandle = api.create_canvas(page.width, page.height)
      canvasHandles.push(canvasHandle)
      try {
        api.render_laid_out_page(docHandle, i, canvasHandle)
      } catch (err) {
        console.error(`[CanvasEditor] Failed to render page ${i}:`, err)
      }
    }

    canvasHandlesRef.current = canvasHandles

    for (let i = 0; i < pages.length; i++) {
      if (cancelled) break
      const canvasEl = canvasRefs.current[i]
      if (!canvasEl) continue

      const canvasHandle = canvasHandles[i]
      const pixels = api.get_pixel_data(canvasHandle)
      const ctx = canvasEl.getContext("2d")
      if (!ctx) continue

      const page = pages[i]
      canvasEl.width = page.width
      canvasEl.height = page.height

      const imageData = new ImageData(
        new Uint8ClampedArray(pixels.buffer as ArrayBuffer, pixels.byteOffset, pixels.byteLength),
        page.width,
        page.height,
      )
      ctx.putImageData(imageData, 0, 0)
    }

    return () => {
      cancelled = true
    }
  }, [status, pages])

  /** Apply formatting to current cursor position. Used by toolbar ribbon commands. */
  const applyWasmFormatting = useCallback((format: Record<string, unknown>) => {
    if (!isWasmReady() || docHandleRef.current === null) return
    const wasmApi = getWasmApi()
    if (!wasmApi) return
    const api = wasmApi

    try {
      const result = api.apply_formatting(
        docHandleRef.current,
        JSON.stringify(format),
        "A4",
        "portrait",
        72.0,
      )
      if (result && result !== "{}") {
        const layoutPages: PageInfo[] = JSON.parse(result).map(
          (p: { width: number; height: number; marginPx: number }, i: number) => ({
            width: p.width,
            height: p.height,
            marginPx: p.marginPx,
            index: i,
          }),
        )
        // Re-render all pages
        for (let i = 0; i < layoutPages.length; i++) {
          if (canvasHandlesRef.current[i] === undefined) {
            const h = api.create_canvas(layoutPages[i].width, layoutPages[i].height)
            canvasHandlesRef.current[i] = h
          }
          try {
            const h = canvasHandlesRef.current[i]
            api.render_laid_out_page(docHandleRef.current, i, h)
          } catch (err) {
            console.error(`[CanvasEditor] Re-render page ${i} failed:`, err)
          }
        }
        setPages(layoutPages)
      }
    } catch (err) {
      console.error("[CanvasEditor] apply_formatting failed:", err)
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      applyFormatting: applyWasmFormatting,
    }),
    [applyWasmFormatting],
  )

  // ── Key handler — sends key to WASM engine ────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!isWasmReady() || docHandleRef.current === null) return

    const wasmApi = getWasmApi()
    if (!wasmApi) return
    const api = wasmApi
    const docHandle = docHandleRef.current

    // Map event.key to WASM key string
    const keyStr = e.key

    // Ignore modifier-only keys and escape
    if (
      keyStr.startsWith("F") ||
      keyStr === "Escape" ||
      keyStr === "Tab" ||
      keyStr === "Meta" ||
      keyStr === "Control" ||
      keyStr === "Shift" ||
      keyStr === "Alt"
    )
      return

    e.preventDefault()

    try {
      const result = api.handle_key_event(
        docHandle,
        keyStr,
        e.ctrlKey,
        e.shiftKey,
        "A4",
        "portrait",
        72.0,
      )

      // Parse updated layout
      if (result && result !== "{}") {
        const layoutPages: PageInfo[] = JSON.parse(result).map(
          (p: { width: number; height: number; marginPx: number }, i: number) => ({
            width: p.width,
            height: p.height,
            marginPx: p.marginPx,
            index: i,
          }),
        )

        // Re-render all pages
        for (let i = 0; i < layoutPages.length; i++) {
          if (canvasHandlesRef.current[i] === undefined) {
            const h = api.create_canvas(layoutPages[i].width, layoutPages[i].height)
            canvasHandlesRef.current[i] = h
          }
          try {
            const h = canvasHandlesRef.current[i]
            api.render_laid_out_page(docHandle, i, h)
          } catch (err) {
            console.error(`[CanvasEditor] Re-render page ${i} failed:`, err)
          }
        }

        setPages(layoutPages)
      }
    } catch (err) {
      console.error("[CanvasEditor] handle_key_event failed:", err)
    }
  }, [])

  // ── Mouse handler — hit test → position cursor ────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isWasmReady() || docHandleRef.current === null) return

    const wasmApi = getWasmApi()
    if (!wasmApi) return
    const api = wasmApi
    const docHandle = docHandleRef.current

    // Find which page was clicked
    let pageIndex = -1
    for (let i = 0; i < canvasRefs.current.length; i++) {
      if (canvasRefs.current[i] === e.target) {
        pageIndex = i
        break
      }
    }
    if (pageIndex < 0) return

    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    try {
      const result = api.handle_mouse_event(docHandle, pageIndex, x, y)
      const pos = JSON.parse(result) as {
        para: number
        line: number
        charIdx: number
        x: number
        y: number
        found: boolean
      }

      cursorPosRef.current = {
        page: pageIndex,
        para: pos.para,
        line: pos.line,
        charIdx: pos.charIdx,
        x: pos.x,
        y: pos.y,
      }

      // Force cursor visible
      cursorVisibleRef.current = true
    } catch (err) {
      console.error("[CanvasEditor] handle_mouse_event failed:", err)
    }
  }, [])

  // ── Canvas ref callback ───────────────────────────────────────────
  const setCanvasRef = useCallback(
    (index: number) => (el: HTMLCanvasElement | null) => {
      canvasRefs.current[index] = el
    },
    [],
  )

  // ── Render ────────────────────────────────────────────────────────
  if (status === "loading-wasm" || status === "loading-doc") {
    return (
      <div style={containerStyle}>
        <div style={loadingStyle}>
          <div style={spinnerStyle} />
          <p style={messageStyle}>
            {status === "loading-wasm" ? "Loading rendering engine..." : "Preparing document..."}
          </p>
        </div>
      </div>
    )
  }

  if (status === "rendering") {
    return (
      <div style={containerStyle}>
        <div style={loadingStyle}>
          <div style={spinnerStyle} />
          <p style={messageStyle}>Rendering document pages...</p>
        </div>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div style={containerStyle}>
        <div style={errorStyle}>
          <p style={{ color: "#cc0000", fontSize: "14px", margin: 0 }}>
            Failed to render document: {errorMsg}
          </p>
          <p style={{ color: "#666", fontSize: "12px", margin: "8px 0 0 0" }}>
            The canvas renderer could not process this file.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        ...containerStyle,
        gap: "16px",
        padding: "24px 0",
        overflow: "auto",
      }}
    >
      {pages.map((_page, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: stable list, no natural IDs
          key={`page-${index}`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <canvas
            ref={setCanvasRef(index)}
            tabIndex={0}
            style={{
              boxShadow: "0 1px 4px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)",
              display: "block",
              cursor: "text",
              outline: "none",
            }}
            onKeyDown={handleKeyDown}
            onMouseDown={handleMouseDown}
          />
          <span
            style={{
              marginTop: "6px",
              fontSize: "11px",
              color: "#888",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}
          >
            Page {index + 1}
          </span>
        </div>
      ))}

      {pages.length === 0 && (
        <div style={emptyStyle}>
          <p style={{ color: "#888", fontSize: "14px", margin: 0 }}>No pages to display</p>
        </div>
      )}
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  flex: 1,
  backgroundColor: "#e8e8e8",
  minHeight: "100%",
}

const loadingStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "400px",
}

const errorStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "400px",
  padding: "24px",
  textAlign: "center",
}

const emptyStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "200px",
}

const messageStyle: React.CSSProperties = {
  color: "#666",
  fontSize: "14px",
  marginTop: "12px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}

const spinnerStyle: React.CSSProperties = {
  width: "32px",
  height: "32px",
  border: "3px solid #e0e0e0",
  borderTop: "3px solid #2196F3",
  borderRadius: "50%",
  animation: "canvas-editor-spin 0.8s linear infinite",
}

export const CanvasEditor = forwardRef(CanvasEditorInternal)
export default CanvasEditor
