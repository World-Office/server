import {
  type WopiConnection,
  type WopiFileInfo,
  detectWopiParams,
  loadDocument,
  putFile,
} from "@world-office/wopi-client"
import { makeAutoObservable } from "mobx"
import { convertFromHtml, convertToHtml, toDocxForCanvas } from "../lib/conversion"
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
  /**
   * Bridge to the active WASM canvas editor: serializes the live document
   * model to OOXML. Registered by WasmEditorCanvas on mount so that canvas
   * edits actually persist (the store cannot reach the editor internals).
   */
  canvasSerializer: (() => Promise<Blob | null> | Blob | null) | null = null
  /** Debounced autosave handle (store-level; does not depend on React lifecycles). */
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null

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

  /* Page layout */
  pageOrientation: "portrait" | "landscape" = "portrait"
  pageSize: "A4" | "A3" | "Letter" | "Legal" = "A4"
  pageMargins: "normal" | "narrow" | "wide" = "normal"
  columns: number = 1

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

  /* Header / Footer */
  headerHtml = ""
  footerHtml = ""
  headerFooterMode: "none" | "header" | "footer" = "none"
  differentFirstPage = false
  differentOddEven = false

  /* View options */
  rulerVisible = true
  gridlinesVisible = false
  navigationVisible = false

  /* Spelling */
  spellingEnabled = true

  /* Auto-correction */
  autoCorrectEnabled = true

  /* Theme */
  themeId = "office"

  /* Find & Replace panel */
  showFindPanel = false

  /* Desktop integration */
  isDesktop = false
  filePath: string | null = null
  fileName = "Untitled Document"
  isDirty = false
  lastSavedAt: Date | null = null
  format: "native" | "svg" = "native"

  /* Rich text editor */
  richTextHtml: string | null = null
  richTextFormat: string | null = null

  /* Monaco (plain text / code) content — serialized verbatim on save */
  monacoContent: string | null = null
  monacoMime: string | null = null

  /* Undo/redo history */
  private contentHistory: string[] = []
  private historyIndex = -1
  canUndo = false
  canRedo = false

  get editorType(): "canvas" | "monaco" | "richtext" {
    const ext = this.fileName.toLowerCase().split(".").pop() ?? ""
    if (ext === "docx" || ext === "odt") return "richtext"
    if (
      [
        "txt",
        "md",
        "json",
        "rtf",
        "html",
        "htm",
        "xml",
        "js",
        "ts",
        "tsx",
        "jsx",
        "css",
        "scss",
        "py",
        "rs",
      ].includes(ext)
    )
      return "monaco"
    return "canvas"
  }

  constructor() {
    makeAutoObservable(this)
    this.detectAndLoadWopi()
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

  setDifferentFirstPage(value: boolean): void {
    this.differentFirstPage = value
  }

  setDifferentOddEven(value: boolean): void {
    this.differentOddEven = value
  }

  clearHeader(): void {
    this.headerHtml = ""
  }

  clearFooter(): void {
    this.footerHtml = ""
  }

  toggleRuler(): void {
    this.rulerVisible = !this.rulerVisible
  }

  toggleGridlines(): void {
    this.gridlinesVisible = !this.gridlinesVisible
  }

  toggleNavigation(): void {
    this.navigationVisible = !this.navigationVisible
  }

  setSpellingEnabled(enabled: boolean): void {
    this.spellingEnabled = enabled
  }

  markModified(): void {
    console.info("[StoreDebug] markModified called")
    this.isModified = true
    this.scheduleAutoSave()
  }

  /**
   * Store-level debounced autosave (3s). The React-hook autosave
   * (useEmbeddedAutoSave) depends on effect timing; this guarantees canvas
   * edits persist even when component lifecycles stall.
   */
  scheduleAutoSave(): void {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer)
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null
      void this.saveToWopi().catch(() => {})
    }, 3000)
  }

  setAutoCorrectEnabled(enabled: boolean): void {
    this.autoCorrectEnabled = enabled
  }

  setTheme(themeId: string): void {
    this.themeId = themeId
  }

  setShowFindPanel(visible: boolean): void {
    this.showFindPanel = visible
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
    this.lastSavedAt = new Date()
  }

  /* ── WOPI ── */

  async detectAndLoadWopi(): Promise<void> {
    if (!this.wopiConnection) {
      const params = detectWopiParams()
      if (!params) {
        await this.loadFromDemo()
        return
      }
      this.wopiConnection = params
    }
    await this.loadFromWopi(this.wopiConnection)
  }

  async loadFromWopi(conn: WopiConnection): Promise<void> {
    this.isLoading = true
    this.loadError = null
    this.resetHistory()
    try {
      const { info, content } = await loadDocument(conn)
      this.wopiFileInfo = info
      this.lastLoadedContent = content
      this.fileName = info.BaseFileName ?? "Untitled Document"
      this.filePath = conn.wopiFileId
      // WOPI UserCanWrite drives edit mode: enables Insert/Layout tabs and
      // all edit-dependent ribbon controls (was never wired up — isEditMode
      // stayed false, hiding tabs and making documents appear uneditable).
      this.setEditMode(info.UserCanWrite ?? false)
      this.setDocument({
        title: this.fileName,
        fileType: this.fileName.split(".").pop() ?? "docx",
      })
      const format = this.getDocumentFormat()
      if (format === "docx" || format === "odt") {
        this.richTextFormat = format
        // convertToHtml returns "" for empty files (0-byte new files from OpenCloud)
        this.richTextHtml = await convertToHtml(content, format)
        // Canvas-native: the WASM renderer accepts docx only — convert odt
        // to docx so the canvas can render it.
        this.lastLoadedContent = await toDocxForCanvas(content, format)
      }
      this.isDocReady = true
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err)
    } finally {
      this.isLoading = false
    }
  }

  async loadFromDemo(): Promise<void> {
    this.isLoading = true
    this.loadError = null
    this.resetHistory()
    try {
      const base = window.location.origin
      const infoRes = await fetch(`${base}/demo/info`)
      const info: WopiFileInfo = await infoRes.json()
      const contentRes = await fetch(`${base}/demo/document`)
      const content = await contentRes.blob()
      this.wopiFileInfo = info
      this.lastLoadedContent = content
      this.fileName = info.BaseFileName ?? "demo.docx"
      this.wopiConnection = null
      this.setEditMode(info.UserCanWrite ?? true)
      this.setDocument({
        title: this.fileName,
        fileType: "docx",
      })
      const format = this.getDocumentFormat()
      if (format === "docx" || format === "odt") {
        this.richTextFormat = format
        this.richTextHtml = await convertToHtml(content, format)
      }
      this.isDocReady = true
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err)
    } finally {
      this.isLoading = false
    }
  }

  async saveToWopi(): Promise<void> {
    console.info("[StoreDebug] saveToWopi", { conn: !!this.wopiConnection, mod: this.isModified, dirty: this.isDirty, ser: !!this.canvasSerializer })
    if (!this.wopiConnection) return
    if (!this.isModified && !this.isDirty) return
    this.isSaving = true
    try {
      const blob = await this.buildDocumentBlob()
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

  async buildDocumentBlob(): Promise<Blob> {
    if (this.lastLoadedContent && !this.isModified && !this.isDirty) {
      return this.lastLoadedContent
    }
    const format = this.richTextFormat
    if (this.editorType === "richtext" && this.richTextHtml && format) {
      return await convertFromHtml(this.richTextHtml, format)
    }
    // Monaco: serialize the edited text verbatim so saving never corrupts
    // the file with a placeholder. Type matches the original extension.
    if (this.editorType === "monaco" && this.monacoContent !== null) {
      return new Blob([this.monacoContent], {
        type: this.monacoMime ?? "text/plain; charset=utf-8",
      })
    }
    // Canvas (WASM) editing: serialize the live model to OOXML. Falls back
    // to the last loaded content when no canvas editor is active.
    if (this.canvasSerializer && (this.isModified || this.isDirty)) {
      const blob = await this.canvasSerializer()
      if (blob) return blob
    }
    if (this.lastLoadedContent) {
      return this.lastLoadedContent
    }
    return new Blob([""], { type: "text/plain; charset=utf-8" })
  }

  exportAsDownload(): void {
    void this.buildDocumentBlob().then((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = this.fileName || "document.docx"
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  setFormat(format: "native" | "svg"): void {
    this.format = format
  }

  updateRichText(html: string): void {
    this.pushSnapshot()
    this.richTextHtml = html
    this.isModified = true
  }

  updateMonacoContent(text: string): void {
    this.pushSnapshot()
    this.monacoContent = text
    this.isModified = true
  }

  /* ── Undo/redo ── */

  /** Clear undo/redo history (e.g., when loading a new document). */
  private resetHistory(): void {
    this.contentHistory = []
    this.historyIndex = -1
    this.canUndo = false
    this.canRedo = false
  }

  /** Capture a content snapshot before mutation. */
  private pushSnapshot(): void {
    const snapshot = this.editorType === "monaco" ? this.monacoContent : this.richTextHtml
    if (snapshot == null) return

    // Drop any future history past this point (e.g., after undo, a new action)
    if (this.historyIndex < this.contentHistory.length - 1) {
      this.contentHistory = this.contentHistory.slice(0, this.historyIndex + 1)
    }

    // Deduplicate: don't push if same as last
    if (this.contentHistory.length > 0 && this.contentHistory[this.historyIndex] === snapshot) {
      return
    }

    this.contentHistory.push(snapshot)
    this.historyIndex = this.contentHistory.length - 1

    this.canUndo = this.historyIndex > 0
    this.canRedo = false
  }

  undo(): void {
    if (this.historyIndex <= 0) return

    // Save current state as pending snapshot before moving back
    if (this.historyIndex >= this.contentHistory.length - 1) {
      const current = this.editorType === "monaco" ? this.monacoContent : this.richTextHtml
      if (current != null) {
        // Only push if last snapshot differs
        const last = this.contentHistory[this.contentHistory.length - 1]
        if (last !== current) {
          this.contentHistory.push(current)
          this.historyIndex++
        }
      }
    }

    this.historyIndex--
    const prev = this.contentHistory[this.historyIndex]

    if (this.editorType === "monaco") {
      this.monacoContent = prev
    } else {
      this.richTextHtml = prev
    }

    this.canUndo = this.historyIndex > 0
    this.canRedo = true
    this.isModified = true
  }

  redo(): void {
    if (this.historyIndex >= this.contentHistory.length - 1) return

    this.historyIndex++
    const next = this.contentHistory[this.historyIndex]

    if (this.editorType === "monaco") {
      this.monacoContent = next
    } else {
      this.richTextHtml = next
    }

    this.canUndo = true
    this.canRedo = this.historyIndex < this.contentHistory.length - 1
    this.isModified = true
  }

  getDocumentFormat(): string | null {
    const ext = this.fileName.toLowerCase().split(".").pop()
    if (ext === "txt" || ext === "md") {
      this.monacoMime = "text/plain; charset=utf-8"
    } else if (ext === "json") {
      this.monacoMime = "application/json"
    } else if (ext === "html" || ext === "htm") {
      this.monacoMime = "text/html; charset=utf-8"
    } else if (ext === "xml") {
      this.monacoMime = "application/xml"
    } else if (["js", "ts", "tsx", "jsx", "css", "scss", "py", "rs"].includes(ext ?? "")) {
      this.monacoMime = "text/plain; charset=utf-8"
    }
    return ext ?? null
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
