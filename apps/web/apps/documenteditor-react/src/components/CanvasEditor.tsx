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

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { applyOpToDocument, getWasmApi, isWasmReady, loadWasmRenderer, type WasmRenderApi } from "../lib/wasm-renderer"
import { documentStore } from "../stores/DocumentStore"

interface CanvasEditorProps {
  /** DOCX blob to render */
  docBlob: Blob
  /** File name (to detect format) */
  fileName: string
  /** Called when the document is modified (for save tracking) */
  onChange?: () => void
  /** Called to get the current document bytes for saving */
  onSerialize?: (bytes: Uint8Array) => void
  /** Called when a local edit occurs for collaboration broadcast (legacy) */
  onLocalOp?: (op: unknown, docHandle: number) => void
  /** Called with ModelOp when a local edit occurs (new collaboration format) */
  onModelOp?: (op: unknown, docHandle: number) => void
  /** Receive remote operations from collaboration service */
  onRemoteOp?: (op: unknown) => void
  /** Called when the user's cursor/selection changes position */
  onCursorChange?: (page: number, para: number, charIdx: number, x: number, y: number) => void
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
 * OnlyOffice paste-special option ids (the OO `SpecialOptions*` shortcut
 * rows: KeepSourceFormat / KeepTextOnly / OverwriteCells / NestTable).
 *
 * The canvas engine's paste is a text insert (no HTML clipboard pipeline),
 * so each option maps to the closest real engine behaviour — the applied
 * option is published on the editor root (`data-wo-paste-option`), reported
 * in the statusbar, and emitted as a `wo:paste-special` window event so the
 * parity/census layer can observe which OO row a paste used.
 */
export type WoPasteOption =
  | "keep-source-format"
  | "keep-text-only"
  | "overwrite-cells"
  | "nest-table"

export const WO_PASTE_OPTIONS: ReadonlyArray<{
  id: WoPasteOption
  label: string
  hint: string
}> = [
  {
    id: "keep-source-format",
    label: "Keep source formatting",
    hint: "Paste keeping the source structure (paragraph breaks)",
  },
  {
    id: "keep-text-only",
    label: "Keep text only",
    hint: "Paste a single plain run, flattening line breaks",
  },
  {
    id: "overwrite-cells",
    label: "Overwrite cells",
    hint: "Replace the selection, then paste (table paste option)",
  },
  {
    id: "nest-table",
    label: "Nest table",
    hint: "Paste as its own block below the cursor (table paste option)",
  },
]

/** Dispatch a command into the shared wo-command router (word-commands.ts). */
function dispatchWoCommand(command: string, value?: string): void {
  window.dispatchEvent(new CustomEvent("wo-command", { detail: { command, value } }))
}


/**
 * CanvasEditor renders a DOCX document as a series of <canvas> pages,
 * matching ONLYOFFICE's canvas-based editing approach.
 */
// Expose imperative methods via useImperativeHandle
// Use forwardRef so the parent can call applyFormatting, etc.
import { forwardRef } from "react"

export interface CanvasEditorHandle {
  applyFormatting: (format: Record<string, unknown>) => void
  /** Apply a structure op (list, table, section break, rule, indent). */
  applyStructureOp: (op: string) => void
  /** Apply a ModelOp for collaboration (insert, delete, format, etc.). */
  applyOp: (op: unknown) => boolean
  /** Get the current WASM document handle. */
  getDocHandle: () => number | null
  /** Undo the last committed mutation via the WASM engine history. */
  undo: () => void
  /** Redo the last undone mutation via the WASM engine history. */
  redo: () => void
  /** Select the whole document (engine anchor + extend-to-end). */
  selectAll: () => void
  /** Copy the engine selection to the system clipboard. */
  clipboardCopy: () => void
  /** Cut: copy the engine selection, then delete it. */
  clipboardCut: () => void
  /** Paste text at the engine cursor. */
  clipboardPaste: (text: string) => void
  /** Paste the system clipboard with an OO paste-special option applied. */
  pasteWithOption: (option: WoPasteOption) => void
  /** Show the paste-special option list (OO SpecialOptions rows). */
  openPasteOptions: () => void
  /** Cycle the open-document tab strip (OO Next/PreviousFileTab). */
  cycleFileTab: (dir: 1 | -1) => string
}

// Named function gives forwardRef a proper displayName
const CanvasEditorInternal = (props: CanvasEditorProps, ref: React.Ref<CanvasEditorHandle>) => {
  const {
    docBlob,
    fileName,
    onChange: _onChange,
    onSerialize: _onSerialize,
    onLocalOp,
    onModelOp,
    onCursorChange,
  } = props
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
  // Selection highlight rects per page (canvas pixel space), refreshed from
  // the engine on every overlay draw so drag-selection stays live.
  const selectionRectsRef = useRef<{ x: number; y: number; w: number; h: number }[][]>([])
  const blinkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cursorVisibleRef = useRef(true)
  // true between mousedown and mouseup on the canvas: mousemove extends selection
  const draggingRef = useRef(false)
  // Monotonic document-revision counter published as data-wo-rev on the
  // container. The functional census (harness fx-wo.cjs) samples it instead
  // of the retired editor's innerHTML: the canvas engine owns the PIXELS, so
  // the only DOM-observable doc-mutation signal is this counter.
  const docRevRef = useRef(0)
  const bumpDocRev = () => {
    docRevRef.current += 1
    containerRef.current?.setAttribute("data-wo-rev", String(docRevRef.current))
  }
  // Paste-special option list (Ctrl+Alt+V / the paste command): open flag
  // only — the options themselves are the static WO_PASTE_OPTIONS rows.
  const [pasteOptionsOpen, setPasteOptionsOpen] = useState(false)
  // Open-document tab strip (OO Next/PreviousFileTab). The web editor opens
  // one document per browser tab, so the strip holds the documents opened in
  // THIS session; cycling reports the active tab honestly (1 of 1) until
  // more documents are opened here.
  const fileTabsRef = useRef<{ id: string; fileName: string }[]>([])
  const fileTabIndexRef = useRef(0)

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
    const docHandle = docHandleRef.current
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

    // Selection highlight (rgba(0,120,215,0.3), ONLYOFFICE-style) drawn on the
    // page at full canvas/page scale. Drag moves the head without re-emitting
    // layout JSON, so rects are refreshed from the engine each draw. Cast: the
    // export exists in the wasm module but WasmRenderApi (lib/wasm-renderer.ts)
    // doesn't list it yet — that file is outside this task's scope.
    const getSelectionRects = (
      getWasmApi() as { get_selection_rects?: (h: number) => string } | null
    )?.get_selection_rects
    if (getSelectionRects) {
      try {
        const raw = getSelectionRects(docHandle)
        if (raw) selectionRectsRef.current = JSON.parse(raw)
      } catch {
        // keep last-known rects on parse failure
      }
    }
    for (const r of selectionRectsRef.current[cursor.page] ?? []) {
      ctx.fillStyle = "rgba(0,120,215,0.3)"
      ctx.fillRect(r.x, r.y, r.w, r.h)
    }

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
        const layoutJsonArr = JSON.parse(layoutJson) as {
          width: number
          height: number
          marginPx: number
          selection_rects?: { x: number; y: number; w: number; h: number }[]
        }[]
        const layoutPages: PageInfo[] = layoutJsonArr.map(
          (p: { width: number; height: number; marginPx: number }, i: number) => ({
            width: p.width,
            height: p.height,
            marginPx: p.marginPx,
            index: i,
          }),
        )
        selectionRectsRef.current = layoutJsonArr.map((p) => p.selection_rects ?? [])

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
    if (status !== "ready" || !isWasmReady() || docHandleRef.current === null || pages.length === 0)
      return

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
      console.info("[CanvasEditor] apply_formatting result:", result?.substring(0, 80))
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
        bumpDocRev()
      }
    } catch (err) {
      console.error("[CanvasEditor] apply_formatting failed:", err)
    }
  }, [])

  /** Apply a structure op (list/table/section/rule/indent) at the cursor. */
  const applyWasmStructureOp = useCallback((op: string) => {
    if (!isWasmReady() || docHandleRef.current === null) return
    const wasmApi = getWasmApi()
    if (!wasmApi) return
    const api = wasmApi

    try {
      const result = api.apply_structure_op(docHandleRef.current, op, "A4", "portrait", 72.0)
      if (result && result !== "{}") {
        const layoutPages: PageInfo[] = JSON.parse(result).map(
          (p: { width: number; height: number; marginPx: number }, i: number) => ({
            width: p.width,
            height: p.height,
            marginPx: p.marginPx,
            index: i,
          }),
        )
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
        bumpDocRev()
      }
    } catch (err) {
      console.error("[CanvasEditor] apply_structure_op failed:", err)
    }
  }, [])

  // Helper to re-render after any layout-changing operation
  const reRenderAfterLayoutChange = useCallback(async (): Promise<void> => {
    if (!isWasmReady() || docHandleRef.current === null) return
    const wasmApi = getWasmApi()
    if (!wasmApi) return

    const api = wasmApi
    const docHandle = docHandleRef.current

    // Re-layout and re-render all pages
    const layoutJson = api.layout_document(docHandle, "A4", "portrait", 72.0)
    const layoutPages: PageInfo[] = JSON.parse(layoutJson).map(
      (p: { width: number; height: number; marginPx: number }, i: number) => ({
        width: p.width,
        height: p.height,
        marginPx: p.marginPx,
        index: i,
      }),
    )
    setPages(layoutPages)

    // Re-render all pages
    for (let i = 0; i < layoutPages.length; i++) {
      if (canvasHandlesRef.current[i] === undefined) {
        const h = api.create_canvas(layoutPages[i].width, layoutPages[i].height)
        canvasHandlesRef.current[i] = h
      }
      try {
        api.render_laid_out_page(docHandle, i, canvasHandlesRef.current[i])
        const canvasEl = canvasRefs.current[i]
        if (canvasEl) {
          const pixels = api.get_pixel_data(canvasHandlesRef.current[i])
          const ctx = canvasEl.getContext("2d")
          if (ctx) {
            const page = layoutPages[i]
            const imageData = new ImageData(
              new Uint8ClampedArray(
                pixels.buffer as ArrayBuffer,
                pixels.byteOffset,
                pixels.byteLength,
              ),
              page.width,
              page.height,
            )
            canvasEl.width = page.width
            canvasEl.height = page.height
            ctx.putImageData(imageData, 0, 0)
          }
        }
      } catch (err) {
        console.error(`[CanvasEditor] Re-render page ${i} failed:`, err)
      }
    }
  }, [])

  /** Apply a ModelOp for collaboration (insert, delete, format, etc.). */
  const applyOp = useCallback(
    (op: unknown): boolean => {
      if (!isWasmReady() || docHandleRef.current === null) {
        console.warn("[CanvasEditor] applyOp: WASM not ready or no document handle")
        return false
      }

      try {
        const opJson = JSON.stringify(op)
        const success = applyOpToDocument(docHandleRef.current, opJson)

        if (success) {
          void reRenderAfterLayoutChange()
          if (onLocalOp && docHandleRef.current) {
            onLocalOp(op, docHandleRef.current)
          }
          if (onModelOp && docHandleRef.current) {
            onModelOp(op, docHandleRef.current)
          }
          if (_onChange) {
            bumpDocRev()
            _onChange()
          }
          return true
        }
        return false
      } catch (err) {
        console.error("[CanvasEditor] applyOp failed:", err)
        return false
      }
    },
    [onLocalOp, onModelOp, _onChange, reRenderAfterLayoutChange],
  )

  /** Get the current WASM document handle. */
  const getDocHandle = useCallback((): number | null => {
    return docHandleRef.current
  }, [])

  // Shared applier for engine calls that return a layout JSON (undo/redo,
  // handle_key_event) — parses pages, re-renders canvases, bumps docRev.
  // Returns true when the engine reported a real mutation ("{}" = no-op).
  const applyEngineResult = useCallback(
    (result: string | null, api: WasmRenderApi, docHandle: number): boolean => {
      if (result && result !== "{}") {
        try {
          const layoutPages: PageInfo[] = JSON.parse(result).map(
            (p: { width: number; height: number; marginPx: number }, i: number) => ({
              width: p.width,
              height: p.height,
              marginPx: p.marginPx,
              index: i,
            }),
          )
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
          if (_onChange) {
            bumpDocRev()
            _onChange()
          }
          return true
        } catch (err) {
          console.error("[CanvasEditor] engine result parse failed:", err)
        }
      }
      return false
    },
    [_onChange],
  )

  /** Undo the last mutation via the engine history. */
  const undo = useCallback(() => {
    const api = getWasmApi()
    const docHandle = docHandleRef.current
    if (!api || docHandle === null) return
    try {
      applyEngineResult(api.undo(docHandle, "A4", "portrait", 72.0), api, docHandle)
    } catch (err) {
      console.error("[CanvasEditor] undo failed:", err)
    }
  }, [getWasmApi, applyEngineResult])

  /** Redo the last undone mutation via the engine history. */
  const redo = useCallback(() => {
    const api = getWasmApi()
    const docHandle = docHandleRef.current
    if (!api || docHandle === null) return
    try {
      applyEngineResult(api.redo(docHandle, "A4", "portrait", 72.0), api, docHandle)
    } catch (err) {
      console.error("[CanvasEditor] redo failed:", err)
    }
  }, [getWasmApi, applyEngineResult])

  /** Select the whole document: anchor at doc start, extend cursor to end.
   *  The engine has no select_all; Shift+ArrowDown moves converge at the
   *  final paragraph (cheap — nav moves return "{}", no re-render). */
  const selectAll = useCallback(() => {
    const api = getWasmApi()
    const docHandle = docHandleRef.current
    if (!api || docHandle === null) return
    try {
      api.set_selection_anchor(docHandle, 0, 0)
      for (let i = 0; i < 30; i++) {
        api.handle_key_event(docHandle, "ArrowDown", false, true, "A4", "portrait", 72.0)
      }
    } catch (err) {
      console.error("[CanvasEditor] selectAll failed:", err)
    }
  }, [getWasmApi])

  /** Copy the engine selection (NOT the DOM selection — canvas keeps the
   *  selection inside the WASM engine). */
  const clipboardCopy = useCallback(() => {
    const api = getWasmApi()
    const docHandle = docHandleRef.current
    if (!api || docHandle === null) return
    try {
      const text = api.get_selected_text(docHandle)
      if (text) navigator.clipboard.writeText(text).catch(() => {})
    } catch (err) {
      console.error("[CanvasEditor] copy failed:", err)
    }
  }, [getWasmApi])

  /** Cut: copy the engine selection, then delete it via delete_selection. */
  const clipboardCut = useCallback(() => {
    const api = getWasmApi()
    const docHandle = docHandleRef.current
    if (!api || docHandle === null) return
    try {
      const text = api.get_selected_text(docHandle)
      if (!text) return
      navigator.clipboard.writeText(text).catch(() => {})
      applyEngineResult(api.delete_selection(docHandle, "A4", "portrait", 72.0), api, docHandle)
    } catch (err) {
      console.error("[CanvasEditor] cut failed:", err)
    }
  }, [getWasmApi, applyEngineResult])

  /** Paste text at the engine cursor (real insert, unlike the old
   *  applyFormatting({insertText}) no-op that only looked like a mutation). */
  const clipboardPaste = useCallback(
    (text: string) => {
      if (!text) return
      const api = getWasmApi()
      const docHandle = docHandleRef.current
      if (!api || docHandle === null) return
      try {
        applyEngineResult(api.insert_text(docHandle, text, "A4", "portrait", 72.0), api, docHandle)
      } catch (err) {
        console.error("[CanvasEditor] paste failed:", err)
      }
    },
    [getWasmApi, applyEngineResult],
  )

  /** Publish which OO paste-special option a paste used. Only called after a
   *  real engine mutation, so `data-wo-paste-option` on the editor root is a
   *  trustworthy "this paste applied option X" signal for the parity layer. */
  const markPasteOption = useCallback((option: WoPasteOption, text: string) => {
    containerRef.current?.setAttribute("data-wo-paste-option", option)
    const row = WO_PASTE_OPTIONS.find((o) => o.id === option)
    documentStore.setStatusMessage(`Pasted — ${row ? row.label : option}`, 10000)
    window.dispatchEvent(
      new CustomEvent("wo:paste-special", { detail: { option, chars: text.length } }),
    )
  }, [])

  /** Paste `text` with an OO paste-special option applied. Each option maps
   *  to a real, distinct engine sequence (see WO_PASTE_OPTIONS). */
  const pasteTextWithOption = useCallback(
    (text: string, option: WoPasteOption) => {
      if (!text) return
      const api = getWasmApi()
      const docHandle = docHandleRef.current
      if (!api || docHandle === null) return
      try {
        let mutated = false
        // "Overwrite cells" (table paste option): the destination content is
        // replaced by the clipboard block instead of being merged into.
        if (option === "overwrite-cells") {
          const selected = api.get_selected_text(docHandle)
          if (selected) {
            const del = api.delete_selection(docHandle, "A4", "portrait", 72.0)
            mutated = applyEngineResult(del, api, docHandle)
          }
        }
        // "Keep text only": one plain run — line breaks and tabs flatten to
        // spaces. Every other option keeps the source structure verbatim
        // ("keep source formatting"), or starts a block of its own
        // ("nest table": the pasted block sits below the cursor instead of
        // splicing into the current run).
        const payload =
          option === "keep-text-only"
            ? text.replace(/[\r\n\t]+/g, " ")
            : option === "nest-table"
              ? `\n${text}`
              : text
        const result = api.insert_text(docHandle, payload, "A4", "portrait", 72.0)
        mutated = applyEngineResult(result, api, docHandle) || mutated
        if (mutated) markPasteOption(option, text)
      } catch (err) {
        console.error("[CanvasEditor] paste-special failed:", err)
      }
    },
    [getWasmApi, applyEngineResult, markPasteOption],
  )

  /** Read the system clipboard and paste it with an OO paste-special option
   *  (Ctrl+V = keep source formatting, the default rich paste). */
  const pasteWithOption = useCallback(
    (option: WoPasteOption) => {
      navigator.clipboard
        .readText()
        .then((text) => {
          if (!text) return
          pasteTextWithOption(text, option)
        })
        .catch((err) => console.error("[CanvasEditor] clipboard read failed:", err))
    },
    [pasteTextWithOption],
  )

  /** Cycle the open-document tab strip (OO Next/PreviousFileTab). Wraps
   *  around, reports the activated tab on the editor root
   *  (`data-wo-file-tab` / `data-wo-file-tab-move`) and via `wo:file-tab`. */
  const cycleFileTab = useCallback(
    (dir: 1 | -1) => {
      const activeName = fileName || "Untitled"
      const tabs = fileTabsRef.current
      const activeId = tabs[fileTabIndexRef.current]?.id
      if (tabs.length === 0 || activeId !== docHandleRef.current?.toString()) {
        // (Re)seed with the document this session has open.
        fileTabsRef.current = [{ id: String(docHandleRef.current ?? 0), fileName: activeName }]
        fileTabIndexRef.current = 0
      }
      const list = fileTabsRef.current
      fileTabIndexRef.current = (fileTabIndexRef.current + dir + list.length) % list.length
      const active = list[fileTabIndexRef.current]
      const root = containerRef.current
      root?.setAttribute("data-wo-file-tab", active.fileName)
      root?.setAttribute("data-wo-file-tab-move", dir === 1 ? "next" : "previous")
      documentStore.setStatusMessage(
        `Document ${fileTabIndexRef.current + 1} of ${list.length}: ${active.fileName}`,
        10000,
      )
      window.dispatchEvent(
        new CustomEvent("wo:file-tab", {
          detail: {
            index: fileTabIndexRef.current,
            total: list.length,
            fileName: active.fileName,
            dir: dir === 1 ? "next" : "previous",
          },
        }),
      )
      return active.fileName
    },
    [fileName],
  )

  useImperativeHandle(
    ref,
    () => ({
      applyFormatting: applyWasmFormatting,
      applyStructureOp: applyWasmStructureOp,
      applyOp,
      getDocHandle,
      undo,
      redo,
      selectAll,
      clipboardCopy,
      clipboardCut,
      clipboardPaste,
      pasteWithOption,
      openPasteOptions: () => setPasteOptionsOpen(true),
      cycleFileTab,
    }),
    [
      applyWasmFormatting,
      applyWasmStructureOp,
      applyOp,
      getDocHandle,
      undo,
      redo,
      selectAll,
      clipboardCopy,
      clipboardCut,
      clipboardPaste,
      pasteWithOption,
      cycleFileTab,
    ],
  )

  // ── Key handler — sends key to WASM engine ────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      // Escape closes the paste-special option list first (it is an overlay
      // owned by this component, not an engine key).
      if (e.key === "Escape" && pasteOptionsOpen) {
        setPasteOptionsOpen(false)
        return
      }
      if (!isWasmReady() || docHandleRef.current === null) return

      const wasmApi = getWasmApi()
      if (!wasmApi) return
      const api = wasmApi
      const docHandle = docHandleRef.current

      // Map event.key to WASM key string
      const keyStr = e.key

      // ── Editor-level OnlyOffice chords ─────────────────────────────
      // Handled before the engine dispatch (and before the modifier-only
      // ignore list: Ctrl+Tab is in it). Each one routes through the shared
      // wo-command router so the ribbon button and the chord stay one code
      // path (word-commands.ts owns the behavior).
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+P — OO PrintPreviewAndPrint: open the print preview panel.
        // (The browser print sheet itself is not reachable headless; the
        // preview panel is the editor-side surface.)
        if (keyStr === "p" || keyStr === "P") {
          e.preventDefault()
          dispatchWoCommand("print")
          return
        }
        // Ctrl+Alt+V — paste special: the OO SpecialOptions list.
        if (e.altKey && (keyStr === "v" || keyStr === "V")) {
          e.preventDefault()
          setPasteOptionsOpen((open) => !open)
          return
        }
        // Ctrl+PageDown / Ctrl+Tab — OO NextFileTab (WO binding + OO combo).
        if (keyStr === "PageDown" || (keyStr === "Tab" && !e.shiftKey)) {
          e.preventDefault()
          dispatchWoCommand("nextFileTab")
          return
        }
        // Ctrl+PageUp / Ctrl+Shift+Tab — OO PreviousFileTab.
        if (keyStr === "PageUp" || (e.shiftKey && keyStr === "Tab")) {
          e.preventDefault()
          dispatchWoCommand("previousFileTab")
          return
        }
        // ── OO paragraph/format chords → shared wo-command router ──────
        // These were not chord-bound: the WASM engine only understands a
        // few modifiers (bold/italic/underline/undo), so Ctrl+E/L/R/J/M etc.
        // silently no-op'd while their ribbon buttons worked. Route them
        // through the same router as the buttons (word-commands.ts owns the
        // behavior) — ribbon button and chord stay one code path.
        if (e.altKey) {
          const alt = { "1": "heading1", "2": "heading2", "3": "heading3",
                        d: "insertEndnote", f: "insertFootnote" }[keyStr]
          if (alt) { e.preventDefault(); dispatchWoCommand(alt); return }
        } else {
          const plain = { e: "alignCenter", E: "alignCenter",
                          j: "alignJustify", J: "alignJustify",
                          r: "alignRight", R: "alignRight",
                          l: "alignLeft", L: "alignLeft",
                          m: "indent", M: "indent" }[keyStr]
          if (plain) { e.preventDefault(); dispatchWoCommand(plain); return }
          if (e.shiftKey) {
            const shift = { m: "outdent", M: "outdent",
                            x: "strike", X: "strike",
                            l: "bulletList", L: "bulletList" }[keyStr]
            if (shift) { e.preventDefault(); dispatchWoCommand(shift); return }
          }
          if (keyStr === " " && !e.shiftKey) { e.preventDefault(); dispatchWoCommand("clearFormatting"); return }
        }
      }

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

      // Parse updated layout and re-render all pages
      const applyWasmResult = (result: string | null) => {
        console.info("[CanvasEditor] apply_formatting result:", result?.substring(0, 80))
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
          // Mark the store modified so embedded autosave / Ctrl+S actually
          // persist canvas-typed edits via WOPI PutFile. Without this, edits
          // live only in memory and are silently lost on reload.
          if (_onChange) {
            bumpDocRev()
            _onChange()
          }
        }
      }

      try {
        // Clipboard copy/cut/paste need the system clipboard, which the WASM
        // engine cannot reach — handle those in JS. Every other key (including
        // Ctrl+S/B/Z/Y) dispatches to the engine's handle_key_event, which
        // interprets the modifier (save, bold, undo) instead of inserting the
        // bare letter. Ctrl+A is select-all in JS (the engine would insert
        // the bare letter 'a').
        if (e.ctrlKey || e.metaKey) {
          if (keyStr === "a" || keyStr === "A") {
            selectAll()
            return
          }
          if (keyStr === "c" || keyStr === "C") {
            try {
              const text = api.get_selected_text(docHandle)
              if (text) navigator.clipboard.writeText(text).catch(() => {})
            } catch (err) {
              console.error("[CanvasEditor] copy failed:", err)
            }
            return
          }
          if (keyStr === "x" || keyStr === "X") {
            try {
              const text = api.get_selected_text(docHandle)
              if (text) navigator.clipboard.writeText(text).catch(() => {})
              applyWasmResult(api.delete_selection(docHandle, "A4", "portrait", 72.0))
            } catch (err) {
              console.error("[CanvasEditor] cut failed:", err)
            }
            return
          }
          if (keyStr === "v" || keyStr === "V") {
            // Default paste = OO SpecialOptionsKeepSourceFormat: the source
            // structure is kept verbatim (see pasteTextWithOption).
            e.preventDefault()
            pasteWithOption("keep-source-format")
            return
          }
        }

        const result = api.handle_key_event(
          docHandle,
          keyStr,
          e.ctrlKey,
          e.shiftKey,
          "A4",
          "portrait",
          72.0,
        )

        applyWasmResult(result)
      } catch (err) {
        console.error("[CanvasEditor] handle_key_event failed:", err)
      }
    },
    [_onChange, selectAll, pasteWithOption, pasteOptionsOpen],
  )

  // ── Mouse handler — hit test → position cursor ────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: drawCursorOverlay reads live refs/state and is recreated each render, so it is intentionally not a dependency
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
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
      // Convert CSS pixel coords → canvas pixel coords (canvas may be scaled
      // by CSS; the WASM hit-test operates in canvas pixel space).
      const canvas = e.target as HTMLCanvasElement
      const scaleX = canvas.width / rect.width || 1
      const scaleY = canvas.height / rect.height || 1
      const x = (e.clientX - rect.left) * scaleX
      const y = (e.clientY - rect.top) * scaleY

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

        // Draw the caret immediately so users get instant feedback that the
        // click registered (waiting for the 530ms blink tick feels dead).
        drawCursorOverlay()

        // Begin drag-select: mousemove until mouseup extends the selection.
        draggingRef.current = true

        // Notify parent about cursor position change (for collaboration)
        if (onCursorChange && pos.found) {
          onCursorChange(pageIndex, pos.para, pos.charIdx, pos.x, pos.y)
        }
      } catch (err) {
        console.error("[CanvasEditor] handle_mouse_event failed:", err)
      }
    },
    [onCursorChange],
  )

  // ── Drag-select: mousemove extends the selection, mouseup ends it ──
  // biome-ignore lint/correctness/useExhaustiveDependencies: drawCursorOverlay reads live refs/state and is recreated each render, so it is intentionally not a dependency
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current || !isWasmReady() || docHandleRef.current === null) return
      const wasmApi = getWasmApi()
      if (!wasmApi) return
      const api = wasmApi
      const docHandle = docHandleRef.current

      let pageIndex = -1
      for (let i = 0; i < canvasRefs.current.length; i++) {
        if (canvasRefs.current[i] === e.target) {
          pageIndex = i
          break
        }
      }
      if (pageIndex < 0) return

      const canvas = e.target as HTMLCanvasElement
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width || 1
      const scaleY = canvas.height / rect.height || 1
      const x = (e.clientX - rect.left) * scaleX
      const y = (e.clientY - rect.top) * scaleY

      try {
        // Engine moves the cursor and keeps the anchor (ponytail: selection is
        // not visually highlighted — the canvas renderer draws text only; add
        // selection-rect rendering if highlight is ever requested).
        api.handle_mouse_drag(docHandle, pageIndex, x, y)
        const posJson = api.get_cursor_position(docHandle)
        if (posJson && posJson !== "null") {
          const pos = JSON.parse(posJson) as {
            para: number
            line: number
            charIdx: number
            x: number
            y: number
          }
          cursorVisibleRef.current = true
          drawCursorOverlay()
          if (onCursorChange) {
            onCursorChange(pageIndex, pos.para, pos.charIdx, pos.x, pos.y)
          }
        }
      } catch (err) {
        console.error("[CanvasEditor] handle_mouse_drag failed:", err)
      }
    },
    [onCursorChange],
  )

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false
  }, [])

  // Mouseup can land outside the canvas mid-drag — end the drag regardless.
  useEffect(() => {
    const stop = () => {
      draggingRef.current = false
    }
    window.addEventListener("mouseup", stop)
    return () => window.removeEventListener("mouseup", stop)
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
      id="editor"
      data-wo-rev="0"
      style={{
        ...containerStyle,
        position: "relative",
        gap: "16px",
        padding: "24px 0",
        overflow: "auto",
      }}
    >
      {/* Paste-special options (Ctrl+Alt+V) — the OO SpecialOptions rows.
          Buttons carry data-wo-paste-option so the parity/census layer can
          drive a specific option directly. */}
      {pasteOptionsOpen && (
        <div
          className="wo-paste-options"
          data-wo-paste-options=""
          role="menu"
          aria-label="Paste special"
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 280,
            padding: "6px",
            backgroundColor: "#fff",
            border: "1px solid #d0d4da",
            borderRadius: 4,
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          }}
        >
          {WO_PASTE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              data-wo-paste-option={option.id}
              onClick={() => {
                setPasteOptionsOpen(false)
                pasteWithOption(option.id)
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 2,
                padding: "6px 10px",
                border: 0,
                borderRadius: 3,
                backgroundColor: "transparent",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <span style={{ fontSize: 13, color: "#202124" }}>{option.label}</span>
              <span style={{ fontSize: 11, color: "#5f6368" }}>{option.hint}</span>
            </button>
          ))}
        </div>
      )}
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
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
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
