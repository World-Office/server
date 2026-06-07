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
import type { ChartData, ChartType, ShapeData } from "../types/presentation"
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

  /* Shape selection */
  selectedShapeId: string | null = null

  addShape(slideIndex: number, shape: ShapeData): void {
    const slide = this.slides[slideIndex]
    if (slide) {
      if (!slide.shapes) slide.shapes = []
      slide.shapes.push(shape)
      this.selectedShapeId = shape.id
    }
  }

  addChartToSlide(slideIndex: number, chartType: string): void {
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
    this.selectedShapeId = chartShape.id
  }

  updateShape(slideIndex: number, shapeId: string, updates: Partial<ShapeData>): void {
    const slide = this.slides[slideIndex]
    if (slide?.shapes) {
      const idx = slide.shapes.findIndex((s) => s.id === shapeId)
      if (idx !== -1) {
        Object.assign(slide.shapes[idx], updates)
      }
    }
  }

  removeShape(slideIndex: number, shapeId: string): void {
    const slide = this.slides[slideIndex]
    if (slide?.shapes) {
      slide.shapes = slide.shapes.filter((s) => s.id !== shapeId)
      if (this.selectedShapeId === shapeId) {
        this.selectedShapeId = null
      }
    }
  }

  moveShape(slideIndex: number, shapeId: string, x: number, y: number): void {
    const slide = this.slides[slideIndex]
    if (slide?.shapes) {
      const shape = slide.shapes.find((s) => s.id === shapeId)
      if (shape) {
        shape.x = x
        shape.y = y
      }
    }
  }

  selectShape(shapeId: string | null): void {
    this.selectedShapeId = shapeId
  }

  deselectShape(): void {
    this.selectedShapeId = null
  }

  bringForward(slideIndex: number, shapeId: string): void {
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
    const slide = this.slides[slideIndex]
    if (!slide?.animations) return
    slide.animations = slide.animations.filter((a) => a.id !== animId)
  }

  moveAnimationEarlier(slideIndex: number, animIndex: number): void {
    const slide = this.slides[slideIndex]
    if (!slide?.animations || animIndex <= 0) return
    ;[slide.animations[animIndex], slide.animations[animIndex - 1]] = [
      slide.animations[animIndex - 1],
      slide.animations[animIndex],
    ]
  }

  moveAnimationLater(slideIndex: number, animIndex: number): void {
    const slide = this.slides[slideIndex]
    if (!slide?.animations || animIndex >= slide.animations.length - 1) return
    ;[slide.animations[animIndex], slide.animations[animIndex + 1]] = [
      slide.animations[animIndex + 1],
      slide.animations[animIndex],
    ]
  }

  setAnimationTarget(slideIndex: number, animId: string, target: string): void {
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

  /* ── Serialization ── */

  toJSON(): string {
    const data = {
      version: 2,
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
  }

  deleteSlide(index: number): void {
    if (this.slides.length <= 1) return
    this.slides.splice(index, 1)
    this.totalSlides = this.slides.length
    if (this.currentSlide >= this.totalSlides) {
      this.currentSlide = this.totalSlides - 1
    }
  }

  duplicateSlide(index: number): void {
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
    const [moved] = this.slides.splice(fromIndex, 1)
    this.slides.splice(toIndex, 0, moved)
    this.currentSlide = toIndex
  }

  setSlideTitle(index: number, title: string): void {
    const slide = this.slides[index]
    if (slide) {
      slide.title = title
    }
  }

  setSlideLayout(index: number, layout: SlideLayout): void {
    const slide = this.slides[index]
    if (slide) {
      slide.layout = layout
    }
  }

  setSlideNotes(index: number, notes: string): void {
    const slide = this.slides[index]
    if (slide) {
      slide.notes = notes
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
