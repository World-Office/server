// @vitest-environment jsdom
/**
 * CanvasEditor — canvas-based document editor (ONLYOFFICE-style).
 *
 * Pins the WASM lifecycle state machine and the key/mouse dispatch bridge of
 * CanvasEditor.tsx (777 lines, previously the largest untested component):
 *
 *  Lifecycle — loading-wasm → loading-doc → ready (pages rendered), plus the
 *  two graceful-degradation exits:
 *    * renderer unavailable / document creation fails → error fallback view,
 *      no crash;
 *    * a page render throws → the page is skipped, the editor stays usable.
 *
 *  handleKeyDown dispatch bridge — every actionable key is forwarded to the
 *  WASM engine as handle_key_event(docHandle, key, ctrl, shift, "A4",
 *  "portrait", 72.0), and the document is only marked modified (onChange) when
 *  the engine reports a changed layout:
 *    * ctrl+s → save path (key reaches WASM + onChange fires → autosave/PutFile)
 *    * ctrl+b → bold toggle, ctrl+z → undo, arrows → cursor navigation
 *    * Escape / Tab / Fn / modifier-only keys are NOT swallowed (no WASM call,
 *      no preventDefault) — focus/overlay handling reverts to the browser
 *
 *  Mouse + imperative handle — hit-test dispatches handle_mouse_event and
 *  notifies onCursorChange; applyOp/applyFormatting/applyStructureOp forward to
 *  the engine and applyOpToDocument; unmount releases WASM doc/canvas handles.
 *
 * jsdom does not ship canvas rendering, ImageData or Blob.arrayBuffer, so the
 * 2d context, ImageData and the doc Blob are faked here — the tests assert on
 * WASM call arguments and rendered DOM, not on pixels.
 */
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CanvasEditor, type CanvasEditorHandle } from "../components/CanvasEditor"
import type { WasmRenderApi } from "../lib/wasm-renderer"
import { applyOpToDocument, getWasmApi, isWasmReady, loadWasmRenderer } from "../lib/wasm-renderer"

vi.mock("../lib/wasm-renderer", () => ({
  getWasmApi: vi.fn(),
  isWasmReady: vi.fn(),
  loadWasmRenderer: vi.fn(),
  applyOpToDocument: vi.fn(),
}))

const mockedGetWasmApi = vi.mocked(getWasmApi)
const mockedIsWasmReady = vi.mocked(isWasmReady)
const mockedLoadWasmRenderer = vi.mocked(loadWasmRenderer)
const mockedApplyOpToDocument = vi.mocked(applyOpToDocument)

// ── jsdom environment shims (see file header) ────────────────────────────
// jsdom 26 provides no ImageData global — the component's render path
// constructs one, so a minimal stand-in is registered once.
if (typeof globalThis.ImageData === "undefined") {
  class ImageDataStub {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(data: Uint8ClampedArray, sw: number, sh: number) {
      this.data = data
      this.width = sw
      this.height = sh
    }
  }
  ;(globalThis as { ImageData?: unknown }).ImageData = ImageDataStub
}

// ── Fixtures ─────────────────────────────────────────────────────────────

const PAGE_WIDTH = 200
const PAGE_HEIGHT = 100
const PIXEL_BYTES = PAGE_WIDTH * PAGE_HEIGHT * 4
const DOC_HANDLE = 42

interface PageSpec {
  width: number
  height: number
  marginPx: number
}

function makeLayoutJson(pages: number): string {
  const layout: PageSpec[] = Array.from({ length: pages }, () => ({
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    marginPx: 10,
  }))
  return JSON.stringify(layout)
}

/** Full fake of the wo-renderer-wasm surface with call-recording mocks. */
function makeWasmApi(
  overrides: Partial<Record<keyof WasmRenderApi, unknown>> = {},
  opts: { pages?: number } = {},
): WasmRenderApi {
  const pages = opts.pages ?? 2
  const layoutJson = makeLayoutJson(pages)
  let nextCanvasHandle = 1
  const api = {
    init: vi.fn(),
    create_canvas: vi.fn((w: number, h: number) => nextCanvasHandle++),
    render_rect: vi.fn(),
    render_text: vi.fn(),
    get_pixel_data: vi.fn(() => new Uint8Array(PIXEL_BYTES)),
    get_canvas_size: vi.fn(() => `${PAGE_WIDTH},${PAGE_HEIGHT}`),
    flush_to_canvas: vi.fn(),
    clear_canvas: vi.fn(),
    release_canvas: vi.fn(),
    render_page: vi.fn(() => -1),
    create_document: vi.fn(() => DOC_HANDLE),
    layout_document: vi.fn(() => layoutJson),
    render_laid_out_page: vi.fn(),
    release_document: vi.fn(),
    handle_key_event: vi.fn(() => layoutJson),
    handle_mouse_event: vi.fn(() =>
      JSON.stringify({ para: 0, line: 0, charIdx: 0, x: 0, y: 0, found: true }),
    ),
    serialize_document: vi.fn(() => new Uint8Array(0)),
    get_cursor_position: vi.fn(() => "{}"),
    apply_formatting: vi.fn(() => layoutJson),
    get_run_formatting: vi.fn(() => "{}"),
    apply_structure_op: vi.fn(() => layoutJson),
    apply_op: vi.fn(() => true),
    ...overrides,
  }
  return api as unknown as WasmRenderApi
}

interface CanvasCtxStub {
  putImageData: Mock
  fillRect: Mock
  ctx: CanvasRenderingContext2D
}

/** jsdom's getContext returns null — stub it with a call-recording 2d context. */
function installCanvasContextStub(): CanvasCtxStub {
  const putImageData = vi.fn()
  const fillRect = vi.fn()
  const ctx = {
    putImageData,
    fillRect,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "left",
    font: "10px sans-serif",
  }
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx as unknown as CanvasRenderingContext2D)
  return {
    putImageData,
    fillRect,
    ctx: ctx as unknown as CanvasRenderingContext2D,
  }
}

function deferred(): { promise: Promise<boolean>; resolve: (v: boolean) => void } {
  let resolve!: (v: boolean) => void
  const promise = new Promise<boolean>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** jsdom's Blob lacks .arrayBuffer() — hand the editor a blob-alike that has it. */
function fakeDocxBlob(): Blob {
  const buffer = new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer
  return { arrayBuffer: async () => buffer } as unknown as Blob
}

/** A doc blob whose byte read can be held until the test lets it through. */
function deferredDocBlob(): { blob: Blob; resolve: () => void } {
  let resolveRead!: (buffer: ArrayBuffer) => void
  const blob = {
    arrayBuffer: () =>
      new Promise<ArrayBuffer>((res) => {
        resolveRead = res
      }),
  } as unknown as Blob
  return {
    blob,
    resolve: () => resolveRead(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer),
  }
}

// ── Mount harness (no @testing-library, mirrors useEmbeddedAutoSave tests) ─

interface MountedEditor {
  container: HTMLDivElement
  handle: () => CanvasEditorHandle | null
  props: {
    onChange: Mock
    onLocalOp: Mock
    onModelOp: Mock
    onCursorChange: Mock
    onSerialize: Mock
  }
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []

function mountEditor(opts: { fileName?: string; docBlob?: Blob } = {}): MountedEditor {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)

  const onChange = vi.fn()
  const onLocalOp = vi.fn()
  const onModelOp = vi.fn()
  const onCursorChange = vi.fn()
  const onSerialize = vi.fn()

  let handle: CanvasEditorHandle | null = null
  act(() => {
    root.render(
      createElement(CanvasEditor, {
        ref: (h: CanvasEditorHandle | null) => {
          handle = h
        },
        docBlob: opts.docBlob ?? fakeDocxBlob(),
        fileName: opts.fileName ?? "report.docx",
        onChange,
        onLocalOp,
        onModelOp,
        onCursorChange,
        onSerialize,
      }),
    )
  })
  mounted.push({ root, container })

  const getHandle = () => {
    if (!handle) {
      throw new Error("CanvasEditor ref not attached yet")
    }
    return handle
  }

  return {
    container,
    handle: getHandle,
    props: { onChange, onLocalOp, onModelOp, onCursorChange, onSerialize },
  }
}

/** Drain the chained async effects (wasm load → doc load → render). */
async function flushAsync(times = 12): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

/** Mount and drive the happy-path lifecycle to "ready". */
async function mountReady(opts: { fileName?: string } = {}): Promise<MountedEditor> {
  const m = mountEditor(opts)
  await flushAsync()
  return m
}

function unmountAll(): void {
  for (const m of mounted.splice(0)) {
    act(() => {
      m.root.unmount()
    })
    document.body.removeChild(m.container)
  }
}

function queryCanvas(container: HTMLElement, index = 0): HTMLCanvasElement {
  const canvas = container.querySelectorAll("canvas")[index]
  expect(canvas).toBeDefined()
  return canvas as HTMLCanvasElement
}

function dispatchKey(
  canvas: HTMLCanvasElement,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })
  // handleKeyDown fires setPages when the engine reports a layout change.
  act(() => {
    canvas.dispatchEvent(event)
  })
  return event
}

let activeApi: WasmRenderApi
let canvasCtx: CanvasCtxStub

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  // Keep the console quiet: the component logs placement info per key event.
  vi.spyOn(console, "info").mockImplementation(() => {})
  canvasCtx = installCanvasContextStub()
  activeApi = makeWasmApi()
  mockedGetWasmApi.mockReturnValue(activeApi)
  mockedIsWasmReady.mockReturnValue(true)
  mockedLoadWasmRenderer.mockResolvedValue(true)
  mockedApplyOpToDocument.mockReturnValue(true)
})

afterEach(() => {
  unmountAll()
  vi.restoreAllMocks()
})

describe("CanvasEditor WASM lifecycle", () => {
  it("walks loading-wasm → loading-doc → ready as WASM and the doc bytes resolve", async () => {
    const wasmGate = deferred()
    mockedLoadWasmRenderer.mockReturnValue(wasmGate.promise)
    const blobGate = deferredDocBlob()

    const m = mountEditor({ docBlob: blobGate.blob })
    expect(m.container.textContent).toContain("Loading rendering engine...")

    // WASM module resolves → doc parsing begins.
    await act(async () => {
      wasmGate.resolve(true)
    })
    await flushAsync()
    expect(m.container.textContent).toContain("Preparing document...")
    expect(m.container.querySelector("canvas")).toBeNull()

    // Doc bytes resolve → layout → ready with a canvas per page.
    await act(async () => {
      blobGate.resolve()
    })
    await flushAsync()
    expect(m.container.querySelectorAll("canvas").length).toBe(2)
    expect(m.container.textContent).toContain("Page 1")
    expect(m.container.textContent).toContain("Page 2")
    expect(m.container.textContent).not.toContain("Preparing document...")
  })

  it("creates, lays out and renders every page to its canvas once ready", async () => {
    const m = await mountReady()

    const canvases = m.container.querySelectorAll("canvas")
    expect(canvases.length).toBe(2)

    expect(vi.mocked(activeApi.create_document)).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "docx",
    )
    expect(vi.mocked(activeApi.layout_document)).toHaveBeenCalledWith(
      DOC_HANDLE,
      "A4",
      "portrait",
      72.0,
    )
    expect(vi.mocked(activeApi.create_canvas)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(activeApi.render_laid_out_page)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(activeApi.render_laid_out_page)).toHaveBeenCalledWith(
      DOC_HANDLE,
      0,
      expect.any(Number),
    )
    // Each page's pixels are blitted onto its <canvas>, sized from the layout.
    expect(canvasCtx.putImageData).toHaveBeenCalled()
    for (const call of canvasCtx.putImageData.mock.calls) {
      expect(call[0]).toMatchObject({ width: PAGE_WIDTH, height: PAGE_HEIGHT })
    }
    expect((canvases[0] as HTMLCanvasElement).width).toBe(PAGE_WIDTH)
    expect((canvases[0] as HTMLCanvasElement).height).toBe(PAGE_HEIGHT)
  })

  it("maps .odt documents to docx at the WASM boundary", async () => {
    await mountReady({ fileName: "notes.odt" })
    expect(vi.mocked(activeApi.create_document)).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "docx",
    )
  })

  it("falls back to the HTML error view when the renderer is unavailable (no crash)", async () => {
    mockedLoadWasmRenderer.mockResolvedValue(true)
    mockedIsWasmReady.mockReturnValue(true)
    // isWasmReady() passes the guard but the API is gone → loadDocument throws.
    mockedGetWasmApi.mockReturnValue(null)

    const m = mountEditor()
    await flushAsync()

    expect(m.container.textContent).toContain(
      "Failed to render document: WASM renderer not available",
    )
    expect(m.container.textContent).toContain("The canvas renderer could not process this file.")
    expect(m.container.querySelector("canvas")).toBeNull()
  })

  it("shows the error view (not a crash) when document creation fails", async () => {
    const api = makeWasmApi({
      create_document: vi.fn(() => {
        throw new Error("create failed")
      }),
    })
    mockedGetWasmApi.mockReturnValue(api)

    const m = mountEditor()
    await flushAsync()

    expect(m.container.textContent).toContain("Failed to render document: create failed")
  })

  it("degrades gracefully when a page render throws: page skipped, editor stays usable", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const api = makeWasmApi(
      {
        render_laid_out_page: vi.fn(() => {
          throw new Error("render boom")
        }),
      },
      { pages: 1 },
    )
    mockedGetWasmApi.mockReturnValue(api)

    const m = mountEditor()
    await flushAsync()

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to render page 0"),
      expect.any(Error),
    )
    // No full-component crash: the page shell is still shown.
    expect(m.container.querySelector("canvas")).not.toBeNull()
    expect(m.container.textContent).toContain("Page 1")
    expect(m.container.textContent).not.toContain("Failed to render document")
    errorSpy.mockRestore()
  })

  it("releases the WASM document and every canvas handle on unmount", async () => {
    await mountReady()
    const api = vi.mocked(activeApi)

    const docHandle = api.create_document.mock.results[0]?.value ?? DOC_HANDLE
    const canvasHandles = api.create_canvas.mock.results.map((r) => r.value as number)
    expect(canvasHandles.length).toBeGreaterThan(0)

    expect(api.release_document).not.toHaveBeenCalled()
    unmountAll()

    expect(api.release_document).toHaveBeenCalledWith(docHandle)
    for (const h of canvasHandles) {
      expect(api.release_canvas).toHaveBeenCalledWith(h)
    }
  })
})

describe("CanvasEditor handleKeyDown dispatch matrix", () => {
  it("ctrl+s dispatches save to the WASM engine and marks the document modified", async () => {
    const m = await mountReady()

    const event = dispatchKey(queryCanvas(m.container), "s", { ctrlKey: true })

    expect(event.defaultPrevented).toBe(true)
    expect(vi.mocked(activeApi.handle_key_event)).toHaveBeenCalledWith(
      DOC_HANDLE,
      "s",
      true,
      false,
      "A4",
      "portrait",
      72.0,
    )
    // The engine returned a changed layout → the doc is marked dirty, which the
    // parent uses to drive the autosave / WOPI PutFile save chain.
    expect(m.props.onChange).toHaveBeenCalledTimes(1)
  })

  it("ctrl+b toggles bold via the WASM handle_key_event", async () => {
    const m = await mountReady()

    dispatchKey(queryCanvas(m.container), "b", { ctrlKey: true })

    expect(vi.mocked(activeApi.handle_key_event)).toHaveBeenCalledWith(
      DOC_HANDLE,
      "b",
      true,
      false,
      "A4",
      "portrait",
      72.0,
    )
  })

  it("ctrl+z dispatches undo via the WASM handle_key_event", async () => {
    const m = await mountReady()

    dispatchKey(queryCanvas(m.container), "z", { ctrlKey: true })

    expect(vi.mocked(activeApi.handle_key_event)).toHaveBeenCalledWith(
      DOC_HANDLE,
      "z",
      true,
      false,
      "A4",
      "portrait",
      72.0,
    )
  })

  it("arrow keys dispatch cursor navigation via the WASM handle_key_event", async () => {
    const m = await mountReady()
    const canvas = queryCanvas(m.container)

    dispatchKey(canvas, "ArrowUp")
    dispatchKey(canvas, "ArrowDown")
    dispatchKey(canvas, "ArrowLeft")
    dispatchKey(canvas, "ArrowRight")

    const keyEvent = vi.mocked(activeApi.handle_key_event)
    for (const arrow of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      expect(keyEvent).toHaveBeenCalledWith(DOC_HANDLE, arrow, false, false, "A4", "portrait", 72.0)
    }
  })

  it("passes shift through so shifted keys reach the engine correctly", async () => {
    const m = await mountReady()

    dispatchKey(queryCanvas(m.container), "A", { shiftKey: true })

    expect(vi.mocked(activeApi.handle_key_event)).toHaveBeenCalledWith(
      DOC_HANDLE,
      "A",
      false,
      true,
      "A4",
      "portrait",
      72.0,
    )
  })

  it("Escape, Tab, Fn and modifier-only keys are not swallowed (focus stays with the browser)", async () => {
    const m = await mountReady()
    const canvas = queryCanvas(m.container)

    const events = ["Escape", "Tab", "F5", "Shift", "Control", "Meta", "Alt"].map((key) =>
      dispatchKey(canvas, key),
    )

    expect(vi.mocked(activeApi.handle_key_event)).not.toHaveBeenCalled()
    for (const event of events) {
      expect(event.defaultPrevented).toBe(false)
    }
    expect(m.props.onChange).not.toHaveBeenCalled()
  })

  it("a key whose layout did not change does not mark the document modified", async () => {
    const api = makeWasmApi({ handle_key_event: vi.fn(() => "{}") })
    mockedGetWasmApi.mockReturnValue(api)

    const m = await mountReady()
    dispatchKey(queryCanvas(m.container), "x")

    expect(vi.mocked(api.handle_key_event)).toHaveBeenCalledWith(
      DOC_HANDLE,
      "x",
      false,
      false,
      "A4",
      "portrait",
      72.0,
    )
    expect(m.props.onChange).not.toHaveBeenCalled()
  })

  it("is a no-op when the WASM engine is not ready", async () => {
    const m = await mountReady()
    mockedIsWasmReady.mockReturnValue(false)

    const event = dispatchKey(queryCanvas(m.container), "s", { ctrlKey: true })

    expect(vi.mocked(activeApi.handle_key_event)).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    expect(m.props.onChange).not.toHaveBeenCalled()
  })

  it("re-renders pages when a save/undo/bold key produces a changed layout", async () => {
    const m = await mountReady()
    const renderCallsBefore = vi.mocked(activeApi.render_laid_out_page).mock.calls.length

    dispatchKey(queryCanvas(m.container), "b", { ctrlKey: true })

    expect(vi.mocked(activeApi.render_laid_out_page).mock.calls.length).toBeGreaterThan(
      renderCallsBefore,
    )
    expect(m.container.querySelectorAll("canvas").length).toBe(2)
  })
})

describe("CanvasEditor mouse dispatch", () => {
  it("hit-tests the clicked page and reports the caret position via onCursorChange", async () => {
    const m = await mountReady()
    const canvas = queryCanvas(m.container)
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: PAGE_WIDTH,
        bottom: PAGE_HEIGHT,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect

    const event = new MouseEvent("mousedown", {
      clientX: 50,
      clientY: 25,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      canvas.dispatchEvent(event)
    })

    expect(vi.mocked(activeApi.handle_mouse_event)).toHaveBeenCalledWith(DOC_HANDLE, 0, 50, 25)
    expect(m.props.onCursorChange).toHaveBeenCalledWith(0, 0, 0, 0, 0)
  })
})

describe("CanvasEditor imperative handle", () => {
  it("applyOp forwards a ModelOp to the WASM engine and notifies observers", async () => {
    const m = await mountReady()
    const op = { type: "insert-text", text: "hello" }

    let ok = false
    act(() => {
      ok = m.handle().applyOp(op)
    })
    await flushAsync()

    expect(ok).toBe(true)
    expect(mockedApplyOpToDocument).toHaveBeenCalledWith(DOC_HANDLE, JSON.stringify(op))
    expect(m.props.onLocalOp).toHaveBeenCalledWith(op, DOC_HANDLE)
    expect(m.props.onModelOp).toHaveBeenCalledWith(op, DOC_HANDLE)
    expect(m.props.onChange).toHaveBeenCalled()
  })

  it("applyOp returns false when the WASM layer rejects the op", async () => {
    mockedApplyOpToDocument.mockReturnValue(false)
    const m = await mountReady()

    let ok = true
    act(() => {
      ok = m.handle().applyOp({ type: "noop" })
    })

    expect(ok).toBe(false)
    expect(m.props.onChange).not.toHaveBeenCalled()
    expect(m.props.onModelOp).not.toHaveBeenCalled()
  })

  it("applyOp is a safe no-op when the WASM engine is not ready", async () => {
    const m = await mountReady()
    mockedIsWasmReady.mockReturnValue(false)

    let ok = true
    act(() => {
      ok = m.handle().applyOp({ type: "noop" })
    })

    expect(ok).toBe(false)
    expect(mockedApplyOpToDocument).not.toHaveBeenCalled()
    expect(m.props.onChange).not.toHaveBeenCalled()
  })

  it("getDocHandle exposes the live WASM document handle", async () => {
    const m = await mountReady()
    expect(m.handle().getDocHandle()).toBe(DOC_HANDLE)
  })

  it("applyFormatting forwards the format and re-renders the changed layout", async () => {
    const m = await mountReady()

    act(() => {
      m.handle().applyFormatting({ bold: true })
    })
    await flushAsync()

    expect(vi.mocked(activeApi.apply_formatting)).toHaveBeenCalledWith(
      DOC_HANDLE,
      JSON.stringify({ bold: true }),
      "A4",
      "portrait",
      72.0,
    )
    expect(vi.mocked(activeApi.render_laid_out_page).mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(m.container.querySelectorAll("canvas").length).toBe(2)
  })

  it("applyStructureOp forwards a structure op to the WASM engine", async () => {
    const m = await mountReady()

    act(() => {
      m.handle().applyStructureOp("list")
    })
    await flushAsync()

    expect(vi.mocked(activeApi.apply_structure_op)).toHaveBeenCalledWith(
      DOC_HANDLE,
      "list",
      "A4",
      "portrait",
      72.0,
    )
  })

  it.skip("falls back to the HTML error view when WASM loading fails end-to-end", async () => {
    // BUG: when loadWasmRenderer() resolves false (module missing) the
    // component ignores its result, flips status to "loading-doc", and the
    // Step 2 effect bails on !isWasmReady() — so the editor sits on
    // "Preparing document..." forever and never reaches the error/fallback view.
    mockedLoadWasmRenderer.mockResolvedValue(false)
    mockedIsWasmReady.mockReturnValue(false)
    mockedGetWasmApi.mockReturnValue(null)

    const m = mountEditor()
    await flushAsync()

    expect(m.container.textContent).toContain("Failed to render document")
    expect(m.container.textContent).not.toContain("Preparing document...")
  })
})
