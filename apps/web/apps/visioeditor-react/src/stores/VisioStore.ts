import { makeAutoObservable } from "mobx"
import type { EditorMode, LeftMenuAction, PageTab, VisioDocument, VisioMode, ZoomLevel } from "../types/visio"
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

  /* WOPI document loading */
  wopiFileId: string | null = null
  wopiAccessToken: string | null = null
  docserverBase: string = ""

  markModified(): void {
    this.isModified = true
  }

  clearModified(): void {
    this.isModified = false
  }

  /**
   * Extract WOPI parameters from the current URL. Returns true if
   * running in WOPI/server mode, false for standalone dev mode.
   */
  detectWopiParams(): boolean {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("access_token") || params.get("WOPI_ACCESS_TOKEN")
    const fileId = params.get("file_id") || params.get("WOPI_FILE_ID")
    if (token && fileId) {
      this.wopiAccessToken = token
      this.wopiFileId = fileId
      // Derive docserver base from current origin
      this.docserverBase = `${window.location.protocol}//${window.location.host}`
      return true
    }
    // Check for config in window.__WORLD_OFFICE_CONFIG__ (set by host page)
    const cfg = (window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__ as
      { wopiFileId?: string; wopiAccessToken?: string; docserverBase?: string } | undefined
    if (cfg?.wopiFileId && cfg?.wopiAccessToken) {
      this.wopiFileId = cfg.wopiFileId
      this.wopiAccessToken = cfg.wopiAccessToken
      this.docserverBase = cfg.docserverBase || window.location.origin
      return true
    }
    return false
  }

  /**
   * Fetch document info + content from WOPI endpoints and populate stores.
   */
  async loadFromWopi(): Promise<void> {
    this.isLoading = true
    this.isLoadingError = null
    try {
      const headers = { Authorization: `Bearer ${this.wopiAccessToken}` }
      // Fetch file info
      const infoUrl = `${this.docserverBase}/wopi/files/${this.wopiFileId}`
      const infoRes = await fetch(infoUrl, { headers })
      if (!infoRes.ok) throw new Error(`WOPI CheckFileInfo failed: ${infoRes.status}`)
      const info = await infoRes.json() as {
        BaseFileName?: string; OwnerId?: string; Size?: number; Version?: string; UserCanWrite?: boolean
      }

      // Set document metadata
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

      // Fetch file content
      const contentUrl = `${this.docserverBase}/wopi/files/${this.wopiFileId}/contents`
      const contentRes = await fetch(contentUrl, { headers })
      if (!contentRes.ok) throw new Error(`WOPI GetFile failed: ${contentRes.status}`)
      const blob = await contentRes.blob()

      // For flowchart mode: content is JSON
      if (this.editorMode === "flowchart") {
        try {
          const text = await blob.text()
          const json = JSON.parse(text) as { flowchart: Parameters<typeof flowchartStore.fromJSON>[0] }
          if (json.flowchart) {
            flowchartStore.fromJSON(json.flowchart)
          }
        } catch {
          // Empty content or invalid JSON — start with empty flowchart
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

  /**
   * Save the current flowchart document back to WOPI.
   */
  async saveToWopi(): Promise<void> {
    if (!this.wopiFileId || !this.wopiAccessToken) {
      // Fallback: trigger browser download
      this.exportAsDownload()
      return
    }
    this.isSaving = true
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.wopiAccessToken}`,
        "Content-Type": "application/octet-stream",
        "X-WOPI-Override": "PUT",
      }
      const body = this.buildDocumentBlob()
      const url = `${this.docserverBase}/wopi/files/${this.wopiFileId}/contents`
      const res = await fetch(url, { method: "POST", headers, body })
      if (!res.ok) throw new Error(`WOPI PutFile failed: ${res.status}`)
      this.isModified = false
    } catch (err) {
      throw err
    } finally {
      this.isSaving = false
    }
  }

  /**
   * Build the binary blob to save — for flowchart mode, JSON-serialized.
   */
  buildDocumentBlob(): Blob {
    const payload = { flowchart: flowchartStore.toJSON() }
    return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  }

  /**
   * Save-trigger: called by Ctrl+S and Save button.
   */
  async save(): Promise<void> {
    // Only meaningful in flowchart mode
    if (this.editorMode !== "flowchart") return
    this.markModified()
    try {
      await this.saveToWopi()
    } catch (err) {
      console.error("Save failed:", err)
    }
  }

  /**
   * Fallback export when WOPI is not available: download as JSON blob.
   */
  exportAsDownload(): void {
    const blob = this.buildDocumentBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const baseName = this.document?.title?.replace(/\.[^.]+$/, "")
    a.download = (baseName ? baseName + ".wo-flowchart" : "flowchart.wo-flowchart")
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
