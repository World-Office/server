import { describe, expect, it } from "vitest"
import { PdfStore } from "../stores/PdfStore"

describe("PdfStore", () => {
  it("initializes with default state", () => {
    const store = new PdfStore()
    expect(store.mode).toBeNull()
    expect(store.document).toBeNull()
    expect(store.isDocReady).toBe(false)
    expect(store.zoomLevel).toBe(100)
    expect(store.currentPage).toBe(0)
    expect(store.pageCount).toBe(0)
    expect(store.pages).toEqual([])
    expect(store.toolbarVisible).toBe(true)
    expect(store.leftMenuVisible).toBe(true)
    expect(store.rightMenuVisible).toBe(false)
    expect(store.annotations).toEqual([])
    expect(store.activeAnnotationTool).toBeNull()
    expect(store.pdfDocProxy).toBeNull()
  })

  it("handles zoom", () => {
    const store = new PdfStore()
    store.setZoomLevel(150)
    expect(store.zoomLevel).toBe(150)
    store.zoomIn()
    expect(store.zoomLevel).toBeGreaterThan(150)
    store.zoomOut()
    expect(store.zoomLevel).toBe(150)
  })

  it("toggles UI panels", () => {
    const store = new PdfStore()
    store.setLeftMenuVisible(false)
    expect(store.leftMenuVisible).toBe(false)
    store.setRightMenuVisible(true)
    expect(store.rightMenuVisible).toBe(true)
  })

  it("handles page navigation", () => {
    const store = new PdfStore()
    store.setPageCount(10)
    store.setCurrentPage(5)
    expect(store.currentPage).toBe(5)
    store.setCurrentPage(0)
    expect(store.currentPage).toBe(0)
  })

  it("manages annotations", () => {
    const store = new PdfStore()
    const ann = {
      id: "ann1",
      page: 1,
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      color: "#FF0000",
      text: "Note",
    }
    store.annotations.push(ann)
    expect(store.annotations.length).toBe(1)
    store.annotations.length = 0
    expect(store.annotations.length).toBe(0)
  })

  it("sets annotation tool", () => {
    const store = new PdfStore()
    store.setAnnotationTool("highlight")
    expect(store.activeAnnotationTool).toBe("highlight")
    store.setAnnotationTool(null)
    expect(store.activeAnnotationTool).toBeNull()
  })

  it("sets tabs", () => {
    const store = new PdfStore()
    store.setActiveTab("view")
    expect(store.activeTab).toBe("view")
  })

  it("toggles file menu", () => {
    const store = new PdfStore()
    store.setFileMenuOpen(true)
    expect(store.isFileMenuOpen).toBe(true)
  })
})
