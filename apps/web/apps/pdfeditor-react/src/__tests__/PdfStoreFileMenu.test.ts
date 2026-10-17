// @vitest-environment jsdom
// File → Save Copy as... exercises the browser download path (anchor click),
// which needs a DOM — the rest of the store suite runs in node.
import { describe, expect, it } from "vitest"
import { PdfStore } from "../stores/PdfStore"

describe("PdfStore save copy", () => {
  function mockDownloads(): string[] {
    const downloads: string[] = []
    URL.createObjectURL = () => "blob:mock"
    URL.revokeObjectURL = () => {}
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      downloads.push(this.download)
    }
    return downloads
  }

  it("downloads a copy under the given name, keeping .pdf", async () => {
    const store = new PdfStore()
    store.lastLoadedContent = new Blob(["%pdf"], { type: "application/pdf" })
    const downloads = mockDownloads()
    await store.saveCopyAs("my copy")
    expect(downloads).toEqual(["my copy.pdf"])
    await store.saveCopyAs("named.pdf")
    expect(downloads).toEqual(["my copy.pdf", "named.pdf"])
  })

  it("ignores an empty save-copy name", async () => {
    const store = new PdfStore()
    const downloads = mockDownloads()
    await store.saveCopyAs("   ")
    expect(downloads).toEqual([])
  })
})
