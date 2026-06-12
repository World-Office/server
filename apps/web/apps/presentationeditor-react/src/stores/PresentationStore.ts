import { makeAutoObservable } from "mobx"
import type {
  AdvanceMode,
  AnimationData,
  AnimationCategory,
  AnimationEffect,
  LeftMenuAction,
  PresentationDocument,
  PresentationMode,
  PresentationTab,
  RightMenuPanel,
  SlideLayout,
  SlideSize,
  StartAnimation,
  Theme,
  ThemeType,
  TransitionEffect,
  ZoomLevel,
} from "../types/presentation"
import type { ChartData, ChartType, ConnectorData, ShapeData } from "../types/presentation"
import { DEFAULT_THEME } from "../lib/themes"

export interface SlideData {
  id: string
  title: string
  layout: SlideLayout
  notes: string
  transitionEffect?: TransitionEffect
  transitionDuration?: number
  transitionSoundEnabled?: boolean
  advanceMode?: AdvanceMode
  advanceTiming?: number
  animations?: AnimationData[]
  shapes: ShapeData[]
}
import { ZOOM_LEVELS } from "../types/presentation"

const STORAGE_PREFIX = "prese-"

export class PresentationStore {
  mode: PresentationMode | null = null
  document: PresentationDocument | null = null
  isDocReady = false

  /* Toolbar */
  activeTab: PresentationTab | null = null
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

  /* Slide navigation */
  currentSlide = 0
  totalSlides = 0
  slides: SlideData[] = []

  /* File menu */
  activeFileMenuPanel: string | null = null

  /* Animation/Transition settings */
  transitionEffect: TransitionEffect = "none"
  transitionDuration = 0.5
  transitionSoundEnabled = false
  advanceMode: AdvanceMode = "click"
  advanceTiming = 3
  animationEffect: AnimationEffect = "none"
  animationStart: StartAnimation = "onClick"
  animationCategory: AnimationCategory = "none"
  animationDuration = 1
  animationDelay = 0

  /* Preview playback */
  isPreviewPlaying = false
  previewStep = 0

  /* Slide settings */
  slideSize: SlideSize = "standard"
  themeType: ThemeType = "builtin"
  theme: Theme = DEFAULT_THEME

  /* Shape selection — multi-select */
  selectedShapeIds: string[] = []

  /** Backward-compatible getter: returns first selected shape or null */
  get selectedShapeId(): string | null {
    return this.selectedShapeIds.length > 0 ? this.selectedShapeIds[0] : null
  }

  isSelected(id: string): boolean {
    return this.selectedShapeIds.includes(id)
  }

  selectShape(shapeId: string | null): void {
    this.selectedShapeIds = shapeId ? [shapeId] : []
  }

  deselectShape(): void {
    this.selectedShapeIds = []
  }

  toggleShapeSelection(id: string): void {
    const idx = this.selectedShapeIds.indexOf(id)
    if (idx === -1) {
      this.selectedShapeIds = [...this.selectedShapeIds, id]
    } else {
      const arr = this.selectedShapeIds.filter((s) => s !== id)
      this.selectedShapeIds = arr
    }
  }

  selectAllShapes(): void {
    const slide = this.slides[this.currentSlide]
    if (slide?.shapes) {
      this.selectedShapeIds = slide.shapes.map((s) => s.id)
    }
  }

  deselectAllShapes(): void {
    this.selectedShapeIds = []
  }

  /* Clipboard — multi-shape */
  clipboardShapes: ShapeData[] = []

  /** Backward-compatible getter: returns first clipboard shape or null */
  get clipboardShape(): ShapeData | null {
    return this.clipboardShapes.length > 0 ? this.clipboardShapes[0] : null
  }

  copyShape(): void {
    const slide = this.slides[this.currentSlide]
    if (!slide?.shapes) return
    this.clipboardShapes = this.selectedShapeIds
      .map((id) => slide.shapes.find((s) => s.id === id))
      .filter((s): s is ShapeData => !!s)
      .map((s) => ({ ...s, id: `clipboard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }))
  }

  cutShape(): void {
    const slide = this.slides[this.currentSlide]
    if (!slide?.shapes) return
    this.copyShape()
    const idsToRemove = new Set(this.selectedShapeIds)
    slide.shapes = slide.shapes.filter((s) => !idsToRemove.has(s.id))
    this.selectedShapeIds = []
  }

  pasteShape(): void {
    if (this.clipboardShapes.length === 0) return
    this.pushSnapshot()
    const slide = this.slides[this.currentSlide]
    if (!slide) return
    if (!slide.shapes) slide.shapes = []
    const pasteOffset = 30
    const newIds: string[] = []
    for (let i = 0; i < this.clipboardShapes.length; i++) {
      const src = this.clipboardShapes[i]
      const newShape: ShapeData = {
        ...src,
        id: `shape-${Date.now()}-${i}`,
        x: src.x + pasteOffset,
        y: src.y + pasteOffset,
        zIndex: slide.shapes.length + i,
      }
      slide.shapes.push(newShape)
      newIds.push(newShape.id)
    }
    this.selectedShapeIds = newIds
  }

  /* Inline text editing */
  editingShapeId: string | null = null
  inlineEditText = ""

  startInlineEdit(shapeId: string): void {
    const slide = this.slides[this.currentSlide]
    const shape = slide?.shapes?.find((s) => s.id === shapeId)
    if (!shape) return
    this.editingShapeId = shapeId
    this.inlineEditText = shape.text ?? ""
  }

  endInlineEdit(): void {
    if (this.editingShapeId) {
      this.pushSnapshot()
      const slide = this.slides[this.currentSlide]
      const shape = slide?.shapes?.find((s) => s.id === this.editingShapeId)
      if (shape) {
        shape.text = this.inlineEditText
      }
    }
    this.editingShapeId = null
    this.inlineEditText = ""
  }

  updateInlineText(text: string): void {
    this.inlineEditText = text
  }

  /* Undo/redo history */
  private slidesHistory: string[] = []
  private historyIndex = -1
  canUndo = false
  canRedo = false

  private pushSnapshot(): void {
    // Drop any future history past this point (e.g., after undo, a new action)
    if (this.historyIndex < this.slidesHistory.length - 1) {
      this.slidesHistory = this.slidesHistory.slice(0, this.historyIndex + 1)
    }
    const snapshot = JSON.stringify(this.slides)
    // Avoid duplicates (identical state)
    if (this.slidesHistory[this.historyIndex] === snapshot) return
    this.slidesHistory.push(snapshot)
    this.historyIndex = this.slidesHistory.length - 1
    // Cap at 50 entries to bound memory
    if (this.slidesHistory.length > 50) {
      this.slidesHistory.shift()
      this.historyIndex--
    }
    this.canUndo = this.historyIndex > 0
    this.canRedo = false
  }

  undo(): void {
    if (this.historyIndex <= 0) return
    this.historyIndex--
    this.slides = JSON.parse(this.slidesHistory[this.historyIndex])
    this.canUndo = this.historyIndex > 0
    this.canRedo = true
  }

  redo(): void {
    if (this.historyIndex >= this.slidesHistory.length - 1) return
    this.historyIndex++
    this.slides = JSON.parse(this.slidesHistory[this.historyIndex])
    this.canUndo = true
    this.canRedo = this.historyIndex < this.slidesHistory.length - 1
  }

  addShape(slideIndex: number, shape: ShapeData): void {
    this.pushSnapshot()
    const slide = this.slides[slideIndex]
    if (slide) {
      if (!slide.shapes) slide.shapes = []
      slide.shapes.push(shape)
      this.selectedShapeIds = [shape.id]
      this.notifyCollaboration("shape_add", { slide_index: slideIndex, shape })
    }
  }

  addChartToSlide(slideIndex: number, chartType: string): void {
    this.pushSnapshot()
    const slide = this.slides[slideIndex]
    if (!slide) return
    const existing = slide.shapes?.length || 0
    const chartData: ChartData = {
      type: chartType as ChartType,
      title: undefined,
      labels: ["A", "B", "C", "D"],
      series: [{ name: "Series 1", values: [30, 45, 25, 60] }],
    }
    const chartShape: ShapeData = {
      id: `chart-${Date.now()}`,
      type: "rect",
      x: 50 + existing * 20,
      y: 50 + existing * 20,
      width: 400,
      height: 300,
      zIndex: existing,
      fillColor: "#ffffff",
      strokeColor: "#cccccc",
      strokeWidth: 1,
      rotation: 0,
      chart: chartData,
    }
    if (!slide.shapes) slide.shapes = []
    slide.shapes.push(chartShape)
    this.selectedShapeIds = [chartShape.id]
  }

  addConnectorToSlide(slideIndex: number, connectorType: string): void {
    this.pushSnapshot()
    const slide = this.slides[slideIndex]
    if (!slide) return
    const existing = slide.shapes?.length || 0
    const connectorData: ConnectorData = {
      connectorType: connectorType as ConnectorData["connectorType"],
      hasStartArrow: false,
      hasEndArrow: true,
      startX: 20,
      startY: 20,
      endX: 180,
      endY: 120,
    }
    const connectorShape: ShapeData = {
      id: `connector-${Date.now()}`,
      type: "connector",
      x: 50 + existing * 20,
      y: 50 + existing * 20,
      width: 200,
      height: 140,
      rotation: 0,
      zIndex: existing,
      strokeColor: "#333333",
      strokeWidth: 2,
      connector: connectorData,
    }
    if (!slide.shapes) slide.shapes = []
    slide.shapes.push(connectorShape)
    this.selectedShapeIds = [connectorShape.id]
  }

  updateShape(slideIndex: number, shapeId: string, updates: Partial<ShapeData>): void {
    this.pushSnapshot()
    if (updates.groupId === undefined && updates.imageData === undefined) {
      this.applyShapeUpdates(slideIndex, shapeId, updates)
    } else {
      const slide = this.slides[slideIndex]
      if (slide?.shapes) {
        const idx = slide.shapes.findIndex((s) => s.id === shapeId)
        if (idx !== -1) {
          Object.assign(slide.shapes[idx], updates)
        }
      }
    }
    this.notifyCollaboration("shape_modify", { slide_index: slideIndex, shape_id: shapeId, properties: updates as Record<string, unknown> })
  }

  private applyShapeUpdates(slideIndex: number, shapeId: string, updates: Partial<ShapeData>): void {
    const slide = this.slides[slideIndex]
    if (!slide?.shapes) return
    const idx = slide.shapes.findIndex((s) => s.id === shapeId)
    if (idx === -1) return
    const shape = slide.shapes[idx]
    // Capture position/size delta before applying
    const dx = typeof updates.x === "number" ? updates.x - shape.x : 0
    const dy = typeof updates.y === "number" ? updates.y - shape.y : 0
    const dw = typeof updates.width === "number" ? updates.width - shape.width : 0
    const dh = typeof updates.height === "number" ? updates.height - shape.height : 0
    Object.assign(shape, updates)
    // Propagate position/size deltas to group members
    if ((dx !== 0 || dy !== 0 || dw !== 0 || dh !== 0) && shape.groupId) {
      for (const member of slide.shapes) {
        if (member.id !== shapeId && member.groupId === shape.groupId) {
          if (dx !== 0 || dy !== 0) {
            member.x += dx
            member.y += dy
          }
          if (dw !== 0 || dh !== 0) {
            member.width += dw
            member.height += dh
          }
        }
      }
    }
  }

  removeShape(slideIndex: number, shapeId: string): void {
    this.pushSnapshot()
    const slide = this.slides[slideIndex]
    if (slide?.shapes) {
      slide.shapes = slide.shapes.filter((s) => s.id !== shapeId)
      this.selectedShapeIds = this.selectedShapeIds.filter((id) => id !== shapeId)
      this.notifyCollaboration("shape_delete", { slide_index: slideIndex, shape_id: shapeId })
    }
  }

  removeSelectedShapes(): void {
    this.pushSnapshot()
    const slide = this.slides[this.currentSlide]
    if (!slide?.shapes) return
    const idsToRemove = new Set(this.selectedShapeIds)
    slide.shapes = slide.shapes.filter((s) => !idsToRemove.has(s.id))
    this.selectedShapeIds = []
    for (const id of idsToRemove) {
      this.notifyCollaboration("shape_delete", { slide_index: this.currentSlide, shape_id: id })
    }
  }

  moveShape(slideIndex: number, shapeId: string, x: number, y: number): void {
    this.pushSnapshot()
    const slide = this.slides[slideIndex]
    if (slide?.shapes) {
      const shape = slide.shapes.find((s) => s.id === shapeId)
      if (shape) {
        const dx = x - shape.x
        const dy = y - shape.y
        shape.x = x
        shape.y = y
        if (shape.groupId) {
          for (const member of slide.shapes) {
            if (member.id !== shapeId && member.groupId === shape.groupId) {
              member.x += dx
              member.y += dy
            }
          }
        }
        this.notifyCollaboration("shape_move", { slide_index: slideIndex, shape_id: shapeId, x, y })
      }
    }
  }

  /** Transient multi-drag: moves shapes by delta WITHOUT pushSnapshot (called on every mousemove during drag) */
  moveShapes(slideIndex: number, shapeIds: string[], dx: number, dy: number): void {
    const slide = this.slides[slideIndex]
    if (!slide?.shapes) return
    const movedIds = new Set<string>()
    for (const shapeId of shapeIds) {
      if (movedIds.has(shapeId)) continue
      const shape = slide.shapes.find((s) => s.id === shapeId)
      if (!shape) continue
      // Normalize with zoom
      const zoomScale = this.zoomLevel / 100
      const moveX = Math.round(dx / zoomScale)
      const moveY = Math.round(dy / zoomScale)
      shape.x += moveX
      shape.y += moveY
      movedIds.add(shapeId)
      // Move grouped shapes together
      if (shape.groupId) {
        for (const member of slide.shapes) {
          if (member.id !== shapeId && member.groupId === shape.groupId && !movedIds.has(member.id)) {
            member.x += moveX
            member.y += moveY
            movedIds.add(member.id)
          }
        }
      }
    }
  }

  bringForward(slideIndex: number, shapeId: string): void {
    this.pushSnapshot()
    const slide = this.slides[slideIndex]
    if (!slide?.shapes) return
    const idx = slide.shapes.findIndex((s) => s.id === shapeId)
    if (idx < slide.shapes.length - 1) {
      const a = slide.shapes[idx], b = slide.shapes[idx + 1]
      const tmp = a.zIndex; a.zIndex = b.zIndex; b.zIndex = tmp
      slide.shapes[idx] = b; slide.shapes[idx + 1] = a
    }
  }

  sendBackward(slideIndex: number, shapeId: string): void {
    this.pushSnapshot()
    const slide = this.slides[slideIndex]
    if (!slide?.shapes) return
    const idx = slide.shapes.findIndex((s) => s.id === shapeId)
    if (idx > 0) {
      const a = slide.shapes[idx], b = slide.shapes[idx - 1]
      const tmp = a.zIndex; a.zIndex = b.zIndex; b.zIndex = tmp
      slide.shapes[idx] = b; slide.shapes[idx - 1] = a
    }
  }

  bringToFront(slideIndex: number, shapeId: string): void {
    this.pushSnapshot()
    const slide = this.slides[slideIndex]
    if (!slide?.shapes) return
    const idx = slide.shapes.findIndex((s) => s.id === shapeId)
    if (idx >= 0) {
      const [shape] = slide.shapes.splice(idx, 1)
      const maxZ = Math.max(...slide.shapes.map((s) => s.zIndex), 0)
      shape.zIndex = maxZ + 1
      slide.shapes.push(shape)
    }
  }

  sendToBack(slideIndex: number, shapeId: string): void {
    this.pushSnapshot()
    const slide = this.slides[slideIndex]
    if (!slide?.shapes) return
    const idx = slide.shapes.findIndex((s) => s.id === shapeId)
    if (idx >= 0) {
      const [shape] = slide.shapes.splice(idx, 1)
      const minZ = Math.min(...slide.shapes.map((s) => s.zIndex), 0)
      shape.zIndex = minZ - 1
      slide.shapes.unshift(shape)
    }
  }

  /** Apply z-order operations to ALL selected shapes */
  private applyZOrderToSelected(fn: (idx: number) => void): void {
    this.pushSnapshot()
    const slide = this.slides[this.currentSlide]
    if (!slide?.shapes) return
    // Work on sorted copies to avoid index shifting issues
    const sorted = [...this.selectedShapeIds].sort((a, b) => {
      return slide.shapes.findIndex((s) => s.id === a) - slide.shapes.findIndex((s) => s.id === b)
    })
    for (const id of sorted) {
      const idx = slide.shapes.findIndex((s) => s.id === id)
      if (idx >= 0) fn(idx)
    }
  }

  bringForwardSelected(): void {
    this.applyZOrderToSelected((idx) => {
      if (idx < this.slides[this.currentSlide].shapes.length - 1) {
        const slide = this.slides[this.currentSlide]
        const a = slide.shapes[idx], b = slide.shapes[idx + 1]
        const tmp = a.zIndex; a.zIndex = b.zIndex; b.zIndex = tmp
        slide.shapes[idx] = b; slide.shapes[idx + 1] = a
      }
    })
  }

  sendBackwardSelected(): void {
    this.applyZOrderToSelected((idx) => {
      if (idx > 0) {
        const slide = this.slides[this.currentSlide]
        const a = slide.shapes[idx], b = slide.shapes[idx - 1]
        const tmp = a.zIndex; a.zIndex = b.zIndex; b.zIndex = tmp
        slide.shapes[idx] = b; slide.shapes[idx - 1] = a
      }
    })
  }

  bringToFrontSelected(): void {
    this.applyZOrderToSelected(() => {
      const slide = this.slides[this.currentSlide]
      const idx = slide.shapes.findIndex((s) => s.id === [...this.selectedShapeIds].find((id) => slide.shapes.some((sh) => sh.id === id))!)
      // Actually just bring each to front one by one is simpler
      void idx
    })
    // Simplified: iterate selected in order, bring each to front
    const slide = this.slides[this.currentSlide]
    if (!slide?.shapes) return
    for (const id of this.selectedShapeIds) {
      const idx = slide.shapes.findIndex((s) => s.id === id)
      if (idx >= 0) {
        const [shape] = slide.shapes.splice(idx, 1)
        const maxZ = Math.max(...slide.shapes.map((s) => s.zIndex), 0)
        shape.zIndex = maxZ + 1
        slide.shapes.push(shape)
      }
    }
  }

  sendToBackSelected(): void {
    const slide = this.slides[this.currentSlide]
    if (!slide?.shapes) return
    // Bring each to front in reverse order of the original sorted list
    const sorted = [...this.selectedShapeIds].sort((a, b) => {
      return slide.shapes.findIndex((s) => s.id === b) - slide.shapes.findIndex((s) => s.id === a)
    })
    for (const id of sorted) {
      const idx = slide.shapes.findIndex((s) => s.id === id)
      if (idx >= 0) {
        const [shape] = slide.shapes.splice(idx, 1)
        const minZ = Math.min(...slide.shapes.map((s) => s.zIndex), 0)
        shape.zIndex = minZ - 1
        slide.shapes.unshift(shape)
      }
    }
  }

  /* Shape alignment */
  getSlideDimensions(): { width: number; height: number } {
    const aspectRatio = this.slideSize === "widescreen" ? 16 / 9 : 4 / 3
    const baseWidth = 960
    return { width: baseWidth, height: Math.round(baseWidth / aspectRatio) }
  }

  alignShape(shapeId: string, alignment: "left" | "center" | "right" | "top" | "middle" | "bottom"): void {
    const slide = this.slides[this.currentSlide]
    const shape = slide?.shapes?.find((s) => s.id === shapeId)
    if (!shape) return
    const dims = this.getSlideDimensions()
    this.pushSnapshot()
    switch (alignment) {
      case "left":
        shape.x = 0
        break
      case "center":
        shape.x = Math.round((dims.width - shape.width) / 2)
        break
      case "right":
        shape.x = dims.width - shape.width
        break
      case "top":
        shape.y = 0
        break
      case "middle":
        shape.y = Math.round((dims.height - shape.height) / 2)
        break
      case "bottom":
        shape.y = dims.height - shape.height
        break
    }
  }

  /** Align ALL selected shapes (each individually to the slide) */
  alignSelectedShapes(alignment: "left" | "center" | "right" | "top" | "middle" | "bottom"): void {
    for (const id of this.selectedShapeIds) {
      this.alignShape(id, alignment)
    }
  }

  /* Presenter view */
  isPresenting = false
  presentStep = 0

  startPresentation(): void {
    this.isPresenting = true
    this.presentStep = this.currentSlide
  }

  endPresentation(): void {
    this.isPresenting = false
    this.presentStep = 0
  }

  nextSlide(): void {
    const total = this.totalSlides
    if (this.presentStep < total - 1) {
      this.presentStep++
      if (this.presentStep !== this.currentSlide) {
        this.currentSlide = this.presentStep
      }
    }
  }

  prevSlide(): void {
    if (this.presentStep > 0) {
      this.presentStep--
      if (this.presentStep !== this.currentSlide) {
        this.currentSlide = this.presentStep
      }
    }
  }

  private onMutation: ((action: string, data: Record<string, unknown>) => void) | null = null
  private onCursorMove: ((page: number, x: number, y: number) => void) | null = null

  registerMutationCallback(cb: (action: string, data: Record<string, unknown>) => void): void {
    this.onMutation = cb
  }

  registerCursorSendCallback(cb: (page: number, x: number, y: number) => void): void {
    this.onCursorMove = cb
  }

  private notifyCollaboration(action: string, data: Record<string, unknown>): void {
    this.onMutation?.(action, data)
  }

  notifyCursorMove(): void {
    this.onCursorMove?.(this.currentSlide, this.lastCursorX ?? 0, this.lastCursorY ?? 0)
  }

  updateRemoteCursor(userId: string, username: string, color: string, x: number, y: number, page: number): void {
    this.remoteCursors.set(userId, { userId, username, color, x, y, page })
  }

  lastCursorX: number | null = null
  lastCursorY: number | null = null
  remoteCursors: Map<string, { userId: string; username: string; color: string; x: number; y: number; page: number }> = new Map()

  /* Language */
  languageCode = "en-US"

  constructor() {
    makeAutoObservable(this)
    // Seed demo slides
    this.slides = [
      { id: crypto.randomUUID(), title: "Title Slide", layout: "title" as SlideLayout, notes: "", shapes: [] },
      { id: crypto.randomUUID(), title: "Overview", layout: "content" as SlideLayout, notes: "", shapes: [] },
      { id: crypto.randomUUID(), title: "Key Points", layout: "blank" as SlideLayout, notes: "", shapes: [] },
    ]
    this.totalSlides = this.slides.length
  }

  /* ── Actions ── */

  setMode(mode: PresentationMode): void {
    this.mode = mode
    this.isEditMode = mode.isEdit
  }

  setDocument(doc: PresentationDocument): void {
    this.document = doc
  }

  setDocReady(ready: boolean): void {
    this.isDocReady = ready
  }

  setActiveTab(tab: PresentationTab | null): void {
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

  setCurrentSlide(index: number): void {
    this.currentSlide = index
  }

  setTotalSlides(count: number): void {
    this.totalSlides = count
  }

  setSlides(slides: SlideData[]): void {
    this.slides = slides
    this.totalSlides = slides.length
  }

  setActiveFileMenuPanel(panel: string | null): void {
    this.activeFileMenuPanel = panel
  }

  setTransitionEffect(effect: TransitionEffect): void {
    this.transitionEffect = effect
  }

  setTransitionDuration(duration: number): void {
    this.transitionDuration = duration
  }

  setTransitionSoundEnabled(enabled: boolean): void {
    this.transitionSoundEnabled = enabled
  }

  setAdvanceMode(mode: AdvanceMode): void {
    this.advanceMode = mode
  }

  setAdvanceTiming(seconds: number): void {
    this.advanceTiming = seconds
  }

  setSlideTransition(index: number, effect: TransitionEffect): void {
    this.pushSnapshot()
    const slide = this.slides[index]
    if (!slide) return
    this.transitionEffect = effect
    slide.transitionEffect = effect
  }

  getEffectiveTransition(index: number): {
    effect: TransitionEffect
    duration: number
    soundEnabled: boolean
    advanceMode: AdvanceMode
    advanceTiming: number
  } {
    const slide = this.slides[index]
    return {
      effect: slide?.transitionEffect ?? this.transitionEffect,
      duration: slide?.transitionDuration ?? this.transitionDuration,
      soundEnabled: slide?.transitionSoundEnabled ?? this.transitionSoundEnabled,
      advanceMode: (slide?.advanceMode as AdvanceMode) ?? this.advanceMode,
      advanceTiming: slide?.advanceTiming ?? this.advanceTiming,
    }
  }

  applyTransitionToAll(): void {
    this.pushSnapshot()
    const effect = this.transitionEffect
    const duration = this.transitionDuration
    const sound = this.transitionSoundEnabled
    const advMode = this.advanceMode
    const advTiming = this.advanceTiming
    for (const slide of this.slides) {
      slide.transitionEffect = effect
      slide.transitionDuration = duration
      slide.transitionSoundEnabled = sound
      slide.advanceMode = advMode
      slide.advanceTiming = advTiming
    }
  }

  setAnimationEffect(effect: AnimationEffect): void {
    this.animationEffect = effect
  }

  setAnimationStart(start: StartAnimation): void {
    this.animationStart = start
  }

  setAnimationCategory(category: AnimationCategory): void {
    this.animationCategory = category
  }

  setAnimationDuration(duration: number): void {
    this.animationDuration = duration
  }

  setAnimationDelay(delay: number): void {
    this.animationDelay = delay
  }

  addAnimation(index: number, effect: AnimationEffect, category: AnimationCategory): void {
    this.pushSnapshot()
    const slide = this.slides[index]
    if (!slide) return
    const anim: AnimationData = {
      id: crypto.randomUUID(),
      effect,
      category,
      target: "all",
      start: this.animationStart,
      duration: this.animationDuration,
      delay: this.animationDelay,
    }
    if (!slide.animations) slide.animations = []
    slide.animations.push(anim)
  }

  removeAnimation(slideIndex: number, animId: string): void {
    this.pushSnapshot()
    const slide = this.slides[slideIndex]
    if (!slide?.animations) return
    slide.animations = slide.animations.filter((a) => a.id !== animId)
  }

  moveAnimationEarlier(slideIndex: number, animIndex: number): void {
    this.pushSnapshot()
    const slide = this.slides[slideIndex]
    if (!slide?.animations || animIndex <= 0) return
    ;[slide.animations[animIndex], slide.animations[animIndex - 1]] = [
      slide.animations[animIndex - 1],
      slide.animations[animIndex],
    ]
  }

  moveAnimationLater(slideIndex: number, animIndex: number): void {
    this.pushSnapshot()
    const slide = this.slides[slideIndex]
    if (!slide?.animations || animIndex >= slide.animations.length - 1) return
    ;[slide.animations[animIndex], slide.animations[animIndex + 1]] = [
      slide.animations[animIndex + 1],
      slide.animations[animIndex],
    ]
  }

  setAnimationTarget(slideIndex: number, animId: string, target: string): void {
    this.pushSnapshot()
    const anim = this.slides[slideIndex]?.animations?.find((a) => a.id === animId)
    if (anim) anim.target = target
  }

  startPreview(): void {
    this.isPreviewPlaying = true
    this.previewStep = 0
  }

  stopPreview(): void {
    this.isPreviewPlaying = false
    this.previewStep = 0
  }

  nextPreviewStep(): void {
    const anims = this.slides[this.currentSlide]?.animations
    if (!anims || this.previewStep >= anims.length - 1) {
      this.stopPreview()
      return
    }
    this.previewStep++
  }

  updateAnimationTiming(slideIndex: number, animId: string, start: StartAnimation, duration: number, delay: number): void {
    this.pushSnapshot()
    const anim = this.slides[slideIndex]?.animations?.find((a) => a.id === animId)
    if (anim) {
      anim.start = start
      anim.duration = duration
      anim.delay = delay
    }
  }

  setSlideSize(size: SlideSize): void {
    this.slideSize = size
  }

  setThemeType(type: ThemeType): void {
    this.themeType = type
  }

  setTheme(theme: Theme): void {
    this.theme = theme
  }

  setLanguageCode(code: string): void {
    this.languageCode = code
  }

  /* ── Grouping ── */

  groupSelected(): void {
    const slide = this.slides[this.currentSlide]
    if (!slide?.shapes) return
    const selected = slide.shapes.filter((s) => this.selectedShapeIds.includes(s.id))
    if (selected.length < 2) return
    this.pushSnapshot()
    const groupId = crypto.randomUUID()
    for (const shape of selected) {
      shape.groupId = groupId
      this.notifyCollaboration("shape_modify", { slide_index: this.currentSlide, shape_id: shape.id, properties: { groupId } })
    }
  }

  ungroupSelected(): void {
    const slide = this.slides[this.currentSlide]
    if (!slide?.shapes) return
    this.pushSnapshot()
    const groupIdsToClear = new Set<string>()
    for (const shape of slide.shapes) {
      if (this.selectedShapeIds.includes(shape.id) && shape.groupId) {
        groupIdsToClear.add(shape.groupId)
      }
    }
    for (const shape of slide.shapes) {
      if (shape.groupId && groupIdsToClear.has(shape.groupId)) {
        shape.groupId = undefined
        this.notifyCollaboration("shape_modify", { slide_index: this.currentSlide, shape_id: shape.id, properties: { groupId: null } })
      }
    }
  }

  getGroupMemberIds(groupId: string): string[] {
    const slide = this.slides[this.currentSlide]
    if (!slide?.shapes) return []
    return slide.shapes.filter((s) => s.groupId === groupId).map((s) => s.id)
  }

  /* ── Image Upload ── */

  addImageToSlide(slideIndex: number, file: File): void {
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result as string
      this.pushSnapshot()
      const slide = this.slides[slideIndex]
      if (!slide) return
      if (!slide.shapes) slide.shapes = []
      const existing = slide.shapes.length
      const centerX = Math.round((960 - 200) / 2) // centered on 960px wide slide
      const centerY = Math.round(((960 / (this.slideSize === "widescreen" ? 16 / 9 : 4 / 3)) - 200) / 2)
      const newShape: ShapeData = {
        id: `image-${Date.now()}`,
        type: "image",
        x: centerX + existing * 20,
        y: centerY + existing * 20,
        width: 200,
        height: 200,
        rotation: 0,
        zIndex: existing,
        imageData: { src, alt: file.name },
      }
      slide.shapes.push(newShape)
      this.selectedShapeIds = [newShape.id]
      this.notifyCollaboration("shape_add", { slide_index: slideIndex, shape: newShape })
    }
    reader.readAsDataURL(file)
  }

  /* ── Serialization ── */

  toJSON(): string {
    const data = {
      version: 3,
      slideSize: this.slideSize,
      themeType: this.themeType,
      theme: this.theme,
      slides: this.slides.map((s) => ({
        id: s.id,
        title: s.title,
        layout: s.layout,
        notes: s.notes,
        transitionEffect: s.transitionEffect,
        transitionDuration: s.transitionDuration,
        transitionSoundEnabled: s.transitionSoundEnabled,
        advanceMode: s.advanceMode,
        advanceTiming: s.advanceTiming,
        animations: s.animations,
        shapes: s.shapes ?? [],
      })),
    }
    return JSON.stringify(data, null, 2)
  }

  fromJSON(json: string): void {
    try {
      const data = JSON.parse(json)
      if (!data.slides || !Array.isArray(data.slides)) {
        throw new Error("Invalid presentation data")
      }
      this.slideSize = data.slideSize ?? "standard"
      this.themeType = data.themeType ?? "builtin"
      this.theme = data.theme ?? DEFAULT_THEME
      this.slides = data.slides.map(
        (s: { id?: string; title: string; layout: string; notes?: string; transitionEffect?: string; transitionDuration?: number; transitionSoundEnabled?: boolean; advanceMode?: string; advanceTiming?: number; animations?: AnimationData[]; shapes?: ShapeData[] }) => ({
          id: s.id ?? crypto.randomUUID(),
          title: s.title ?? "Untitled",
          layout: (s.layout as SlideLayout) ?? "blank",
          notes: s.notes ?? "",
          transitionEffect: s.transitionEffect as TransitionEffect,
          transitionDuration: s.transitionDuration,
          transitionSoundEnabled: s.transitionSoundEnabled,
          advanceMode: s.advanceMode as AdvanceMode,
          advanceTiming: s.advanceTiming,
          animations: s.animations,
          shapes: s.shapes ?? [],
        }),
      )
      this.totalSlides = this.slides.length
      this.currentSlide = 0
      this.selectedShapeIds = []
    } catch (e) {
      console.error("Failed to load presentation:", e)
    }
  }

  resetToDefaults(): void {
    this.slides = [
      { id: crypto.randomUUID(), title: "Title Slide", layout: "title" as SlideLayout, notes: "", shapes: [] },
      { id: crypto.randomUUID(), title: "Overview", layout: "content" as SlideLayout, notes: "", shapes: [] },
      { id: crypto.randomUUID(), title: "Key Points", layout: "blank" as SlideLayout, notes: "", shapes: [] },
    ]
    this.totalSlides = this.slides.length
    this.currentSlide = 0
    this.selectedShapeIds = []
    this.slideSize = "standard"
    this.themeType = "builtin"
    this.theme = DEFAULT_THEME
    this.transitionEffect = "none"
    this.transitionDuration = 0.5
    this.transitionSoundEnabled = false
    this.advanceMode = "click"
    this.advanceTiming = 3
    this.animationEffect = "none"
    this.animationStart = "onClick"
    this.animationCategory = "none"
    this.animationDuration = 1
    this.animationDelay = 0
    this.document = null
  }

  setCompactToolbar(compact: boolean): void {
    this.isCompactToolbar = compact
    setStorageItem("compact-toolbar", compact ? "true" : "false")
  }

  setCompactStatusbar(compact: boolean): void {
    this.isCompactStatusbar = compact
    setStorageItem("compact-statusbar", compact ? "true" : "")
  }

  /* ── Slide CRUD ── */

  addSlide(): void {
    this.pushSnapshot()
    const newSlide: SlideData = {
      id: crypto.randomUUID(),
      title: `Slide ${this.slides.length + 1}`,
      layout: "blank",
      notes: "",
      transitionEffect: undefined,
      transitionDuration: undefined,
      transitionSoundEnabled: undefined,
      advanceMode: undefined,
      advanceTiming: undefined,
      animations: undefined,
      shapes: [],
    }
    const insertIndex = this.currentSlide + 1
    this.slides.splice(insertIndex, 0, newSlide)
    this.totalSlides = this.slides.length
    this.currentSlide = insertIndex
    this.notifyCollaboration("slide_add", { after_index: insertIndex - 1 })
  }

  deleteSlide(index: number): void {
    if (this.slides.length <= 1) return
    this.pushSnapshot()
    this.slides.splice(index, 1)
    this.totalSlides = this.slides.length
    if (this.currentSlide >= this.totalSlides) {
      this.currentSlide = this.totalSlides - 1
    }
    this.notifyCollaboration("slide_delete", { slide_index: index })
  }

  duplicateSlide(index: number): void {
    this.pushSnapshot()
    const source = this.slides[index]
    if (!source) return
    const clone: SlideData = {
      id: crypto.randomUUID(),
      title: `${source.title} (copy)`,
      layout: source.layout,
      notes: source.notes,
      transitionEffect: source.transitionEffect,
      transitionDuration: source.transitionDuration,
      transitionSoundEnabled: source.transitionSoundEnabled,
      advanceMode: source.advanceMode,
      advanceTiming: source.advanceTiming,
      animations: source.animations?.map((a) => ({ ...a, id: crypto.randomUUID() })),
      shapes: source.shapes?.map((s) => ({ ...s, id: crypto.randomUUID() })),
    }
    this.slides.splice(index + 1, 0, clone)
    this.totalSlides = this.slides.length
    this.currentSlide = index + 1
  }

  reorderSlides(fromIndex: number, toIndex: number): void {
    this.pushSnapshot()
    const [moved] = this.slides.splice(fromIndex, 1)
    this.slides.splice(toIndex, 0, moved)
    this.currentSlide = toIndex
    this.notifyCollaboration("slide_reorder", { from_index: fromIndex, to_index: toIndex })
  }

  setSlideTitle(index: number, title: string): void {
    this.pushSnapshot()
    const slide = this.slides[index]
    if (slide) {
      slide.title = title
    }
  }

  setSlideLayout(index: number, layout: SlideLayout): void {
    this.pushSnapshot()
    const slide = this.slides[index]
    if (slide) {
      slide.layout = layout
    }
  }

  setSlideNotes(index: number, notes: string): void {
    this.pushSnapshot()
    const slide = this.slides[index]
    if (slide) {
      slide.notes = notes
    }
  }

  applyRemoteOp(action: string, data: Record<string, unknown>): void {
    const slideIndex = data.slide_index as number | undefined
    switch (action) {
      case "shape_add": {
        const shape = data.shape as ShapeData
        if (typeof slideIndex === "number" && this.slides[slideIndex]) {
          if (!this.slides[slideIndex].shapes) this.slides[slideIndex].shapes = []
          // Idempotent: skip if shape already exists (avoids duplicates on echo)
          if (!this.slides[slideIndex].shapes.some((s) => s.id === shape.id)) {
            this.slides[slideIndex].shapes.push(shape)
          }
        }
        break
      }
      case "shape_delete": {
        const shapeId = data.shape_id as string
        if (typeof slideIndex === "number" && this.slides[slideIndex]?.shapes) {
          this.slides[slideIndex].shapes = this.slides[slideIndex].shapes.filter((s) => s.id !== shapeId)
        }
        break
      }
      case "shape_modify": {
        const sid = data.shape_id as string
        const properties = data.properties as Record<string, unknown>
        if (typeof slideIndex === "number" && this.slides[slideIndex]?.shapes) {
          const shape = this.slides[slideIndex].shapes.find((s) => s.id === sid)
          if (shape) {
            Object.assign(shape, properties)
          }
        }
        break
      }
      case "shape_move": {
        const moveId = data.shape_id as string
        const mx = data.x as number
        const my = data.y as number
        if (typeof slideIndex === "number" && this.slides[slideIndex]?.shapes) {
          const shape = this.slides[slideIndex].shapes.find((s) => s.id === moveId)
          if (shape) {
            shape.x = mx
            shape.y = my
          }
        }
        break
      }
      case "slide_add": {
        const afterIndex = data.after_index as number
        const newSlide: SlideData = {
          id: crypto.randomUUID(),
          title: `Slide ${this.slides.length + 1}`,
          layout: "blank",
          notes: "",
          shapes: [],
        }
        this.slides.splice(afterIndex + 1, 0, newSlide)
        this.totalSlides = this.slides.length
        break
      }
      case "slide_delete": {
        const delIndex = data.slide_index as number
        if (this.slides.length > 1) {
          this.slides.splice(delIndex, 1)
          this.totalSlides = this.slides.length
          if (this.currentSlide >= this.totalSlides) this.currentSlide = this.totalSlides - 1
        }
        break
      }
      case "slide_reorder": {
        const fromIdx = data.from_index as number
        const toIdx = data.to_index as number
        const [moved] = this.slides.splice(fromIdx, 1)
        this.slides.splice(toIdx, 0, moved)
        break
      }
    }
  }
}

function setStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, value)
  } catch {
    // Ignore storage errors
  }
}

export const presentationStore = new PresentationStore()
