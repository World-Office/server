// @vitest-environment jsdom
// Operator-written suite (WO-R7-CONVERT-AI-1, gateway-starved 3×).
// Pins lib/conversion.ts + lib/ai-service.ts behavior: blob round-trips,
// error paths, mime mapping, download plumbing, and AI proxy response
// shape handling.
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

import {
  convertFromHtml,
  convertToHtml,
  downloadBlob,
  toDocxForCanvas,
} from "../lib/conversion"
import { callAi, improveWriting, summarizeSelection } from "../lib/ai-service"

const fetchMock = vi.fn()

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function b64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)))
}

async function makeBlob(text = "hello"): Promise<Blob> {
  return new Blob([text], { type: "application/octet-stream" })
}

describe("lib/conversion", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("convertToHtml returns '' for empty blobs without hitting the backend", async () => {
    const html = await convertToHtml(new Blob([]), "docx")
    expect(html).toBe("")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("convertToHtml posts base64 payload and decodes the html response", async () => {
    fetchMock.mockResolvedValue(okJson({ status: "Success", data: b64("<p>hi</p>") }))
    const blob = await makeBlob("doc")
    const html = await convertToHtml(blob, "docx")
    expect(html).toBe("<p>hi</p>")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/conversion/convert")
    expect(init.method).toBe("POST")
    const body = JSON.parse(init.body)
    expect(body.source_format).toBe("docx")
    expect(body.target_format).toBe("html")
    expect(body.data).toBe(b64("doc"))
  })

  it("convertToHtml throws a typed error on non-2xx", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500, statusText: "Internal" }))
    await expect(convertToHtml(await makeBlob(), "docx")).rejects.toThrow(
      "Conversion request failed: 500 Internal",
    )
  })

  it("convertToHtml throws when the backend reports no data", async () => {
    fetchMock.mockResolvedValue(okJson({ status: "Failed", error: "zip parse error" }))
    await expect(convertToHtml(await makeBlob(), "docx")).rejects.toThrow(
      "Conversion failed: Failed — zip parse error",
    )
  })

  it("convertFromHtml strips tags client-side for txt", async () => {
    const blob = await convertFromHtml("<p>one<br>two</p><p>three</p>", "txt")
    expect(blob.type).toBe("text/plain")
    expect(await blob.text()).toBe("one\ntwo\n\nthree")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("convertFromHtml maps known formats to mime types", async () => {
    fetchMock.mockResolvedValue(okJson({ status: "Success", data: b64("PK") }))
    const blob = await convertFromHtml("<p>x</p>", "odt")
    expect(blob.type).toBe("application/vnd.oasis.opendocument.text")
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.source_format).toBe("html")
    expect(body.target_format).toBe("odt")
  })

  it("convertFromHtml falls back to octet-stream for unknown formats", async () => {
    fetchMock.mockResolvedValue(okJson({ status: "Success", data: b64("x") }))
    const blob = await convertFromHtml("<p>x</p>", "weird")
    expect(blob.type).toBe("application/octet-stream")
  })

  it("toDocxForCanvas passes docx and empty blobs through untouched", async () => {
    const docx = new Blob(["PK"], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
    expect(await toDocxForCanvas(docx, "docx")).toBe(docx)
    const empty = new Blob([])
    expect(await toDocxForCanvas(empty, "odt")).toBe(empty)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("toDocxForCanvas converts odt via the backend and labels the result docx", async () => {
    fetchMock.mockResolvedValue(okJson({ status: "Success", data: b64("PK-docx") }))
    const out = await toDocxForCanvas(await makeBlob("odt-bytes"), "odt")
    expect(out.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    expect(await out.text()).toBe("PK-docx")
  })

  it("downloadBlob anchors a click with the filename and revokes the URL", () => {
    const revoke = vi.fn()
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:fake-1",
      revokeObjectURL: revoke,
    })
    const click = vi.fn()
    const anchor = { click, href: "", download: "" }
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") return anchor as unknown as HTMLAnchorElement
      return origCreate(tag)
    })
    downloadBlob(new Blob(["x"]), "out.odt")
    expect(anchor.download).toBe("out.odt")
    expect(anchor.href).toBe("blob:fake-1")
    expect(click).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith("blob:fake-1")
  })
})

describe("lib/ai-service", () => {
  beforeEach(() => {
    fetchMock.mockClear()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("callAi unwraps choices[0].message.content and includes the system prompt", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(okJson({ choices: [{ message: { content: " the summary " } }] })),
    )
    const out = await callAi("summarize me", "Be terse.")
    expect(out).toBe(" the summary ")
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages).toEqual([
      { role: "system", content: "Be terse." },
      { role: "user", content: "summarize me" },
    ])
  })

  it("callAi falls back through content and text fields", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(okJson({ content: "flat" })))
    expect(await callAi("q")).toBe("flat")
    fetchMock.mockImplementation(() => Promise.resolve(okJson({ text: "textual" })))
    expect(await callAi("q")).toBe("textual")
    fetchMock.mockImplementation(() => Promise.resolve(okJson({})))
    expect(await callAi("q")).toBe("")
  })

  it("callAi surfaces backend error fields as thrown errors", async () => {
    fetchMock.mockResolvedValue(okJson({ error: "model overloaded" }))
    await expect(callAi("q")).rejects.toThrow("model overloaded")
  })

  it("callAi throws a typed error on non-2xx and on network failure", async () => {
    fetchMock.mockResolvedValue(new Response("no", { status: 502, statusText: "Bad Gateway" }))
    await expect(callAi("q")).rejects.toThrow("AI request failed: 502 Bad Gateway")
    fetchMock.mockRejectedValue(new TypeError("network down"))
    await expect(callAi("q")).rejects.toThrow("network down")
  })

  it("summarizeSelection and improveWriting send their system prompts", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(okJson({ content: "out" })))
    await summarizeSelection("some text")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content).toContain(
      "Summarize",
    )
    await improveWriting("some text")
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages[0].content).toContain(
      "Improve the writing",
    )
  })
})
