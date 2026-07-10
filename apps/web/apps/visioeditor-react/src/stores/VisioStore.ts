import { detectWopiParams as detectWopi, loadDocument, putFile } from "@world-office/wopi-client"
import { makeAutoObservable } from "mobx"
import type {
  EditorMode,
  LeftMenuAction,
  PageTab,
  VisioDocument,
  VisioMode,
  ZoomLevel,
} from "../types/visio"
import { ZOOM_LEVELS } from "../types/visio"
import { flowchartStore } from "./FlowchartStore"

const STORAGE_PREFIX = "ve-"

export class VisioStore {
  mode: VisioMode | null = null
  document: VisioDocument | null = null
  isDocReady = false
  isLoading = false
  isLoadingError: string | null = null
  isSaving = false
  isModified = false

  /* WOPI document connection */
  wopiFileId: string | null = null
  wopiAccessToken: string | null = null
  docserverBase = ""
  format: "native" | "svg" = "native"

  markModified(): void {
    this.isModified = true
  }

  clearModified(): void {
    this.isModified = false
  }

  detectWopiParams(): boolean {
    const conn = detectWopi()
    if (!conn) return false
    this.wopiFileId = conn.wopiFileId
    this.wopiAccessToken = conn.wopiAccessToken
    this.docserverBase = conn.docserverBase
    return true
  }

  setFormat(format: "native" | "svg"): void {
    this.format = format
  }

  async loadFromWopi(): Promise<void> {
    this.isLoading = true
    this.isLoadingError = null
    try {
      const conn = {
        // biome-ignore lint/style/noNonNullAssertion: guarded by isDocReady check before calling loadFromWopi
        wopiFileId: this.wopiFileId!,
        // biome-ignore lint/style/noNonNullAssertion: guarded by isDocReady check before calling loadFromWopi
        wopiAccessToken: this.wopiAccessToken!,
        docserverBase: this.docserverBase,
      }
      const { info, content } = await loadDocument(conn)

      this.document = {
        title: info.BaseFileName ?? "Untitled",
        fileType: info.BaseFileName?.split(".").pop() ?? "vsdx",
        info: {
          author: info.OwnerId,
          modified: info.Version,
          sheetCount: 1,
          width: 1200,
          height: 800,
        },
      }

      if (this.editorMode === "flowchart") {
        try {
          const text = await content.text()
          const json = JSON.parse(text) as {
            flowchart: Parameters<typeof flowchartStore.fromJSON>[0]
          }
          if (json.flowchart) {
            flowchartStore.fromJSON(json.flowchart)
          }
        } catch {
          flowchartStore.clear()
          flowchartStore.history = []
          flowchartStore.future = []
        }
      }

      this.isDocReady = true
      this.isModified = false
    } catch (err) {
      this.isLoadingError = err instanceof Error ? err.message : "Failed to load document"
    } finally {
      this.isLoading = false
    }
  }

  async saveToWopi(): Promise<void> {
    if (!this.wopiFileId || !this.wopiAccessToken) {
      this.exportAsDownload()
      return
    }
    this.isSaving = true
    try {
      const conn = {
        wopiFileId: this.wopiFileId,
        wopiAccessToken: this.wopiAccessToken,
        docserverBase: this.docserverBase,
      }
      await putFile(conn, this.buildDocumentBlob())
      this.isModified = false
    } finally {
      this.isSaving = false
    }
  }

  buildDocumentBlob(): Blob {
    const payload = { flowchart: flowchartStore.toJSON() }
    return new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    })
  }

  async save(): Promise<void> {
    if (this.editorMode !== "flowchart") return
    this.markModified()
    try {
      await this.saveToWopi()
    } catch (err) {
      console.error("Save failed:", err)
    }
  }

  exportAsDownload(): void {
    const blob = this.buildDocumentBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const baseName = this.document?.title?.replace(/\.[^.]+$/, "")
    a.download = baseName ? `${baseName}.wo-flowchart` : "flowchart.wo-flowchart"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

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
