import { detectWopiParams, loadDocument, putFile } from "@world-office/wopi-client"
import type { WopiConnection, WopiFileInfo } from "@world-office/wopi-client"
import { makeAutoObservable } from "mobx"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { produceAnnotatedPdf } from "../lib/annotation-conversion"
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

export interface PdfAnnotation {
  id: string
  page: number
  x: number
  y: number
  width: number
  height: number
  color: string
  text?: string
}

const STORAGE_PREFIX = "pe-"

export class PdfStore {
  mode: PdfMode | null = null
  document: PdfDocument | null = null
  isDocReady = false
  format: "native" | "svg" = "native"

  pdfDocProxy: PDFDocumentProxy | null = null

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

  /* Annotations */
  annotations: PdfAnnotation[] = []

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

  setPdfDocProxy(proxy: PDFDocumentProxy | null): void {
    this.pdfDocProxy = proxy
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

  addAnnotation(annot: {
    page: number
    x: number
    y: number
    width: number
    height: number
    color: string
    text?: string
  }): void {
    this.annotations.push({
      id: `annot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      page: annot.page,
      x: annot.x,
      y: annot.y,
      width: annot.width,
      height: annot.height,
      color: annot.color,
      text: annot.text,
    })
    this.isModified = true
  }

  removeAnnotation(id: string): void {
    this.annotations = this.annotations.filter((a) => a.id !== id)
    this.isModified = true
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
      const { info, content } = await loadDocument(conn)
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
      await this.exportAsDownload()
      return
    }
    this.isSaving = true
    try {
      const blob = await this.buildDocumentBlob()
      await putFile(this.wopiConnection, blob)
      this.isModified = false
    } catch {
      await this.exportAsDownload()
    } finally {
      this.isSaving = false
    }
  }

  async buildDocumentBlob(): Promise<Blob> {
    if (this.annotations.length === 0 && this.lastLoadedContent) {
      return this.lastLoadedContent
    }
    if (this.lastLoadedContent) {
      try {
        const annotated = await produceAnnotatedPdf(this.lastLoadedContent, this.annotations)
        return annotated
      } catch (err) {
        console.error("Failed to produce annotated PDF, falling back to original:", err)
        return this.lastLoadedContent
      }
    }
    // No content loaded — return empty PDF instead of placeholder text
    return new Blob([], { type: "application/pdf" })
  }

  async exportAsDownload(): Promise<void> {
    const blob = await this.buildDocumentBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = this.document?.title || "document.pdf"
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Export the first page (or all pages) as a PNG or JPG image.
   * Uses pdfjs-dist to render the page to a canvas.
   */
  async exportAsImage(format: "png" | "jpg"): Promise<void> {
    if (!this.pdfDocProxy) {
      alert("No PDF loaded to export")
      return
    }
    try {
      const page = await this.pdfDocProxy.getPage(1)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement("canvas")
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        alert("Canvas not supported")
        return
      }
      // Fill white background for JPG (no alpha)
      if (format === "jpg") {
        ctx.fillStyle = "#FFFFFF"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      await page.render({
        canvasContext: ctx as CanvasRenderingContext2D,
        viewport,
      } as unknown as Parameters<typeof page.render>[0]).promise
      const mimeType = format === "png" ? "image/png" : "image/jpeg"
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), mimeType, 0.92)
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const baseName = this.document?.title?.replace(/\.[^.]+$/, "")
      a.download = baseName ? `${baseName}.${format}` : `page-1.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(`Failed to export as ${format}:`, err)
      alert(`Failed to export as ${format.toUpperCase()}`)
    }
  }
}

function setStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, value)
  } catch {
    // localStorage may be unavailable in private browsing or storage-full contexts
  }
}

export const pdfStore = new PdfStore()
