# Slides Editor — Sub-Sprint 1: Slide Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the slide management UI — thumbnails panel, canvas viewer, navigation, and JSON persistence.

**Architecture:** Frontend-only. JSON-native storage. The "slides" LeftMenu button already exists in presentationeditor-react — wires it to a new SlideThumbnails panel in the left side panel area. SlideCanvas replaces the inline-styled DocumentHolder. PresentationStore extended with slide CRUD actions. No Rust backend changes yet.

**Tech Stack:** React + MobX + TypeScript, CSS custom properties, contentEditable (for slide titles)

---

### Task 1: SlideThumbnails Panel — Left Panel

**Files:**
- Create: `apps/web/apps/presentationeditor-react/src/components/SlideThumbnails/SlideThumbnails.tsx`
- Create: `apps/web/apps/presentationeditor-react/src/components/SlideThumbnails/index.ts`
- Modify: `apps/web/apps/presentationeditor-react/src/components/LeftMenu/LeftMenu.tsx`
- Modify: `apps/web/apps/presentationeditor-react/src/styles/leftmenu.css`

- [ ] **Step 1: Create SlideThumbnails component**

Create `src/components/SlideThumbnails/SlideThumbnails.tsx`:

```tsx
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { presentationStore } from "../../stores/PresentationStore"

const ObservedSlideThumbnails = observer(function ObservedSlideThumbnails(): JSX.Element {
  const { slides, currentSlide } = presentationStore

  const handleAddSlide = () => {
    presentationStore.addSlide()
  }

  const handleDeleteSlide = () => {
    presentationStore.deleteSlide(currentSlide)
  }

  const handleDuplicateSlide = () => {
    presentationStore.duplicateSlide(currentSlide)
  }

  return (
    <div className="prese-slide-thumbnails">
      <div className="prese-slide-thumbnails-header">
        <span className="prese-slide-thumbnails-title">Slides</span>
        <div className="prese-slide-thumbnails-actions">
          <button
            type="button"
            className="prese-slide-thumb-btn"
            onClick={handleAddSlide}
            title="Add slide"
            aria-label="Add slide"
          >
            +
          </button>
          <button
            type="button"
            className="prese-slide-thumb-btn"
            onClick={handleDuplicateSlide}
            disabled={slides.length === 0}
            title="Duplicate slide"
            aria-label="Duplicate slide"
          >
            ⊞
          </button>
          <button
            type="button"
            className="prese-slide-thumb-btn"
            onClick={handleDeleteSlide}
            disabled={slides.length <= 1}
            title="Delete slide"
            aria-label="Delete slide"
          >
            −
          </button>
        </div>
      </div>

      <div className="prese-slide-thumbnails-list">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`prese-slide-thumb-item ${index === currentSlide ? "active" : ""}`}
            onClick={() => presentationStore.setCurrentSlide(index)}
            role="button"
            tabIndex={0}
            aria-label={`Slide ${index + 1}: ${slide.title || "Untitled"}`}
          >
            <div className="prese-slide-thumb-preview">
              <div className="prese-slide-thumb-label">{index + 1}</div>
            </div>
            <div className="prese-slide-thumb-title">{slide.title || `Slide ${index + 1}`}</div>
          </div>
        ))}
      </div>
    </div>
  )
})

export const SlideThumbnails = ObservedSlideThumbnails
```

Create `src/components/SlideThumbnails/index.ts`:

```tsx
export { SlideThumbnails } from "./SlideThumbnails"
```

- [ ] **Step 2: Wire SlideThumbnails into LeftMenu**

Replace the chat placeholder div in `LeftMenu.tsx` with conditional rendering for all registered panels:

```tsx
import { SlideThumbnails } from "../SlideThumbnails"

// Inside LeftMenuInner, replace the chat-only div with:
<div className="prese-left-panel-side">
  {presentationStore.activeLeftPanel === "slides" && <SlideThumbnails />}
  <div
    className="prese-left-panel-chat"
    style={{ display: presentationStore.activeLeftPanel === "chat" ? "block" : "none" }}
  />
</div>
```

- [ ] **Step 3: Add CSS styles for SlideThumbnails**

Append to `src/styles/leftmenu.css`:

```css
/* Slide thumbnails panel */
.prese-slide-thumbnails {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.prese-slide-thumbnails-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--wo-prese-border);
  flex-shrink: 0;
}

.prese-slide-thumbnails-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--wo-prese-text-primary);
}

.prese-slide-thumbnails-actions {
  display: flex;
  gap: 2px;
}

.prese-slide-thumb-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--wo-prese-text-secondary);
  cursor: pointer;
  border-radius: 3px;
  font-size: 14px;
  line-height: 1;
  transition: background-color 0.15s;
}

.prese-slide-thumb-btn:hover:not(:disabled) {
  background-color: var(--wo-color-bg-secondary, #f5f5f5);
  color: var(--wo-prese-text-primary);
}

.prese-slide-thumb-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.prese-slide-thumbnails-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.prese-slide-thumb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 4px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s;
  border: 1px solid transparent;
}

.prese-slide-thumb-item:hover {
  background-color: var(--wo-color-bg-secondary, #f5f5f5);
}

.prese-slide-thumb-item.active {
  background-color: var(--wo-prese-accent);
  color: #fff;
  border-color: var(--wo-prese-accent-hover);
}

.prese-slide-thumb-item.active .prese-slide-thumb-title {
  color: #fff;
}

.prese-slide-thumb-preview {
  width: 48px;
  height: 36px;
  background: var(--wo-prese-bg-page);
  border: 1px solid var(--wo-prese-border);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.prese-slide-thumb-label {
  font-size: 11px;
  color: var(--wo-prese-text-secondary);
  font-weight: 500;
}

.prese-slide-thumb-item.active .prese-slide-thumb-preview {
  border-color: #fff;
}

.prese-slide-thumb-title {
  font-size: 12px;
  color: var(--wo-prese-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
```

- [ ] **Step 4: Verify compilation**

Run: `pnpm typecheck --filter=presentationeditor-react`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/components/SlideThumbnails/ apps/web/apps/presentationeditor-react/src/components/LeftMenu/LeftMenu.tsx apps/web/apps/presentationeditor-react/src/styles/leftmenu.css
git commit -m "feat(presentation): add SlideThumbnails panel with add/delete/duplicate"
```

---

### Task 2: PresentationStore — Slide CRUD Actions

**Files:**
- Modify: `apps/web/apps/presentationeditor-react/src/stores/PresentationStore.ts`

- [ ] **Step 1: Add Slide data type to store**

Add a `SlideData` interface at the top of the file (after imports, before the class):

```ts
export interface SlideData {
  id: string
  title: string
  layout: SlideLayout
  notes: string
}
```

- [ ] **Step 2: Add slide CRUD actions to PresentationStore**

Add these methods to the `PresentationStore` class (after `setCompactStatusbar` or in a dedicated section):

```ts
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
```

- [ ] **Step 3: Update slide state initialization**

In the `slides` property declaration, change from `slides: SlideInfo[] = []` to use `SlideData`:

```ts
slides: SlideData[] = []
```

Also remove the `SlideInfo` import (or keep both if `SlideInfo` is used elsewhere — check first):

The `slides` property currently uses `SlideInfo[]`. We're replacing with `SlideData[]`. Check if `SlideInfo` is used anywhere else in the file. If not, remove it from the import.

Also ensure `SlideLayout` is imported (it's in the import block but verify):

```ts
import type { SlideLayout } from "../types/presentation"
```

- [ ] **Step 4: Initialize demo slides**

In the constructor, seed 3 demo slides:

```ts
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
```

- [ ] **Step 5: Verify compilation**

Run: `pnpm typecheck --filter=presentationeditor-react`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/stores/PresentationStore.ts
git commit -m "feat(presentation): add slide CRUD actions to PresentationStore"
```

---

### Task 3: SlideCanvas — WYSIWYG Slide Viewer Component

**Files:**
- Create: `apps/web/apps/presentationeditor-react/src/components/SlideCanvas/SlideCanvas.tsx`
- Create: `apps/web/apps/presentationeditor-react/src/components/SlideCanvas/index.ts`
- Modify: `apps/web/apps/presentationeditor-react/src/components/DocumentHolder.tsx`
- Create: `apps/web/apps/presentationeditor-react/src/styles/canvas.css`
- Modify: `apps/web/apps/presentationeditor-react/src/main.tsx`

- [ ] **Step 1: Create SlideCanvas component**

Create `src/components/SlideCanvas/SlideCanvas.tsx`:

```tsx
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { presentationStore } from "../../stores/PresentationStore"

const ObservedSlideCanvas = observer(function ObservedSlideCanvas(): JSX.Element {
  const { slides, currentSlide, zoomLevel, slideSize } = presentationStore
  const slide = slides[currentSlide]
  if (!slide) return <div className="prese-canvas-empty">No slides</div>

  const aspectRatio = slideSize === "widescreen" ? 16 / 9 : 4 / 3
  const baseWidth = 960
  const baseHeight = baseWidth / aspectRatio
  const scale = zoomLevel / 100
  const canvasWidth = baseWidth * scale
  const canvasHeight = baseHeight * scale

  return (
    <div className="prese-canvas-container">
      <div
        className="prese-canvas-slide"
        style={{
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {/* Slide background */}
        <div className="prese-canvas-background" />

        {/* Slide layout-based placeholders */}
        {slide.layout === "title" && (
          <div className="prese-canvas-placeholder prese-canvas-placeholder-title">
            <div
              className="prese-canvas-placeholder-text"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) =>
                presentationStore.setSlideTitle(
                  currentSlide,
                  e.currentTarget.textContent || ""
                )
              }
            >
              {slide.title || "Click to add title"}
            </div>
          </div>
        )}

        {slide.layout === "content" && (
          <>
            <div className="prese-canvas-placeholder prese-canvas-placeholder-title">
              <div
                className="prese-canvas-placeholder-text"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) =>
                  presentationStore.setSlideTitle(
                    currentSlide,
                    e.currentTarget.textContent || ""
                  )
                }
              >
                {slide.title || "Click to add title"}
              </div>
            </div>
            <div className="prese-canvas-placeholder prese-canvas-placeholder-body">
              <div className="prese-canvas-placeholder-text placeholder-muted">
                Click to add content
              </div>
            </div>
          </>
        )}

        {slide.layout === "blank" && (
          <div className="prese-canvas-placeholder prese-canvas-placeholder-blank">
            <div
              className="prese-canvas-placeholder-text"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) =>
                presentationStore.setSlideTitle(
                  currentSlide,
                  e.currentTarget.textContent || ""
                )
              }
            >
              {slide.title || "Click to add title"}
            </div>
          </div>
        )}

        {/* Speaker notes indicator */}
        {slide.notes && (
          <div className="prese-canvas-notes-indicator" title={slide.notes}>
            📝
          </div>
        )}
      </div>
    </div>
  )
})

export const SlideCanvas = ObservedSlideCanvas
```

Create `src/components/SlideCanvas/index.ts`:

```tsx
export { SlideCanvas } from "./SlideCanvas"
```

- [ ] **Step 2: Refactor DocumentHolder to use SlideCanvas**

Replace the inline-styled DocumentHolder with a clean version that uses SlideCanvas:

```tsx
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { SlideCanvas } from "../SlideCanvas"
import { presentationStore } from "../../stores/PresentationStore"

const ObservedDocumentHolder = observer(function ObservedDocumentHolder(): JSX.Element {
  const { slides, currentSlide, totalSlides } = presentationStore
  const canPrev = currentSlide > 0
  const canNext = currentSlide < totalSlides - 1

  return (
    <div className="prese-document-holder">
      <SlideCanvas />
      <div className="prese-slide-nav">
        <button
          type="button"
          className="prese-slide-nav-btn"
          disabled={!canPrev}
          onClick={() => presentationStore.setCurrentSlide(currentSlide - 1)}
          aria-label="Previous slide"
        >
          ‹ Prev
        </button>
        <span className="prese-slide-nav-label">
          Slide {currentSlide + 1} of {totalSlides}
        </span>
        <button
          type="button"
          className="prese-slide-nav-btn"
          disabled={!canNext}
          onClick={() => presentationStore.setCurrentSlide(currentSlide + 1)}
          aria-label="Next slide"
        >
          Next ›
        </button>
      </div>
    </div>
  )
})

export const DocumentHolder = ObservedDocumentHolder
```

- [ ] **Step 3: Create canvas styles**

Create `src/styles/canvas.css`:

```css
/* Presentation Editor — Slide Canvas Styles */

.prese-canvas-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  overflow: auto;
}

.prese-canvas-empty {
  color: var(--wo-prese-text-secondary);
  font-size: 14px;
}

.prese-canvas-slide {
  position: relative;
  background: var(--wo-prese-bg-page);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  margin: 24px;
}

.prese-canvas-background {
  position: absolute;
  inset: 0;
  background: #fff;
}

.prese-canvas-placeholder {
  position: absolute;
  border: 1px dashed transparent;
  transition: border-color 0.15s;
}

.prese-canvas-placeholder:hover {
  border-color: var(--wo-prese-accent);
}

.prese-canvas-placeholder-title {
  top: 10%;
  left: 10%;
  width: 80%;
  height: 20%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.prese-canvas-placeholder-body {
  top: 35%;
  left: 10%;
  width: 80%;
  height: 55%;
}

.prese-canvas-placeholder-blank {
  top: 10%;
  left: 10%;
  width: 80%;
  height: 20%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.prese-canvas-placeholder-text {
  width: 100%;
  height: 100%;
  padding: 12px;
  font-size: 18px;
  color: var(--wo-prese-text-primary);
  outline: none;
  cursor: text;
  overflow: auto;
  word-wrap: break-word;
}

.prese-canvas-placeholder-title .prese-canvas-placeholder-text {
  font-size: 36px;
  font-weight: 700;
  text-align: center;
}

.placeholder-muted {
  color: var(--wo-prese-text-secondary);
  opacity: 0.5;
}

.prese-canvas-notes-indicator {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 14px;
  cursor: help;
  opacity: 0.6;
}

/* Slide navigation */
.prese-slide-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  flex-shrink: 0;
  justify-content: center;
}

.prese-slide-nav-btn {
  padding: 4px 10px;
  cursor: pointer;
  border: 1px solid var(--wo-prese-border);
  border-radius: 3px;
  background: var(--wo-prese-bg-toolbar);
  color: var(--wo-prese-text-primary);
  font-size: 13px;
  transition: background-color 0.15s;
}

.prese-slide-nav-btn:hover:not(:disabled) {
  background-color: var(--wo-color-bg-secondary, #f5f5f5);
}

.prese-slide-nav-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.prese-slide-nav-label {
  font-size: 12px;
  color: var(--wo-prese-text-secondary);
  min-width: 80px;
  text-align: center;
}

/* Document holder layout */
.prese-document-holder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--wo-prese-doc-bg);
}
```

- [ ] **Step 4: Import canvas.css in main.tsx**

Add to the import list in `src/main.tsx`:

```tsx
import "./styles/canvas.css"
```

- [ ] **Step 5: Verify compilation**

Run: `pnpm typecheck --filter=presentationeditor-react`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/components/SlideCanvas/ apps/web/apps/presentationeditor-react/src/components/DocumentHolder.tsx apps/web/apps/presentationeditor-react/src/styles/canvas.css apps/web/apps/presentationeditor-react/src/main.tsx
git commit -m "feat(presentation): add SlideCanvas component with placeholders and navigation"
```

---

### Task 4: StatusBar — Slide Info Integration

**Files:**
- Read: `apps/web/apps/presentationeditor-react/src/components/StatusBar/StatusBar.tsx`
- Modify: the same file

- [ ] **Step 1: Read existing StatusBar**

First read the file to understand current structure.

- [ ] **Step 2: Add slide info to StatusBar**

Add slide counter and slide size display to the StatusBar (follow existing pattern).

- [ ] **Step 3: Verify compilation**

Run: `pnpm typecheck --filter=presentationeditor-react`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/components/StatusBar/StatusBar.tsx
git commit -m "feat(presentation): add slide info to StatusBar"
```

---

### Task 5: JSON Save/Load — FileTab Integration

**Files:**
- Read: `apps/web/apps/presentationeditor-react/src/components/Toolbar/FileTab.tsx`
- Read: `apps/web/apps/presentationeditor-react/src/components/FileMenu/panels/SaveAsPanel.tsx`
- Read: `apps/web/apps/presentationeditor-react/src/components/FileMenu/panels/CreateNewPanel.tsx`
- Modify: relevant file menu panels for JSON save/load

**Context:** The existing FileMenu system already has Save As and Create New panels. We need to add JSON serialization for the presentation model.

**Serialization format:** The PresentationStore serializes `slides` array as JSON. Each slide contains `{ id, title, layout, notes }`. This temporary JSON format will be replaced by the PPTX backend in Sub-Sprint 2.

- [ ] **Step 1: Add serialize/deserialize methods to PresentationStore**

Add to `PresentationStore`:

```ts
/* ── Serialization ── */

export interface PresentationData {
  version: number
  slides: SlideData[]
  slideSize: SlideSize
}

toJSON(): PresentationData {
  return {
    version: 1,
    slides: this.slides.map(s => ({ ...s })),
    slideSize: this.slideSize,
  }
}

fromJSON(data: PresentationData): void {
  this.slides = data.slides.map(s => ({ ...s }))
  this.totalSlides = data.slides.length
  this.currentSlide = 0
  if (data.slideSize) {
    this.slideSize = data.slideSize
  }
}
```

- [ ] **Step 2: Wire Save As to download JSON**

In `SaveAsPanel.tsx`, add a "World-Office Presentation (.wo-pres)" option that triggers:

```ts
const handleSaveAsJSON = () => {
  const data = presentationStore.toJSON()
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${presentationStore.document?.title || "presentation"}.wo-pres`
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 3: Wire Create New / Open to load JSON**

In `CreateNewPanel.tsx`, add a file input for loading `.wo-pres` files:

```tsx
const handleOpenFile = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target?.result as string) as PresentationData
      presentationStore.fromJSON(data)
    } catch (err) {
      console.error("Failed to load presentation:", err)
    }
  }
  reader.readAsText(file)
}
```

- [ ] **Step 4: Verify compilation**

Run: `pnpm typecheck --filter=presentationeditor-react`
Expected: No type errors

- [ ] **Step 5: Verify build**

Run: `pnpm build --filter=presentationeditor-react`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/stores/PresentationStore.ts apps/web/apps/presentationeditor-react/src/components/Toolbar/FileTab.tsx apps/web/apps/presentationeditor-react/src/components/FileMenu/
git commit -m "feat(presentation): add JSON save/load for presentations"
```

---

### Task 6: Keyboard Shortcuts — Slide Navigation

**Files:**
- Read: `apps/web/apps/presentationeditor-react/src/hooks/useKeyboardShortcuts.ts`
- Modify: add slide navigation shortcuts

- [ ] **Step 1: Read existing keyboard hooks**

Check what shortcuts already exist.

- [ ] **Step 2: Add slide navigation shortcuts**

Add handlers for:
- `ArrowLeft` or `PageUp` — previous slide
- `ArrowRight` or `PageDown` — next slide
- `Home` — first slide
- `End` — last slide
- `Ctrl+N` or `Cmd+N` — new slide
- `Delete` — delete slide (when slide panel is active)

- [ ] **Step 3: Verify compilation**

Run: `pnpm typecheck --filter=presentationeditor-react`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/hooks/useKeyboardShortcuts.ts
git commit -m "feat(presentation): add keyboard shortcuts for slide navigation"
```

---

## Spec Coverage

| Spec Requirement | Task(s) |
|---|---|
| Slide thumbnails panel | Task 1 |
| Add/reorder/delete/duplicate slides | Task 1, Task 2 |
| Slide navigation (prev/next) | Task 3, Task 6 |
| Basic canvas rendering | Task 3 |
| JSON save/load | Task 5 |
| StatusBar slide info | Task 4 |
| Keyboard shortcuts | Task 6 |

## Self-Review

- [ ] **Placeholder scan:** No TBD/TODO patterns found
- [ ] **Type consistency:** `SlideData` type is defined once in Task 2, used consistently in Tasks 1, 3, 5
- [ ] **Spec coverage:** All spec requirements mapped above
- [ ] **No circular deps:** Each task builds on previous, no circular dependencies
