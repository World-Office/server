import { describe, expect, it } from "vitest"
import { PresentationStore } from "../stores/PresentationStore"

describe("PresentationStore", () => {
  it("initializes with default state", () => {
    const store = new PresentationStore()
    expect(store.mode).toBeNull()
    expect(store.document).toBeNull()
    expect(store.isDocReady).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.isSaving).toBe(false)
    expect(store.isModified).toBe(false)
    expect(store.isLoadingError).toBeNull()
    expect(store.zoomLevel).toBe(100)
    expect(store.currentSlide).toBe(0)
    expect(store.toolbarVisible).toBe(true)
    expect(store.leftMenuVisible).toBe(true)
    expect(store.rightMenuVisible).toBe(false)
  })

  it("handles zoom", () => {
    const store = new PresentationStore()
    store.setZoomLevel(150)
    expect(store.zoomLevel).toBe(150)
    store.zoomIn()
    expect(store.zoomLevel).toBeGreaterThan(150)
    store.zoomOut()
    expect(store.zoomLevel).toBe(150)
  })

  it("toggles UI panels", () => {
    const store = new PresentationStore()
    store.setLeftMenuVisible(false)
    expect(store.leftMenuVisible).toBe(false)
    store.setRightMenuVisible(true)
    expect(store.rightMenuVisible).toBe(true)
  })

  it("handles modification state", () => {
    const store = new PresentationStore()
    expect(store.isModified).toBe(false)
    store.markModified()
    expect(store.isModified).toBe(true)
  })

  it("sets tabs", () => {
    const store = new PresentationStore()
    store.setActiveTab("home")
    expect(store.activeTab).toBe("home")
  })

  it("toggles file menu", () => {
    const store = new PresentationStore()
    store.setFileMenuOpen(true)
    expect(store.isFileMenuOpen).toBe(true)
  })
})
