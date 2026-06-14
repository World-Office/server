import { makeAutoObservable } from "mobx"
import type { EditorMode, LeftMenuAction, PageTab, VisioDocument, VisioMode, ZoomLevel } from "../types/visio"
import { ZOOM_LEVELS } from "../types/visio"

const STORAGE_PREFIX = "ve-"

export class VisioStore {
  mode: VisioMode | null = null
  document: VisioDocument | null = null
  isDocReady = false

  /* Editor mode */
  editorMode: EditorMode = "vsdx"

  setEditorMode(mode: EditorMode): void {
    this.editorMode = mode
  }

  toggleEditorMode(): void {
    this.editorMode = this.editorMode === "vsdx" ? "flowchart" : "vsdx"
  }

  /* Toolbar */
  activeTab: "file" | "view" | null = null
  isFileMenuOpen = false

  /* ViewTab / Zoom */
  zoomLevel: ZoomLevel = 100
  fitToPage = false
  fitToWidth = false

  /* UI toggles */
  toolbarVisible = true
  statusbarVisible = true
  leftMenuVisible = true
  isCompactToolbar = false
  isCompactStatusbar = true

  /* Left menu */
  activeLeftPanel: LeftMenuAction | null = null
  leftMenuMinWidth = 40
  leftMenuExpandedWidth = 300

  /* Page tabs */
  pageTabs: PageTab[] = []
  currentPageIndex = 0
  pageCount = 0

  /* File menu */
  activeFileMenuPanel: string | null = null

  /* Search (commented out in original — skip) */

  constructor() {
    makeAutoObservable(this)
  }

  /* ── Actions ── */

  setMode(mode: VisioMode): void {
    this.mode = mode
  }

  setDocument(doc: VisioDocument): void {
    this.document = doc
  }

  setDocReady(ready: boolean): void {
    this.isDocReady = ready
  }

  setActiveTab(tab: "file" | "view" | null): void {
    this.activeTab = tab
    if (tab === "file") {
      this.isFileMenuOpen = true
    }
  }

  setFileMenuOpen(open: boolean): void {
    this.isFileMenuOpen = open
    if (!open) {
      this.activeTab = null
    }
  }

  setZoomLevel(level: number): void {
    const clamped = Math.max(
      ZOOM_LEVELS[0] as number,
      Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1] as number, level),
    ) as ZoomLevel
    this.zoomLevel = clamped
    this.fitToPage = false
    this.fitToWidth = false
  }

  zoomIn(): void {
    this.setZoomLevel(this.zoomLevel + (this.zoomLevel < 100 ? 25 : 50))
  }

  zoomOut(): void {
    this.setZoomLevel(this.zoomLevel - (this.zoomLevel <= 100 ? 25 : 50))
  }

  setFitToPage(value: boolean): void {
    this.fitToPage = value
    if (value) this.fitToWidth = false
  }

  setFitToWidth(value: boolean): void {
    this.fitToWidth = value
    if (value) this.fitToPage = false
  }

  setToolbarVisible(visible: boolean): void {
    this.toolbarVisible = visible
  }

  setStatusbarVisible(visible: boolean): void {
    this.statusbarVisible = visible
    setStorageItem("hidden-status", visible ? "" : "true")
  }

  setLeftMenuVisible(visible: boolean): void {
    this.leftMenuVisible = visible
    setStorageItem("hidden-leftmenu", visible ? "" : "true")
  }

  setActiveLeftPanel(action: LeftMenuAction | null): void {
    this.activeLeftPanel = action
    if (action) {
      this.isFileMenuOpen = false
      this.activeTab = null
    }
  }

  toggleLeftPanel(action: LeftMenuAction): void {
    this.setActiveLeftPanel(this.activeLeftPanel === action ? null : action)
  }

  setPageTabs(tabs: PageTab[], currentIndex: number): void {
    this.pageTabs = tabs
    this.currentPageIndex = currentIndex
    this.pageCount = tabs.length
  }

  setCurrentPageIndex(index: number): void {
    this.currentPageIndex = index
    const tabs = this.pageTabs.map((tab, i) => ({
      sheetIndex: tab.sheetIndex,
      label: tab.label,
      active: i === index,
    }))
    this.pageTabs = tabs
  }

  setActiveFileMenuPanel(panel: string | null): void {
    this.activeFileMenuPanel = panel
  }

  setCompactToolbar(compact: boolean): void {
    this.isCompactToolbar = compact
    setStorageItem("compact-toolbar", compact ? "true" : "false")
  }

  setCompactStatusbar(compact: boolean): void {
    this.isCompactStatusbar = compact
    setStorageItem("compact-statusbar", compact ? "true" : "")
  }
}

function setStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, value)
  } catch {
    // localStorage may be unavailable in private browsing
  }
}

export const visioStore = new VisioStore()
