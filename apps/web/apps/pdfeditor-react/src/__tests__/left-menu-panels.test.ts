import type { PDFDocumentProxy } from "pdfjs-dist"
import { describe, expect, it } from "vitest"
import {
  collectPdfOutline,
  collectPdfText,
  findPdfTextMatches,
  outlineDestination,
  pageTextFromItems,
  resolveOutlinePage,
  snippetAround,
  type PdfOutlineSourceNode,
  type PdfTextDocumentSource,
} from "../lib/pdf-text"
import { PdfStore } from "../stores/PdfStore"

function fakeDocument(
  pages: string[],
  outline?: PdfOutlineSourceNode[],
): PdfTextDocumentSource {
  return {
    numPages: pages.length,
    async getPage(pageNumber: number) {
      if (pageNumber < 1 || pageNumber > pages.length) throw new Error("no such page")
      return {
        async getTextContent() {
          // marked-content markers arrive mixed with the real text items
          return {
            items: [{ type: "beginMarkedContent" }, { str: pages[pageNumber - 1], hasEOL: true }],
          }
        },
      }
    },
    ...(outline
      ? {
          async getOutline() {
            return outline
          },
          async getDestination(name: string) {
            return name === "intro" ? [{ num: 7 }, { name: "XYZ" }] : null
          },
          async getPageIndex(ref: unknown) {
            return (ref as { num: number }).num - 1
          },
        }
      : {}),
  }
}

const PAGES = ["Quarterly review", "Revenue is up", "revenue follow-up", "Contacts"]

describe("pdf-text", () => {
  it("joins pdf.js text items and drops marked-content markers", () => {
    expect(
      pageTextFromItems([
        { str: "Quarterly " },
        { str: "review", hasEOL: true },
        { str: "page 2" },
      ]),
    ).toBe("Quarterly review\npage 2")
  })

  it("collects one text per page and keeps page numbers honest", async () => {
    const pages = await collectPdfText(fakeDocument(PAGES))
    expect(pages.map((p) => p.text)).toEqual(PAGES)
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3, 4])

    const empty = await collectPdfText(null)
    expect(empty).toEqual([])
  })

  it("keeps a placeholder for unreadable pages", async () => {
    const unreadable = await collectPdfText({
      numPages: 2,
      async getPage() {
        throw new Error("scanned image, no text layer")
      },
    })
    expect(unreadable).toEqual([
      { page: 1, text: "" },
      { page: 2, text: "" },
    ])
  })

  it("finds every occurrence in page order and honours match case", async () => {
    const pages = await collectPdfText(fakeDocument(PAGES))
    const matches = findPdfTextMatches(pages, "revenue")
    expect(matches.map((m) => m.page)).toEqual([2, 3])

    const cased = findPdfTextMatches(pages, "Revenue", { matchCase: true })
    expect(cased.map((m) => m.page)).toEqual([2])

    // a page with two hits yields two rows
    const twice = findPdfTextMatches([{ page: 1, text: "a b a b" }], "a")
    expect(twice).toHaveLength(2)
    expect(findPdfTextMatches(pages, "")).toEqual([])
  })

  it("bounds the result list for huge documents", () => {
    const matches = findPdfTextMatches(
      Array.from({ length: 5 }, (_, i) => ({ page: i + 1, text: "needle needle" })),
      "needle",
      { maxMatches: 3 },
    )
    expect(matches).toHaveLength(3)
  })

  it("previews a short snippet around a hit", () => {
    const long = `${"a".repeat(40)}revenue${"b".repeat(40)}`
    expect(snippetAround(long, 40, 47)).toBe(`…${"a".repeat(20)}revenue${"b".repeat(30)}…`)
    expect(snippetAround("revenue", 0, 7)).toBe("revenue")
  })

  it("flattens the pdf.js outline and keeps its destinations reachable", () => {
    const outline: PdfOutlineSourceNode[] = [
      { title: "  Introduction  ", dest: "intro" },
      { title: "", dest: [{ num: 4 }] },
    ]
    const bookmarks = collectPdfOutline(outline)
    expect(bookmarks.map((b) => b.label)).toEqual(["Introduction", "Bookmark 2"])
    expect(outlineDestination(bookmarks[0])).toBe("intro")
    expect(collectPdfOutline(null)).toEqual([])
  })

  it("resolves a destination to a 1-based page number", async () => {
    const doc = fakeDocument(PAGES, [{ title: "Intro", dest: "intro" }])
    // "intro" → [pageRef {num: 7}, …] → page index 6 → page 7
    await expect(resolveOutlinePage(doc, "intro")).resolves.toBe(7)
    await expect(resolveOutlinePage(doc, [{ num: 2 }])).resolves.toBe(2)
    await expect(resolveOutlinePage(doc, "unknown")).resolves.toBeNull()
    await expect(resolveOutlinePage(null, "intro")).resolves.toBeNull()
  })
})

describe("PdfStore left-menu panels", () => {
  function storeWithDoc(
    pages: string[],
    outline?: PdfOutlineSourceNode[],
  ): { store: PdfStore; doc: PdfTextDocumentSource } {
    const store = new PdfStore()
    const doc = fakeDocument(pages, outline)
    store.pdfDocProxy = doc as unknown as PDFDocumentProxy
    store.setPageCount(pages.length)
    return { store, doc }
  }

  it("anchors, resolves, replies and deletes page comment threads", () => {
    const store = new PdfStore()
    const thread = store.addPageComment(3, " check this ")
    expect(thread).not.toBeNull()
    expect(thread?.pageIndex).toBe(3)
    expect(thread?.text).toBe("check this")
    expect(store.commentCount).toBe(1)
    expect(store.addPageComment(0, "   ")).toBeNull()

    expect(store.addPageReply(thread!.id, " done")).not.toBeNull()
    expect(store.pageComments[0].replies).toHaveLength(1)

    store.setPageCommentResolved(thread!.id, true)
    expect(store.pageComments[0].resolved).toBe(true)
    // resolved threads leave the open-comment counter
    expect(store.commentCount).toBe(0)

    store.deletePageComment(thread!.id)
    expect(store.pageComments).toHaveLength(0)
  })

  it("drops comment threads that outlive their pages", () => {
    const store = new PdfStore()
    store.setPages([{ index: 0, label: "1" }, { index: 1, label: "2" }])
    store.addPageComment(1, "second page")

    store.setPageCount(1)
    expect(store.pageComments).toHaveLength(0)

    store.addPageComment(0, "only page")
    store.setPages([{ index: 0, label: "1" }])
    expect(store.pageComments).toHaveLength(1)
  })

  it("keeps chat messages in order and clears them", () => {
    const store = new PdfStore()
    expect(store.addChatMessage("  ")).toBeNull()
    const first = store.addChatMessage("hello")
    const second = store.addChatMessage("world")
    expect([first?.text, second?.text]).toEqual(["hello", "world"])
    expect(store.chatMessages.map((m) => m.self)).toEqual([true, true])
    store.clearChatMessages()
    expect(store.chatMessages).toHaveLength(0)
  })

  it("clamps page navigation to the document", () => {
    const { store } = storeWithDoc(PAGES)
    store.gotoPage(99)
    expect(store.currentPage).toBe(3)
    store.gotoPage(0)
    expect(store.currentPage).toBe(0)
    store.gotoPage(2)
    expect(store.currentPage).toBe(1)

    store.nextPage()
    expect(store.currentPage).toBe(2)
    store.prevPage()
    expect(store.currentPage).toBe(1)
    store.setCurrentPage(0)
    store.prevPage()
    expect(store.currentPage).toBe(0)
    store.setCurrentPage(3)
    store.nextPage()
    expect(store.currentPage).toBe(3)
  })

  it("searches the document text and records the match count", async () => {
    const { store } = storeWithDoc(PAGES)
    const matches = await store.searchDocument("revenue")
    expect(matches.map((m) => m.page)).toEqual([2, 3])
    expect(store.searchResults).toBe(2)
    expect(store.searchMatches).toHaveLength(2)
    expect(store.searchQuery).toBe("revenue")

    // match case narrows it, and the cache does not freeze stale results
    await store.searchDocument("Revenue", { matchCase: true })
    expect(store.searchMatches.map((m) => m.page)).toEqual([2])

    await store.searchDocument("   ")
    expect(store.searchMatches).toEqual([])
    expect(store.searchResults).toBe(0)
  })

  it("answers searches with an empty list when no document is open", async () => {
    const store = new PdfStore()
    await expect(store.searchDocument("revenue")).resolves.toEqual([])
    expect(store.searchResults).toBe(0)
  })

  it("reads the outline into bookmarks and falls back to none", async () => {
    const { store } = storeWithDoc(PAGES, [
      { title: "Intro", dest: "intro", items: [{ title: "Detail", dest: [{ num: 3 }] }] },
    ])
    const bookmarks = await store.loadOutline()
    expect(bookmarks[0]?.label).toBe("Intro")
    expect(bookmarks[0]?.children?.[0]?.label).toBe("Detail")

    // a document without an outline keeps the panel on page navigation
    const plain = storeWithDoc(PAGES)
    await expect(plain.store.loadOutline()).resolves.toEqual([])
  })
})
