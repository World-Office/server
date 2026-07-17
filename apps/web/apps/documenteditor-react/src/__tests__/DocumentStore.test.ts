// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { DocumentStore } from "../stores/DocumentStore"

describe("DocumentStore", () => {
  it("initializes with default state", () => {
    const store = new DocumentStore()
    expect(store.mode).toBeNull()
    expect(store.document).toBeNull()
    expect(store.isDocReady).toBe(false)
    expect(store.isSaving).toBe(false)
    expect(store.loadError).toBeNull()
    expect(store.zoomLevel).toBe(100)
    expect(store.fitToPage).toBe(false)
    expect(store.fitToWidth).toBe(false)
    expect(store.toolbarVisible).toBe(true)
    expect(store.statusbarVisible).toBe(true)
    expect(store.leftMenuVisible).toBe(true)
    expect(store.rightMenuVisible).toBe(false)
    expect(store.currentPage).toBe(0)
    expect(store.totalPages).toBe(0)
    expect(store.trackChanges).toBe(false)
    expect(store.wordCount).toBe(0)
    expect(store.languageCode).toBe("en-US")
    expect(store.isDirty).toBe(false)
    // isLoading starts true because constructor calls loadFromDemo()
    expect(store.isLoading).toBe(true)
  })

  it("toggles UI panels", () => {
    const store = new DocumentStore()
    store.setLeftMenuVisible(false)
    expect(store.leftMenuVisible).toBe(false)
    store.setLeftMenuVisible(true)
    expect(store.leftMenuVisible).toBe(true)
    store.setRightMenuVisible(true)
    expect(store.rightMenuVisible).toBe(true)
    store.setRightMenuVisible(false)
    expect(store.rightMenuVisible).toBe(false)
  })

  it("handles zoom", () => {
    const store = new DocumentStore()
    store.setZoomLevel(150)
    expect(store.zoomLevel).toBe(150)
  })

  it("tracks modification state", () => {
    const store = new DocumentStore()
    expect(store.isDirty).toBe(false)
    store.setDirty(true)
    expect(store.isDirty).toBe(true)
    store.markSaved()
    expect(store.isDirty).toBe(false)
  })

  it("handles page navigation", () => {
    const store = new DocumentStore()
    store.setTotalPages(10)
    store.setCurrentPage(5)
    expect(store.currentPage).toBe(5)
    store.setCurrentPage(0)
    expect(store.currentPage).toBe(0)
  })

  it("toggles track changes", () => {
    const store = new DocumentStore()
    expect(store.trackChanges).toBe(false)
    store.setTrackChanges(true)
    expect(store.trackChanges).toBe(true)
    store.setTrackChanges(false)
    expect(store.trackChanges).toBe(false)
  })

  it("activates tabs", () => {
    const store = new DocumentStore()
    store.setActiveTab("home")
    expect(store.activeTab).toBe("home")
    store.setActiveTab("insert")
    expect(store.activeTab).toBe("insert")
  })

  it("toggles file menu", () => {
    const store = new DocumentStore()
    expect(store.isFileMenuOpen).toBe(false)
    store.setFileMenuOpen(true)
    expect(store.isFileMenuOpen).toBe(true)
    store.setFileMenuOpen(false)
    expect(store.isFileMenuOpen).toBe(false)
  })

  it("sets left menu panel", () => {
    const store = new DocumentStore()
    store.setActiveLeftPanel("thumbnails")
    expect(store.activeLeftPanel).toBe("thumbnails")
    store.setActiveLeftPanel(null)
    expect(store.activeLeftPanel).toBeNull()
  })

  it("sets right menu panel", () => {
    const store = new DocumentStore()
    store.setActiveRightPanel("comments")
    expect(store.activeRightPanel).toBe("comments")
  })

  it("sets document ready state", () => {
    const store = new DocumentStore()
    store.setDocReady(true)
    expect(store.isDocReady).toBe(true)
    store.setDocReady(false)
    expect(store.isDocReady).toBe(false)
  })
})
