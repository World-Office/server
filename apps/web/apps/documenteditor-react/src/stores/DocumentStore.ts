import {
  type WopiConnection,
  type WopiFileInfo,
  detectWopiParams,
  loadDocument,
  putFile,
} from "@world-office/wopi-client"
import { makeAutoObservable } from "mobx"
import type {
  DocumentDocument,
  DocumentMode,
  DocumentTab,
  LeftMenuAction,
  PageInfo,
  RightMenuPanel,
  ZoomLevel,
} from "../types/document"
import { ZOOM_LEVELS } from "../types/document"

const STORAGE_PREFIX = "de-"

export class DocumentStore {
  mode: DocumentMode | null = null
  document: DocumentDocument | null = null
  isDocReady = false

  /* WOPI */
  isModified = false
  isSaving = false
  isLoading = false
  loadError: string | null = null
  wopiFileInfo: WopiFileInfo | null = null
  lastLoadedContent: Blob | null = null
  wopiConnection: WopiConnection | null = null

  /* Toolbar */
  activeTab: DocumentTab | null = null
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
  totalPages = 0
  pages: PageInfo[] = []

  /* File menu */
  activeFileMenuPanel: string | null = null

  /* Language */
  languageCode = "en-US"

  /* Word count */
  wordCount = 0

  /* Track changes */
  trackChanges = false

  /* Spelling */
  spellingEnabled = true

  /* Desktop integration */
  isDesktop = false
  filePath: string | null = null
  fileName = "Untitled Document"
  isDirty = false
  format: "native" | "svg" = "native"

  constructor() {
    makeAutoObservable(this)
    const params = detectWopiParams()
    if (params) {
      this.wopiConnection = params
      this.detectAndLoadWopi()
    }
  }

  /* ── Actions ── */

  setMode(mode: DocumentMode): void {
    this.mode = mode
    this.isEditMode = mode.isEdit
  }

  setDocument(doc: DocumentDocument): void {
    this.document = doc
  }

  setDocReady(ready: boolean): void {
    this.isDocReady = ready
  }

  setActiveTab(tab: DocumentTab | null): void {
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

  setTotalPages(count: number): void {
    this.totalPages = count
  }

  setPages(pages: PageInfo[]): void {
    this.pages = pages
    this.totalPages = pages.length
  }

  setActiveFileMenuPanel(panel: string | null): void {
    this.activeFileMenuPanel = panel
  }

  setLanguageCode(code: string): void {
    this.languageCode = code
  }

  setWordCount(count: number): void {
    this.wordCount = count
  }

  setTrackChanges(enabled: boolean): void {
    this.trackChanges = enabled
  }

  setSpellingEnabled(enabled: boolean): void {
    this.spellingEnabled = enabled
  }

  setCompactToolbar(compact: boolean): void {
    this.isCompactToolbar = compact
    setStorageItem("compact-toolbar", compact ? "true" : "false")
  }

  setCompactStatusbar(compact: boolean): void {
    this.isCompactStatusbar = compact
    setStorageItem("compact-statusbar", compact ? "true" : "")
  }

  setIsDesktop(value: boolean): void {
    this.isDesktop = value
  }

  setFilePath(path: string | null): void {
    this.filePath = path
    this.fileName = path ? (path.split(/[/\\]/).pop() ?? "Untitled Document") : "Untitled Document"
  }

  setDirty(dirty: boolean): void {
    this.isDirty = dirty
  }

  markSaved(): void {
    this.isDirty = false
  }

  /* ── WOPI ── */

  async detectAndLoadWopi(): Promise<void> {
    if (!this.wopiConnection) {
      const params = detectWopiParams()
      if (!params) return
      this.wopiConnection = params
    }
    await this.loadFromWopi(this.wopiConnection)
  }

  async loadFromWopi(conn: WopiConnection): Promise<void> {
    this.isLoading = true
    this.loadError = null
    try {
      const { info, content } = await loadDocument(conn)
      this.wopiFileInfo = info
      this.lastLoadedContent = content
      this.fileName = info.BaseFileName ?? "Untitled Document"
      this.filePath = conn.wopiFileId
      this.setDocument({
        title: this.fileName,
        fileType: this.fileName.split(".").pop() ?? "docx",
      })
      this.isDocReady = true
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err)
    } finally {
      this.isLoading = false
    }
  }

  async saveToWopi(): Promise<void> {
    if (!this.wopiConnection) return
    if (!this.isModified && !this.isDirty) return
    this.isSaving = true
    try {
      const blob = this.buildDocumentBlob()
      await putFile(this.wopiConnection, blob)
      this.isModified = false
      this.isDirty = false
      this.lastLoadedContent = blob
    } catch (err) {
      console.error("WOPI save failed, falling back to download", err)
      this.exportAsDownload()
    } finally {
      this.isSaving = false
    }
  }

  buildDocumentBlob(): Blob {
    if (this.lastLoadedContent && !this.isModified && !this.isDirty) {
      return this.lastLoadedContent
    }
    return new Blob(["<document serialization placeholder>"], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
  }

  exportAsDownload(): void {
    const blob = this.buildDocumentBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = this.fileName || "document.docx"
    a.click()
    URL.revokeObjectURL(url)
  }

  setFormat(format: "native" | "svg"): void {
    this.format = format
  }
}

function setStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, value)
  } catch {
    // Ignore storage errors
  }
}

export const documentStore = new DocumentStore()
