import { describe, expect, it } from "vitest"
import { SpreadsheetStore } from "../stores/SpreadsheetStore"

describe("SpreadsheetStore", () => {
  it("initializes with default state", () => {
    const store = new SpreadsheetStore()
    expect(store.mode).toBeNull()
    expect(store.document).toBeNull()
    expect(store.isDocReady).toBe(false)
    expect(store.zoomLevel).toBe(100)
    expect(store.activeSheetIndex).toBe(0)
    expect(store.sheets).toEqual([])
    expect(store.toolbarVisible).toBe(true)
    expect(store.leftMenuVisible).toBe(true)
    expect(store.rightMenuVisible).toBe(false)
    expect(store.activeCell).toEqual({ row: 0, col: 0 })
    expect(store.showStatistics).toBe(false)
    expect(store.formulaInput).toBe("")
    expect(store.filteredCount).toBe(0)
  })

  it("handles zoom", () => {
    const store = new SpreadsheetStore()
    store.setZoomLevel(150)
    expect(store.zoomLevel).toBe(150)
    store.zoomIn()
    expect(store.zoomLevel).toBeGreaterThan(150)
    store.zoomOut()
    expect(store.zoomLevel).toBe(150)
  })

  it("toggles UI panels", () => {
    const store = new SpreadsheetStore()
    store.setLeftMenuVisible(false)
    expect(store.leftMenuVisible).toBe(false)
    store.setRightMenuVisible(true)
    expect(store.rightMenuVisible).toBe(true)
  })

  it("handles sheet navigation", () => {
    const store = new SpreadsheetStore()
    store.sheets = [{ id: "1", name: "Sheet1", tabColor: null }]
    store.setActiveSheetIndex(0)
    expect(store.activeSheetIndex).toBe(0)
  })

  it("tracks active cell", () => {
    const store = new SpreadsheetStore()
    store.setActiveCell(5, 10)
    expect(store.activeCell).toEqual({ row: 5, col: 10 })
    store.setActiveCell(0, 0)
    expect(store.activeCell).toEqual({ row: 0, col: 0 })
  })

  it("toggles statistics display", () => {
    const store = new SpreadsheetStore()
    expect(store.showStatistics).toBe(false)
    store.setShowStatistics(true)
    expect(store.showStatistics).toBe(true)
    store.setShowStatistics(false)
    expect(store.showStatistics).toBe(false)
  })

  it("tracks form input", () => {
    const store = new SpreadsheetStore()
    store.setFormulaInput("=SUM(A1:A10)")
    expect(store.formulaInput).toBe("=SUM(A1:A10)")
    store.setFormulaInput("")
    expect(store.formulaInput).toBe("")
  })

  it("toggles file menu", () => {
    const store = new SpreadsheetStore()
    store.setFileMenuOpen(true)
    expect(store.isFileMenuOpen).toBe(true)
  })

  it("sets tabs", () => {
    const store = new SpreadsheetStore()
    store.setActiveTab("home")
    expect(store.activeTab).toBe("home")
  })
})
