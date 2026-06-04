import { makeAutoObservable } from "mobx"
import type {
  AnimationEffect,
  LeftMenuAction,
  PresentationDocument,
  PresentationMode,
  PresentationTab,
  RightMenuPanel,
  SlideLayout,
  SlideSize,
  StartAnimation,
  ThemeType,
  TransitionEffect,
  ZoomLevel,
} from "../types/presentation"

export interface SlideData {
  id: string
  title: string
  layout: SlideLayout
  notes: string
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
  animationEffect: AnimationEffect = "none"
  animationStart: StartAnimation = "onClick"

  /* Slide settings */
  slideSize: SlideSize = "standard"
  themeType: ThemeType = "builtin"

  /* Language */
  languageCode = "en-US"

  constructor() {
    makeAutoObservable(this)
    // Seed demo slides
    this.slides = [
      { id: crypto.randomUUID(), title: "Title Slide", layout: "title" as SlideLayout, notes: "" },
      { id: crypto.randomUUID(), title: "Overview", layout: "content" as SlideLayout, notes: "" },
      { id: crypto.randomUUID(), title: "Key Points", layout: "blank" as SlideLayout, notes: "" },
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

  setAnimationEffect(effect: AnimationEffect): void {
    this.animationEffect = effect
  }

  setAnimationStart(start: StartAnimation): void {
    this.animationStart = start
  }

  setSlideSize(size: SlideSize): void {
    this.slideSize = size
  }

  setThemeType(type: ThemeType): void {
    this.themeType = type
  }

  setLanguageCode(code: string): void {
    this.languageCode = code
  }

  /* ── Serialization ── */

  toJSON(): string {
    const data = {
      version: 1,
      slideSize: this.slideSize,
      themeType: this.themeType,
      slides: this.slides.map((s) => ({
        id: s.id,
        title: s.title,
        layout: s.layout,
        notes: s.notes,
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
      this.slides = data.slides.map(
        (s: { id?: string; title: string; layout: string; notes?: string }) => ({
          id: s.id ?? crypto.randomUUID(),
          title: s.title ?? "Untitled",
          layout: (s.layout as SlideLayout) ?? "blank",
          notes: s.notes ?? "",
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
      { id: crypto.randomUUID(), title: "Title Slide", layout: "title" as SlideLayout, notes: "" },
      { id: crypto.randomUUID(), title: "Overview", layout: "content" as SlideLayout, notes: "" },
      { id: crypto.randomUUID(), title: "Key Points", layout: "blank" as SlideLayout, notes: "" },
    ]
    this.totalSlides = this.slides.length
    this.currentSlide = 0
    this.slideSize = "standard"
    this.themeType = "builtin"
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
