// @vitest-environment jsdom
// Operator-written suite (WO-R7-STORE-LIFECYCLE-1, gateway-starved 3×).
// Pins DocumentStore lifecycle: loadFromWopi metadata/readonly wiring,
// format detection, exportAsDownload, and the buildDocumentBlob branch
// order regression fixed in 0f205e8d1.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// jsdom's Blob lacks .text(); bridge it via FileReader (jsdom supports that).
if (typeof Blob.prototype.text !== "function") {
  Blob.prototype.text = function (): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => {
        const s = String(r.result)
        const b64 = s.includes(",") ? s.split(",")[1] : ""
        resolve(b64 ? atob(b64) : "")
      }
      r.onerror = () => reject(r.error)
      r.readAsDataURL(this)
    })
  }
}

const { loadDocumentMock, convertToHtmlMock, toDocxForCanvasMock, convertFromHtmlMock } = vi.hoisted(
  () => ({
    loadDocumentMock: vi.fn(),
    convertToHtmlMock: vi.fn(),
    toDocxForCanvasMock: vi.fn(),
    convertFromHtmlMock: vi.fn(),
  }),
)

vi.mock("@world-office/wopi-client", () => ({
  detectWopiParams: vi.fn(() => null),
  loadDocument: loadDocumentMock,
  putFile: vi.fn(),
}))
vi.mock("../lib/conversion", () => ({
  convertToHtml: convertToHtmlMock,
  convertToOdt: vi.fn(),
  convertFromHtml: convertFromHtmlMock,
  toDocxForCanvas: toDocxForCanvasMock,
  downloadBlob: vi.fn(),
}))

import { DocumentStore } from "../stores/DocumentStore"

function makeDocx(size = 100): Blob {
  return new Blob([new Uint8Array(size)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  })
}

function wopiInfo(overrides: Record<string, unknown> = {}) {
  return { BaseFileName: "lifecycle.docx", UserCanWrite: true, ...overrides }
}

describe("DocumentStore lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convertToHtmlMock.mockResolvedValue("<p>x</p>")
    toDocxForCanvasMock.mockImplementation((_b: Blob) => Promise.resolve(makeDocx()))
    convertFromHtmlMock.mockResolvedValue(makeDocx())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("loadFromWopi wires CheckFileInfo into state and readies the doc", async () => {
    const store = new DocumentStore()
    loadDocumentMock.mockResolvedValue({ info: wopiInfo(), content: makeDocx() })
    await store.loadFromWopi({ wopiFileId: "F1", accessToken: "t" } as never)
    expect(store.isDocReady).toBe(true)
    expect(store.isLoading).toBe(false)
    expect(store.loadError).toBeNull()
    expect(store.fileName).toBe("lifecycle.docx")
    expect(store.filePath).toBe("F1")
    expect(store.wopiFileInfo?.BaseFileName).toBe("lifecycle.docx")
    expect(store.isEditMode).toBe(true)
  })

  it("loadFromWopi sets edit mode false when UserCanWrite is false", async () => {
    const store = new DocumentStore()
    loadDocumentMock.mockResolvedValue({ info: wopiInfo({ UserCanWrite: false }), content: makeDocx() })
    await store.loadFromWopi({ wopiFileId: "F2", accessToken: "t" } as never)
    expect(store.isEditMode).toBe(false)
  })

  it("loadFromWopi records loadError and keeps doc not-ready on failure", async () => {
    const store = new DocumentStore()
    loadDocumentMock.mockRejectedValue(new Error("401 unauthorized"))
    await store.loadFromWopi({ wopiFileId: "F3", accessToken: "t" } as never)
    expect(store.isDocReady).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.loadError).toBe("401 unauthorized")
  })

  it("loadFromWopi converts docx through toDocxForCanvas for the canvas", async () => {
    const store = new DocumentStore()
    const original = makeDocx()
    loadDocumentMock.mockResolvedValue({ info: wopiInfo(), content: original })
    await store.loadFromWopi({ wopiFileId: "F4", accessToken: "t" } as never)
    expect(convertToHtmlMock).toHaveBeenCalledWith(original, "docx")
    expect(toDocxForCanvasMock).toHaveBeenCalledWith(original, "docx")
    expect(store.richTextFormat).toBe("docx")
    expect(store.richTextHtml).toBe("<p>x</p>")
  })

  it("loadFromWopi tolerates empty conversion output (0-byte files)", async () => {
    const store = new DocumentStore()
    convertToHtmlMock.mockResolvedValue("")
    loadDocumentMock.mockResolvedValue({ info: wopiInfo(), content: makeDocx() })
    await store.loadFromWopi({ wopiFileId: "F5", accessToken: "t" } as never)
    expect(store.isDocReady).toBe(true)
    expect(store.richTextHtml).toBe("")
  })

  it("getDocumentFormat maps extensions from the file name", () => {
    const store = new DocumentStore()
    store.fileName = "report.docx"
    expect(store.getDocumentFormat()).toBe("docx")
    store.fileName = "notes.odt"
    expect(store.getDocumentFormat()).toBe("odt")
    store.fileName = "noext"
    // Real behavior: split(".").pop() returns the whole name when there is
    // no dot, so getDocumentFormat never yields null here.
    expect(store.getDocumentFormat()).toBe("noext")
  })

  it("buildDocumentBlob: canvasSerializer wins over stale richTextHtml (regression 0f205e8d1)", async () => {
    const store = new DocumentStore()
    store.fileName = "doc.docx" // editorType is computed from the extension -> richtext
    store.richTextFormat = "docx"
    store.richTextHtml = "<p>stale load-time snapshot</p>"
    store.isModified = true
    const serializerBlob = makeDocx(42)
    store.canvasSerializer = () => serializerBlob
    const blob = await store.buildDocumentBlob()
    expect(blob).toBe(serializerBlob)
    expect(convertFromHtmlMock).not.toHaveBeenCalled()
  })

  it("buildDocumentBlob: falls back to convertFromHtml when no canvas serializer is registered", async () => {
    const store = new DocumentStore()
    store.fileName = "doc.docx"
    store.richTextFormat = "docx"
    store.richTextHtml = "<p>html snapshot</p>"
    store.isModified = true
    store.canvasSerializer = null
    const htmlBlob = makeDocx(7)
    convertFromHtmlMock.mockResolvedValue(htmlBlob)
    const blob = await store.buildDocumentBlob()
    expect(convertFromHtmlMock).toHaveBeenCalledWith("<p>html snapshot</p>", "docx")
    expect(blob).toBe(htmlBlob)
  })

  it("buildDocumentBlob: monaco content is serialized verbatim", async () => {
    const store = new DocumentStore()
    store.fileName = "notes.txt" // editorType -> monaco
    store.monacoContent = "plain text content"
    store.monacoMime = "text/plain; charset=utf-8"
    const blob = await store.buildDocumentBlob()
    expect(blob.type).toBe("text/plain; charset=utf-8")
    expect(await blob.text()).toBe("plain text content")
  })

  it("buildDocumentBlob: returns lastLoadedContent when not modified", async () => {
    const store = new DocumentStore()
    const original = makeDocx()
    store.lastLoadedContent = original
    store.isModified = false
    store.isDirty = false
    const blob = await store.buildDocumentBlob()
    expect(blob).toBe(original)
  })

  it("saveToWopi: no-op without a wopi connection", async () => {
    const store = new DocumentStore()
    store.isModified = true
    store.canvasSerializer = () => makeDocx()
    await store.saveToWopi()
    expect(store.isModified).toBe(true) // untouched — nothing to save to
  })

  it("exportAsDownload creates and revokes an object URL", async () => {
    const store = new DocumentStore()
    const created: string[] = []
    const revoke = vi.fn()
    vi.stubGlobal("URL", {
      createObjectURL: (b: Blob) => {
        created.push(String(b.size))
        return `blob:fake-${created.length}`
      },
      revokeObjectURL: revoke,
    })
    const click = vi.fn()
    const anchor = { click, href: "", download: "" }
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") return anchor as unknown as HTMLAnchorElement
      return origCreate(tag)
    })
    store.fileName = "out.docx"
    store.lastLoadedContent = makeDocx(11)
    store.exportAsDownload()
    await vi.waitFor(() => expect(click).toHaveBeenCalled())
    expect(anchor.download).toBe("out.docx")
    expect(anchor.href).toMatch(/^blob:fake-/)
    expect(revoke).toHaveBeenCalled()
  })
})
