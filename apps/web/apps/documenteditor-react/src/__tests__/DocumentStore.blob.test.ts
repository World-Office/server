// @vitest-environment jsdom

import type { WopiConnection } from "@world-office/wopi-client"
import { putFile } from "@world-office/wopi-client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { convertFromHtml } from "../lib/conversion"
import { DocumentStore } from "../stores/DocumentStore"

// Never-resolving fetch keeps the store's constructor-time loadFromDemo()
// (reached via detectAndLoadWopi when no WOPI params are present) from
// mutating state mid-test. All network paths under test are mocked anyway.
function hangFetch(): Promise<never> {
  return new Promise(() => {})
}

// jsdom's Blob polyfill has no .text(); read via FileReader instead.
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(blob)
  })
}

vi.mock("@world-office/wopi-client", () => ({
  detectWopiParams: vi.fn(() => null),
  loadDocument: vi.fn(),
  putFile: vi.fn(),
}))

vi.mock("../lib/conversion", () => ({
  convertToHtml: vi.fn(),
  convertFromHtml: vi.fn(),
  toDocxForCanvas: vi.fn(),
}))

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

describe("DocumentStore.buildDocumentBlob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", vi.fn(hangFetch))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("pins 0f205e8d1: richtext + registered serializer returns the serializer blob, never convertFromHtml", async () => {
    const store = new DocumentStore()
    store.fileName = "doc.docx"
    store.richTextFormat = "docx"
    // LOAD-TIME snapshot that canvas edits never touch (the regression source).
    store.richTextHtml = "<p>stale load-time snapshot</p>"
    const serializerBlob = new Blob(["live-serialized-model"], { type: DOCX_MIME })
    const serializer = vi.fn(async () => serializerBlob)
    store.canvasSerializer = serializer
    store.isModified = true

    const result = await store.buildDocumentBlob()

    expect(result).toBe(serializerBlob)
    expect(vi.mocked(convertFromHtml)).not.toHaveBeenCalled()
    expect(serializer).toHaveBeenCalledTimes(1)
  })

  it("calls the serializer only when the document was actually modified or dirtied", async () => {
    const store = new DocumentStore()
    const lastLoaded = new Blob(["original"], { type: DOCX_MIME })
    store.lastLoadedContent = lastLoaded
    const serializerBlob = new Blob(["live-serialized-model"], { type: DOCX_MIME })
    const serializer = vi.fn(async () => serializerBlob)
    store.canvasSerializer = serializer
    store.isModified = false
    store.isDirty = false

    const result = await store.buildDocumentBlob()

    expect(result).toBe(lastLoaded)
    expect(serializer).not.toHaveBeenCalled()
  })

  it("falls back to convertFromHtml(richTextHtml) when the serializer yields null", async () => {
    const store = new DocumentStore()
    store.fileName = "doc.docx"
    store.richTextFormat = "docx"
    store.richTextHtml = "<p>stale</p>"
    store.canvasSerializer = vi.fn(async () => null)
    store.isModified = true
    const converted = new Blob(["converted"], { type: DOCX_MIME })
    vi.mocked(convertFromHtml).mockResolvedValueOnce(converted)

    const result = await store.buildDocumentBlob()

    expect(result).toBe(converted)
    expect(vi.mocked(convertFromHtml)).toHaveBeenCalledWith("<p>stale</p>", "docx")
  })

  it("falls back to convertFromHtml(richTextHtml) for richtext docs without a serializer", async () => {
    const store = new DocumentStore()
    store.fileName = "doc.docx"
    store.richTextFormat = "docx"
    store.richTextHtml = "<p>hello world</p>"
    store.isModified = true
    const converted = new Blob(["converted"], { type: DOCX_MIME })
    vi.mocked(convertFromHtml).mockResolvedValueOnce(converted)

    const result = await store.buildDocumentBlob()

    expect(result).toBe(converted)
    expect(vi.mocked(convertFromHtml)).toHaveBeenCalledWith("<p>hello world</p>", "docx")
  })

  it("does not call convertFromHtml for richtext when richTextFormat is missing", async () => {
    const store = new DocumentStore()
    store.fileName = "doc.docx"
    store.richTextFormat = null
    store.richTextHtml = "<p>stale</p>"
    store.isModified = true

    const result = await store.buildDocumentBlob()

    expect(vi.mocked(convertFromHtml)).not.toHaveBeenCalled()
    expect(await blobText(result)).toBe("")
  })

  it("returns monacoContent verbatim with its mime type for monaco documents", async () => {
    const store = new DocumentStore()
    store.fileName = "notes.txt"
    store.monacoContent = "line1\nline2"
    store.monacoMime = "text/plain; charset=utf-8"
    store.isModified = true

    const result = await store.buildDocumentBlob()

    expect(await blobText(result)).toBe("line1\nline2")
    expect(result.type).toBe("text/plain; charset=utf-8")
  })

  it("preserves the json mime type for monaco documents", async () => {
    const store = new DocumentStore()
    store.fileName = "config.json"
    store.monacoContent = '{"a": 1}'
    store.monacoMime = "application/json"
    store.isModified = true

    const result = await store.buildDocumentBlob()

    expect(await blobText(result)).toBe('{"a": 1}')
    expect(result.type).toBe("application/json")
  })

  it("returns lastLoadedContent verbatim when nothing was modified", async () => {
    const store = new DocumentStore()
    const content = new Blob(["original-bytes"], { type: DOCX_MIME })
    store.lastLoadedContent = content
    store.fileName = "doc.docx"
    store.richTextFormat = "docx"
    store.richTextHtml = "<p>stale</p>"

    const result = await store.buildDocumentBlob()

    expect(result).toBe(content)
    expect(vi.mocked(convertFromHtml)).not.toHaveBeenCalled()
  })

  it("returns an empty Blob when no content source is available", async () => {
    const store = new DocumentStore()
    const result = await store.buildDocumentBlob()
    expect(await blobText(result)).toBe("")
  })
})

describe("DocumentStore.scheduleAutoSave", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", vi.fn(hangFetch))
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("markModified sets isModified and schedules exactly one save 3s later", () => {
    const store = new DocumentStore()
    const save = vi.spyOn(store, "saveToWopi").mockResolvedValue(undefined)

    store.markModified()
    expect(store.isModified).toBe(true)

    vi.advanceTimersByTime(2999)
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it("rapid successive marks coalesce into a single debounced save", () => {
    const store = new DocumentStore()
    const save = vi.spyOn(store, "saveToWopi").mockResolvedValue(undefined)

    store.markModified()
    vi.advanceTimersByTime(1500)
    store.markModified()
    store.markModified()

    vi.advanceTimersByTime(2999)
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it("clears the pending autosave timer so no stale save fires", () => {
    const store = new DocumentStore()
    const save = vi.spyOn(store, "saveToWopi").mockResolvedValue(undefined)

    store.markModified()
    vi.advanceTimersByTime(3000)
    expect(save).toHaveBeenCalledTimes(1)

    // Another mark re-arms: no second fire from the old timer.
    store.markModified()
    expect(save).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3000)
    expect(save).toHaveBeenCalledTimes(2)
  })
})

describe("DocumentStore.saveToWopi", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", vi.fn(hangFetch))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("guards and preserves isModified when no WOPI connection exists", async () => {
    const store = new DocumentStore()
    store.isModified = true
    store.wopiConnection = null

    await store.saveToWopi()

    expect(putFile).not.toHaveBeenCalled()
    expect(store.isModified).toBe(true)
    expect(store.isDirty).toBe(false)
  })

  it("returns early when nothing is modified or dirty", async () => {
    const store = new DocumentStore()
    store.wopiConnection = {} as WopiConnection
    store.isModified = false
    store.isDirty = false

    await store.saveToWopi()

    expect(putFile).not.toHaveBeenCalled()
  })

  it("resets isModified/isDirty and persists the built blob after a successful putFile", async () => {
    const store = new DocumentStore()
    store.fileName = "doc.docx"
    store.richTextFormat = "docx"
    store.richTextHtml = "<p>hi</p>"
    store.isModified = true
    store.isDirty = true
    store.wopiConnection = {} as WopiConnection
    const converted = new Blob(["converted"], { type: DOCX_MIME })
    vi.mocked(convertFromHtml).mockResolvedValueOnce(converted)
    vi.mocked(putFile).mockResolvedValueOnce(undefined)

    await store.saveToWopi()

    expect(vi.mocked(putFile)).toHaveBeenCalledWith(store.wopiConnection, converted)
    expect(store.isModified).toBe(false)
    expect(store.isDirty).toBe(false)
    expect(store.lastLoadedContent).toBe(converted)
  })
})
