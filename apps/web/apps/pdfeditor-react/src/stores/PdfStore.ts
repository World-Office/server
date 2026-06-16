import { makeAutoObservable } from "mobx"
import type {
  AnnotationTool,
  LeftMenuAction,
  PageInfo,
  PdfDocument,
  PdfMode,
  PdfTab,
  RightMenuPanel,
  Tool,
  ZoomLevel,
} from "../types/pdf"
import { ZOOM_LEVELS } from "../types/pdf"
import { WopiClient, detectWopiParams } from "@world-office/wopi-client"
import type { WopiConnection, WopiFileInfo } from "@world-office/wopi-client"

const STORAGE_PREFIX = "pe-"

export class PdfStore {
  mode: PdfMode | null = null
  document: PdfDocument | null = null
  isDocReady = false
  format: "native" | "svg" = "native"

  /* Toolbar */
  activeTab: PdfTab | null = null
  isFileMenuOpen = false
  isEditMode = false

  /* ViewTab / Zoom */
  zoomLevel: ZoomLevel = 100
  fitToPage = false
  fitToWidth = false

  /* UI toggles */
  toolbarVisible = true
  statusbarVisible = true
  leftMenuVisible = true
  rightMenuVisible = false
  isCompactToolbar = false
  isCompactStatusbar = true

  /* Left menu */
  activeLeftPanel: LeftMenuAction | null = null
  leftMenuMinWidth = 40
  leftMenuExpandedWidth = 300

  /* Right menu */
  activeRightPanel: RightMenuPanel | null = null
  rightMenuMinWidth = 40
  rightMenuExpandedWidth = 300

  /* Page navigation */
  currentPage = 0
  pageCount = 0
  pages: PageInfo[] = []

  /* File menu */
  activeFileMenuPanel: string | null = null

  /* Annotation tools */
  activeAnnotationTool: AnnotationTool | null = null

  /* Form fields */
  currentFormFieldIndex = 0
  totalFormFields = 0

  /* Redaction */
  isRedacting = false
  redactionApplied = false

  /* Tool selection */
  currentTool: Tool = "select"

  /* Search */
  searchQuery = ""
  searchResults = 0

  /* Comments */
  commentCount = 0

  /* WOPI */
  isModified = false
  isSaving = false
  isLoading = false
  isLoadingError: string | null = null
  wopiFileInfo: WopiFileInfo | null = null
  wopiConnection: WopiConnection | null = null
  lastLoadedContent: Blob | null = null

  constructor() {
    makeAutoObservable(this)
  }

  /* ── Actions ── */

  setMode(mode: PdfMode): void {
    this.mode = mode
    this.isEditMode = mode.isEdit
  }

  setDocument(doc: PdfDocument): void {
    this.document = doc
  }

  setDocReady(ready: boolean): void {
    this.isDocReady = ready
  }

  setFormat(format: "native" | "svg"): void {
    this.format = format
  }

  setActiveTab(tab: PdfTab | null): void {
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

  setEditMode(editMode: boolean): void {
    this.isEditMode = editMode
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

  setRightMenuVisible(visible: boolean): void {
    this.rightMenuVisible = visible
    setStorageItem("hidden-rightmenu", visible ? "" : "true")
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

  setActiveRightPanel(panel: RightMenuPanel | null): void {
    this.activeRightPanel = panel
  }

  toggleRightPanel(panel: RightMenuPanel): void {
    this.setActiveRightPanel(this.activeRightPanel === panel ? null : panel)
  }

  setCurrentPage(index: number): void {
    this.currentPage = index
  }

  setPageCount(count: number): void {
    this.pageCount = count
  }

  setPages(pages: PageInfo[]): void {
    this.pages = pages
    this.pageCount = pages.length
  }

  setActiveFileMenuPanel(panel: string | null): void {
    this.activeFileMenuPanel = panel
  }

  setAnnotationTool(tool: AnnotationTool | null): void {
    this.activeAnnotationTool = tool
  }

  setCurrentTool(tool: Tool): void {
    this.currentTool = tool
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query
  }

  setSearchResults(count: number): void {
    this.searchResults = count
  }

  setCompactToolbar(compact: boolean): void {
    this.isCompactToolbar = compact
    setStorageItem("compact-toolbar", compact ? "true" : "false")
  }

  setCompactStatusbar(compact: boolean): void {
    this.isCompactStatusbar = compact
    setStorageItem("compact-statusbar", compact ? "true" : "")
  }

  /* ── WOPI ── */

  async detectAndLoadWopi(): Promise<void> {
    const params = detectWopiParams()
    if (params) {
      this.wopiConnection = params
      await this.loadFromWopi(params)
    } else {
      this.isLoading = false
      this.isDocReady = true
    }
  }

  async loadFromWopi(conn: WopiConnection): Promise<void> {
    this.isLoading = true
    this.isLoadingError = null
    try {
      const { info, content } = await WopiClient.loadDocument(conn)
      this.wopiFileInfo = info
      this.lastLoadedContent = content
      this.document = {
        title: info.BaseFileName || "Untitled",
        fileType: "pdf",
      }
      this.isDocReady = true
    } catch (err) {
      this.isLoadingError = err instanceof Error ? err.message : "Failed to load document"
    } finally {
      this.isLoading = false
    }
  }

  async saveToWopi(): Promise<void> {
    if (!this.wopiConnection || !this.isModified) return
    if (!this.wopiFileInfo?.UserCanWrite) {
      this.exportAsDownload()
      return
    }
    this.isSaving = true
    try {
      const blob = await this.buildDocumentBlob()
      await WopiClient.putFile(this.wopiConnection, blob)
      this.isModified = false
    } catch {
      this.exportAsDownload()
    } finally {
      this.isSaving = false
    }
  }

  buildDocumentBlob(): Blob {
    if (this.lastLoadedContent) {
      return this.lastLoadedContent
    }
    return new Blob(["PDF placeholder"], { type: "application/pdf" })
  }

  exportAsDownload(): void {
    const blob = this.buildDocumentBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = this.document?.title || "document.pdf"
    a.click()
    URL.revokeObjectURL(url)
  }
}

function setStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, value)
  } catch {}
}

export const pdfStore = new PdfStore()
