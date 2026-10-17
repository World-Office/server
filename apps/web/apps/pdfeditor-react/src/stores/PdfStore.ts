import { detectWopiParams, isEditable, loadDocument, putFile } from "@world-office/wopi-client"
import type { WopiConnection, WopiFileInfo } from "@world-office/wopi-client"
import { makeAutoObservable } from "mobx"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { produceAnnotatedPdf } from "../lib/annotation-conversion"
import {
  collectPdfOutline,
  collectPdfText,
  findPdfTextMatches,
  type PdfTextDocumentSource,
  type PdfTextMatch,
  type PdfTextPage,
} from "../lib/pdf-text"
import type {
  AnnotationTool,
  BookmarkNode,
  LeftMenuAction,
  PageInfo,
  PdfCommentReply,
  PdfCommentThread,
  PdfDocument,
  PdfMode,
  PdfTab,
  PanelChatMessage,
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

/**
 * Page-text cache, keyed by the document proxy. Deliberately outside the
 * observable store: pdf.js page text is immutable for a loaded document, and
 * re-extracting it on every keystroke would freeze large PDFs.
 */
const searchTextCache = new WeakMap<PdfTextDocumentSource, PdfTextPage[]>()

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

  /* Left-menu Comments panel */
  pageComments: PdfCommentThread[] = []
  /** Display name used for local comments and chat messages. */
  panelAuthor = "You"

  /* Left-menu Chat panel */
  chatMessages: PanelChatMessage[] = []

  /* Left-menu Navigation panel */
  bookmarks: BookmarkNode[] = []
  isOutlineLoading = false

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
  searchMatches: PdfTextMatch[] = []
  isSearching = false

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

  /** Go to the 1-based page number shown in the panels, clamped to the doc. */
  gotoPage(pageNumber: number): void {
    if (!Number.isFinite(pageNumber)) return
    const index = Math.min(Math.max(1, Math.trunc(pageNumber)), this.pageCount || 1) - 1
    this.setCurrentPage(index)
  }

  nextPage(): void {
    if (this.currentPage < this.pageCount - 1) this.setCurrentPage(this.currentPage + 1)
  }

  prevPage(): void {
    if (this.currentPage > 0) this.setCurrentPage(this.currentPage - 1)
  }

  setPageCount(count: number): void {
    this.pageCount = count
    this.prunePageComments()
  }

  setPages(pages: PageInfo[]): void {
    this.pages = pages
    this.pageCount = pages.length
    this.prunePageComments()
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

  setSearchMatches(matches: PdfTextMatch[]): void {
    this.searchMatches = matches
    this.searchResults = matches.length
  }

  /**
   * Left-menu Search panel: extract the page text once per document and match
   * the query against it. Works from a fake document in tests, and degrades to
   * "no text layer" for scanned PDFs instead of throwing.
   */
  async searchDocument(query: string, options?: { matchCase?: boolean }): Promise<PdfTextMatch[]> {
    this.searchQuery = query
    if (!query.trim()) {
      this.setSearchMatches([])
      return []
    }

    const proxy = this.pdfDocProxy
    if (!proxy) {
      this.setSearchMatches([])
      return []
    }

    this.isSearching = true
    try {
      let pages = searchTextCache.get(proxy)
      if (!pages) {
        pages = await collectPdfText(proxy)
        searchTextCache.set(proxy, pages)
      }
      const matches = findPdfTextMatches(pages, query, options)
      this.setSearchMatches(matches)
      return matches
    } catch {
      this.setSearchMatches([])
      return []
    } finally {
      this.isSearching = false
    }
  }

  /* ── Left-menu panels: comments + chat ── */

  /** Anchor a new comment thread to a page (0-based index). */
  addPageComment(pageIndex: number, text: string): PdfCommentThread | null {
    const clean = text.trim()
    if (!clean) return null
    const thread: PdfCommentThread = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pageIndex,
      author: this.panelAuthor,
      text: clean,
      createdAt: Date.now(),
      resolved: false,
      replies: [],
    }
    this.pageComments.push(thread)
    this.syncCommentCount()
    return thread
  }

  addPageReply(threadId: string, text: string): PdfCommentReply | null {
    const clean = text.trim()
    if (!clean) return null
    const thread = this.pageComments.find((t) => t.id === threadId)
    if (!thread) return null
    const reply: PdfCommentReply = {
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: this.panelAuthor,
      text: clean,
      createdAt: Date.now(),
    }
    thread.replies.push(reply)
    return reply
  }

  setPageCommentResolved(threadId: string, resolved: boolean): void {
    const thread = this.pageComments.find((t) => t.id === threadId)
    if (thread) thread.resolved = resolved
    this.syncCommentCount()
  }

  deletePageComment(threadId: string): void {
    this.pageComments = this.pageComments.filter((t) => t.id !== threadId)
    this.syncCommentCount()
  }

  setPageComments(threads: PdfCommentThread[]): void {
    this.pageComments = threads
    this.prunePageComments()
  }

  /** Drop threads anchored to a page the document no longer has. */
  prunePageComments(): void {
    if (this.pageComments.length === 0) return
    this.pageComments = this.pageComments.filter((t) => t.pageIndex < this.pageCount)
    this.syncCommentCount()
  }

  private syncCommentCount(): void {
    this.commentCount = this.pageComments.filter((t) => !t.resolved).length
  }

  addChatMessage(text: string): PanelChatMessage | null {
    const clean = text.trim()
    if (!clean) return null
    const message: PanelChatMessage = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: this.panelAuthor,
      text: clean,
      createdAt: Date.now(),
      self: true,
    }
    this.chatMessages.push(message)
    return message
  }

  setChatMessages(messages: PanelChatMessage[]): void {
    this.chatMessages = messages
  }

  clearChatMessages(): void {
    this.chatMessages = []
  }

  /* ── Left-menu Navigation panel: document outline (bookmarks) ── */

  setBookmarks(nodes: BookmarkNode[]): void {
    this.bookmarks = nodes
  }

  /**
   * Read the PDF outline (bookmark tree) into the store. Documents without a
   * bookmark tree — most exports — simply yield an empty list, and the panel
   * falls back to page navigation.
   */
  async loadOutline(): Promise<BookmarkNode[]> {
    const proxy = this.pdfDocProxy
    if (!proxy || typeof proxy.getOutline !== "function") {
      this.setBookmarks([])
      return []
    }

    this.isOutlineLoading = true
    try {
      const nodes = await proxy.getOutline()
      const bookmarks = collectPdfOutline(nodes)
      this.setBookmarks(bookmarks)
      return bookmarks
    } catch {
      this.setBookmarks([])
      return []
    } finally {
      this.isOutlineLoading = false
    }
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
      // WOPI UserCanWrite drives edit mode (was never wired — tabs/controls
      // stayed hidden and docs appeared uneditable).
      this.setEditMode(isEditable(info))
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
    if (this.isSaving) return // guard against Ctrl+S racing the autosave debounce
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
    await this.downloadBlob(await this.buildDocumentBlob(), this.document?.title || "document.pdf")
  }

  /** shared download path for the export / save-copy surfaces */
  private async downloadBlob(blob: Blob, fileName: string): Promise<void> {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * File → Rename... — retitles the current document (extension kept). The
   * WOPI host has no rename endpoint, so the change is local to the editor
   * session, but it drives Document Info and every export/download file name.
   * A standalone session (no WOPI file loaded) has no document yet — the
   * editor has been showing "Untitled" all along, so the rename seeds it
   * instead of silently doing nothing.
   */
  renameDocument(name: string): void {
    const clean = name.trim()
    if (!clean) return
    const current = this.document ?? { title: "Untitled", fileType: "pdf" }
    this.document = { ...current, title: clean }
    this.isModified = true
  }

  /**
   * File → Save Copy as... — downloads a copy of the current document
   * (annotations included) under the given name; the ".pdf" extension is kept.
   */
  async saveCopyAs(fileName: string): Promise<void> {
    const clean = fileName.trim()
    if (!clean) return
    const blob = await this.buildDocumentBlob()
    const name = /\.[^.]+$/.test(clean) ? clean : `${clean}.pdf`
    await this.downloadBlob(blob, name)
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
