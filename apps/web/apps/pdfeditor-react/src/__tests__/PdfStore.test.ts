import { describe, expect, it } from "vitest"
import { PdfStore } from "../stores/PdfStore"
import type { PdfAnnotation } from "../stores/PdfStore"

describe("PdfStore", () => {
  it("initializes with default state", () => {
    const store = new PdfStore()
    expect(store.mode).toBeNull()
    expect(store.document).toBeNull()
    expect(store.isDocReady).toBe(false)
    expect(store.zoomLevel).toBe(100)
    expect(store.currentPage).toBe(0)
    expect(store.pageCount).toBe(0)
    expect(store.pages).toEqual([])
    expect(store.toolbarVisible).toBe(true)
    expect(store.leftMenuVisible).toBe(true)
    expect(store.rightMenuVisible).toBe(false)
    expect(store.annotations).toEqual([])
    expect(store.activeAnnotationTool).toBeNull()
    expect(store.pdfDocProxy).toBeNull()
    expect(store.isModified).toBe(false)
    expect(store.isSaving).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.isLoadingError).toBeNull()
    expect(store.isRedacting).toBe(false)
    expect(store.currentTool).toBe("select")
    expect(store.searchQuery).toBe("")
    expect(store.searchResults).toBe(0)
    expect(store.commentCount).toBe(0)
    expect(store.fitToPage).toBe(false)
    expect(store.fitToWidth).toBe(false)
    expect(store.isCompactToolbar).toBe(false)
    expect(store.isCompactStatusbar).toBe(true)
    expect(store.activeTab).toBeNull()
    expect(store.isFileMenuOpen).toBe(false)
    expect(store.activeLeftPanel).toBeNull()
    expect(store.activeRightPanel).toBeNull()
    expect(store.activeFileMenuPanel).toBeNull()
  })

  // ── Zoom ──

  it("handles zoom", () => {
    const store = new PdfStore()
    store.setZoomLevel(150)
    expect(store.zoomLevel).toBe(150)
    store.zoomIn()
    expect(store.zoomLevel).toBeGreaterThan(150)
    store.zoomOut()
    expect(store.zoomLevel).toBe(150)
  })

  it("clamps zoom level to min/max", () => {
    const store = new PdfStore()
    store.setZoomLevel(10)
    expect(store.zoomLevel).toBe(50)
    store.setZoomLevel(999)
    expect(store.zoomLevel).toBe(500)
  })

  it("disables fit-to-page and fit-to-width when zoom is set", () => {
    const store = new PdfStore()
    store.setFitToPage(true)
    expect(store.fitToPage).toBe(true)
    store.setZoomLevel(100)
    expect(store.fitToPage).toBe(false)
    expect(store.fitToWidth).toBe(false)
  })

  it("toggles fit-to-page and fit-to-width mutually exclusive", () => {
    const store = new PdfStore()
    store.setFitToPage(true)
    expect(store.fitToPage).toBe(true)
    expect(store.fitToWidth).toBe(false)
    store.setFitToWidth(true)
    expect(store.fitToWidth).toBe(true)
    expect(store.fitToPage).toBe(false)
  })

  // ── UI Panel Toggles ──

  it("toggles UI panels", () => {
    const store = new PdfStore()
    store.setLeftMenuVisible(false)
    expect(store.leftMenuVisible).toBe(false)
    store.setRightMenuVisible(true)
    expect(store.rightMenuVisible).toBe(true)
  })

  it("toggles left panel: opening closes file menu and tab", () => {
    const store = new PdfStore()
    store.setFileMenuOpen(true)
    store.setActiveTab("home")
    store.setActiveLeftPanel("thumbnails")
    expect(store.activeLeftPanel).toBe("thumbnails")
    expect(store.isFileMenuOpen).toBe(false)
    expect(store.activeTab).toBeNull()
  })

  it("toggleLeftPanel toggles same panel off", () => {
    const store = new PdfStore()
    store.toggleLeftPanel("thumbnails")
    expect(store.activeLeftPanel).toBe("thumbnails")
    store.toggleLeftPanel("thumbnails")
    expect(store.activeLeftPanel).toBeNull()
  })

  it("toggleLeftPanel switches between panels", () => {
    const store = new PdfStore()
    store.toggleLeftPanel("thumbnails")
    expect(store.activeLeftPanel).toBe("thumbnails")
    store.toggleLeftPanel("navigation")
    expect(store.activeLeftPanel).toBe("navigation")
  })

  it("toggles right panel", () => {
    const store = new PdfStore()
    store.toggleRightPanel("annotations")
    expect(store.activeRightPanel).toBe("annotations")
    store.toggleRightPanel("annotations")
    expect(store.activeRightPanel).toBeNull()
  })

  // ── Page Navigation ──

  it("handles page navigation", () => {
    const store = new PdfStore()
    store.setPageCount(10)
    store.setCurrentPage(5)
    expect(store.currentPage).toBe(5)
    store.setCurrentPage(0)
    expect(store.currentPage).toBe(0)
  })

  it("setPages updates pages and pageCount", () => {
    const store = new PdfStore()
    store.setPages([
      { index: 0, label: "1" },
      { index: 1, label: "2" },
    ])
    expect(store.pages).toHaveLength(2)
    expect(store.pageCount).toBe(2)
    expect(store.pages[0].label).toBe("1")
  })

  // ── Annotations ──

  it("adds annotation with generated id and marks modified", () => {
    const store = new PdfStore()
    store.addAnnotation({
      page: 1,
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      color: "#FF0000",
      text: "Note",
    })
    expect(store.annotations).toHaveLength(1)
    expect(store.annotations[0].id).toMatch(/^annot-/)
    expect(store.annotations[0].page).toBe(1)
    expect(store.annotations[0].text).toBe("Note")
    expect(store.isModified).toBe(true)
  })

  it("removes annotation by id and marks modified", () => {
    const store = new PdfStore()
    store.addAnnotation({ page: 1, x: 0, y: 0, width: 10, height: 10, color: "#F00" })
    const id = store.annotations[0].id
    store.isModified = false
    store.removeAnnotation(id)
    expect(store.annotations).toHaveLength(0)
    expect(store.isModified).toBe(true)
  })

  it("removeAnnotation with non-existent id does nothing", () => {
    const store = new PdfStore()
    store.addAnnotation({ page: 1, x: 0, y: 0, width: 10, height: 10, color: "#F00" })
    store.removeAnnotation("nonexistent")
    expect(store.annotations).toHaveLength(1)
  })

  it("sets annotation tool", () => {
    const store = new PdfStore()
    store.setAnnotationTool("highlight")
    expect(store.activeAnnotationTool).toBe("highlight")
    store.setAnnotationTool(null)
    expect(store.activeAnnotationTool).toBeNull()
  })

  // ── Tab / FileMenu ──

  it("sets tabs and opens file menu", () => {
    const store = new PdfStore()
    store.setActiveTab("file")
    expect(store.activeTab).toBe("file")
    expect(store.isFileMenuOpen).toBe(true)
  })

  it("setActiveTab for non-file tab does not open file menu", () => {
    const store = new PdfStore()
    store.setActiveTab("home")
    expect(store.activeTab).toBe("home")
    expect(store.isFileMenuOpen).toBe(false)
  })

  it("closing file menu clears active tab", () => {
    const store = new PdfStore()
    store.setActiveTab("file")
    store.setFileMenuOpen(false)
    expect(store.isFileMenuOpen).toBe(false)
    expect(store.activeTab).toBeNull()
  })

  it("toggles file menu", () => {
    const store = new PdfStore()
    store.setFileMenuOpen(true)
    expect(store.isFileMenuOpen).toBe(true)
  })

  // ── Tool Selection ──

  it("sets current tool", () => {
    const store = new PdfStore()
    store.setCurrentTool("hand")
    expect(store.currentTool).toBe("hand")
    store.setCurrentTool("select")
    expect(store.currentTool).toBe("select")
  })

  // ── Search ──

  it("sets search query and results", () => {
    const store = new PdfStore()
    store.setSearchQuery("hello")
    expect(store.searchQuery).toBe("hello")
    store.setSearchResults(3)
    expect(store.searchResults).toBe(3)
  })

  // ── Mode ──

  it("sets mode and derives isEditMode", () => {
    const store = new PdfStore()
    store.setMode({
      isEdit: true,
      isPDFEdit: true,
      isRestrictedEdit: false,
      isDisconnected: false,
      canCoAuthoring: false,
      canChat: false,
      canDownload: true,
      canPrint: true,
      canPreviewPrint: true,
      canRename: true,
      canBack: true,
      canHelp: true,
      canSuggest: false,
      canOpenRecent: true,
      canCreateNew: true,
      canCloseEditor: true,
      enableDownload: true,
      isDesktopApp: false,
      isOffline: false,
      compactview: false,
      customization: { goback: {} },
    } as unknown as PdfMode)
    expect(store.mode?.isEdit).toBe(true)
    expect(store.isEditMode).toBe(true)
  })

  it("sets mode with restricted edit", () => {
    const store = new PdfStore()
    store.setMode({
      isEdit: true,
      isPDFEdit: false,
      isRestrictedEdit: true,
      isDisconnected: false,
      canCoAuthoring: false,
      canChat: false,
      canDownload: true,
      canPrint: true,
      canPreviewPrint: true,
      canRename: true,
      canBack: true,
      canHelp: true,
      canSuggest: false,
      canOpenRecent: true,
      canCreateNew: true,
      canCloseEditor: true,
      enableDownload: true,
      isDesktopApp: false,
      isOffline: false,
      compactview: false,
      customization: { goback: {} },
    } as unknown as PdfMode)
    expect(store.mode?.isRestrictedEdit).toBe(true)
    expect(store.isEditMode).toBe(true)
  })

  // ── Document State ──

  it("sets document and ready state", () => {
    const store = new PdfStore()
    store.setDocument({ title: "test.pdf", fileType: "pdf" })
    expect(store.document?.title).toBe("test.pdf")
    store.setDocReady(true)
    expect(store.isDocReady).toBe(true)
  })

  it("sets pdfDocProxy", () => {
    const store = new PdfStore()
    store.setPdfDocProxy({ numPages: 5 } as unknown as import("pdfjs-dist").PDFDocumentProxy)
    expect(store.pdfDocProxy?.numPages).toBe(5)
    store.setPdfDocProxy(null)
    expect(store.pdfDocProxy).toBeNull()
  })

  it("sets format", () => {
    const store = new PdfStore()
    store.setFormat("svg")
    expect(store.format).toBe("svg")
    store.setFormat("native")
    expect(store.format).toBe("native")
  })

  // ── buildDocumentBlob ──

  it("buildDocumentBlob returns lastLoadedContent when no annotations", async () => {
    const store = new PdfStore()
    const content = new Blob(["PDF data"], { type: "application/pdf" })
    store.lastLoadedContent = content
    const blob = await store.buildDocumentBlob()
    expect(blob).toBe(content)
  })

  it("buildDocumentBlob returns empty blob when no content loaded", async () => {
    const store = new PdfStore()
    const blob = await store.buildDocumentBlob()
    expect(blob.size).toBe(0)
    expect(blob.type).toBe("application/pdf")
  })

  // ── Redaction ──

  it("manages redaction state", () => {
    const store = new PdfStore()
    expect(store.isRedacting).toBe(false)
    expect(store.redactionApplied).toBe(false)
    // PdfStore properties are public - test they exist
    expect("isRedacting" in store).toBe(true)
    expect("redactionApplied" in store).toBe(true)
  })

  // ── Form Fields ──

  it("tracks form field index", () => {
    const store = new PdfStore()
    expect(store.currentFormFieldIndex).toBe(0)
    expect(store.totalFormFields).toBe(0)
    expect("currentFormFieldIndex" in store).toBe(true)
    expect("totalFormFields" in store).toBe(true)
  })

  // ── Comments ──

  it("sets comment count", () => {
    const store = new PdfStore()
    store.commentCount = 5
    expect(store.commentCount).toBe(5)
  })

  // ── Compact Mode ──

  it("sets compact toolbar", () => {
    const store = new PdfStore()
    store.setCompactToolbar(true)
    expect(store.isCompactToolbar).toBe(true)
  })

  it("sets compact statusbar", () => {
    const store = new PdfStore()
    store.setCompactStatusbar(true)
    expect(store.isCompactStatusbar).toBe(true)
  })

  // ── File Menu Panel ──

  it("sets active file menu panel", () => {
    const store = new PdfStore()
    store.setActiveFileMenuPanel("saveas")
    expect(store.activeFileMenuPanel).toBe("saveas")
    store.setActiveFileMenuPanel(null)
    expect(store.activeFileMenuPanel).toBeNull()
  })

  // ── WOPI State ──

  it("initializes WOPI state correctly", () => {
    const store = new PdfStore()
    expect(store.wopiConnection).toBeNull()
    expect(store.wopiFileInfo).toBeNull()
    expect(store.lastLoadedContent).toBeNull()
  })
})
