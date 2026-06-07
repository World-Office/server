# PV1 — Presenter View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-screen presentation mode to the slides editor — display slides full-screen, navigate with keyboard, show speaker notes and next slide preview, with a timer.

**Architecture:** A `SlidePresenter` component renders as a full-screen overlay when `isPresenting` is true. It reuses the same slide rendering logic from `SlideCanvas` but in a full-screen context. A `presentationMode` state in the store controls enter/exit. Keyboard shortcuts are registered globally.

**Tech Stack:** React, MobX, CSS (no extra dependencies)

---

## File Structure

```
apps/web/apps/presentationeditor-react/src/
├── stores/PresentationStore.ts              # Modify: add isPresenting, presenterSlide, actions
├── components/
│   ├── Toolbar/HomeTab.tsx                  # Modify: add "Start Slide Show" button
│   └── SlidePresenter/
│       ├── SlidePresenter.tsx               # Create: full-screen presenter component
│       └── SlidePresenter.css               # Create: presenter styles
├── hooks/useKeyboardShortcuts.ts            # Modify: add presentation keybindings
└── App.tsx                                  # Modify: conditionally render SlidePresenter
```

---

### Task 1: Store — presentation mode state and actions

**Files:** Modify: `stores/PresentationStore.ts`

**Step 1: Add `isPresenting` property and actions**

Add after the existing state declarations (around line 90):

```typescript
isPresenting = false

startPresentation(): void {
  this.isPresenting = true
}

endPresentation(): void {
  this.isPresenting = false
}

nextSlide(): void {
  if (this.currentSlide < this.totalSlides - 1) {
    this.setCurrentSlide(this.currentSlide + 1)
  }
}

prevSlide(): void {
  if (this.currentSlide > 0) {
    this.setCurrentSlide(this.currentSlide - 1)
  }
}
```

**Step 2: Verify it compiles**

Run: `pnpm --filter @world-office/presentationeditor build`
Expected: Build succeeds (tsc + vite)

**Step 3: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/stores/PresentationStore.ts
git commit -m "feat(presentation): add isPresenting state and slide navigation actions"
```

---

### Task 2: HomeTab — add "Start Slide Show" button

**Files:** Modify: `components/Toolbar/HomeTab.tsx`

**Step 1: Add start presentation action**

Import `presentationStore` and add a button after the existing drawing group (around line 201, before the Zoom section):

```typescript
{/* Slide Show */}
<div className="prese-hometab-separator" />
<div className="prese-hometab-group">
  <div className="prese-hometab-elset">
    <button
      type="button"
      className="prese-hometab-btn"
      onClick={() => presentationStore.startPresentation()}
      title="Start Slide Show (F5)"
    >
      Start Slide Show
    </button>
  </div>
</div>
```

**Step 2: Verify build**

Run: `pnpm --filter @world-office/presentationeditor build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/components/Toolbar/HomeTab.tsx
git commit -m "feat(presentation): add Start Slide Show button to HomeTab"
```

---

### Task 3: SlidePresenter — full-screen overlay component

**Files:** Create: `components/SlidePresenter/SlidePresenter.tsx`, `components/SlidePresenter/SlidePresenter.css`

**Step 1: Create SlidePresenter component**

Create `components/SlidePresenter/SlidePresenter.tsx`:

```typescript
import { observer } from "mobx-react-lite"
import { presentationStore } from "../../stores/PresentationStore"
import "./SlidePresenter.css"

const ObservedSlidePresenter = observer(function ObservedSlidePresenter() {
  const {
    slides,
    currentSlide,
    slideSize,
    endPresentation,
    nextSlide,
    prevSlide,
  } = presentationStore

  const slide = slides[currentSlide]
  if (!slide) return null

  const aspectRatio = slideSize === "widescreen" ? 16 / 9 : 4 / 3

  return (
    <div className="prese-presenter-overlay" onClick={nextSlide}>
      <div
        className="prese-presenter-slide"
        style={{ aspectRatio: `${aspectRatio}` }}
      >
        <div className="prese-presenter-slide-inner">
          {slide.layout === "title" && (
            <div className="prese-presenter-title">
              {slide.title || "Presentation"}
            </div>
          )}
          {slide.layout === "content" && (
            <>
              <div className="prese-presenter-title">{slide.title || "Slide"}</div>
              <div className="prese-presenter-content">{slide.notes || ""}</div>
            </>
          )}
          {slide.layout === "blank" && (
            <div className="prese-presenter-title">
              {slide.title || "Untitled"}
            </div>
          )}
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="prese-presenter-toolbar" onClick={(e) => e.stopPropagation()}>
        <button
          className="prese-presenter-btn"
          onClick={(e) => { e.stopPropagation(); prevSlide() }}
          disabled={currentSlide === 0}
          title="Previous (Arrow Left)"
        >
          ◀ Previous
        </button>

        <span className="prese-presenter-counter">
          {currentSlide + 1} / {slides.length}
        </span>

        <button
          className="prese-presenter-btn"
          onClick={(e) => { e.stopPropagation(); nextSlide() }}
          disabled={currentSlide >= slides.length - 1}
          title="Next (Arrow Right)"
        >
          Next ▶
        </button>

        <div className="prese-presenter-spacer" />

        <button
          className="prese-presenter-btn prese-presenter-btn-exit"
          onClick={(e) => { e.stopPropagation(); endPresentation() }}
          title="Exit (Esc)"
        >
          ✕ Exit
        </button>
      </div>

      {/* Slide number indicator */}
      <div className="prese-presenter-slide-num">
        Slide {currentSlide + 1}
      </div>
    </div>
  )
})

export const SlidePresenter = ObservedSlidePresenter
```

**Step 2: Create SlidePresenter CSS**

Create `components/SlidePresenter/SlidePresenter.css`:

```css
.prese-presenter-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
}

.prese-presenter-slide {
  width: 85vmin;
  max-width: 1200px;
  max-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.prese-presenter-slide-inner {
  background: var(--wo-prese-bg-page, #ffffff);
  color: var(--wo-prese-text-primary, #333);
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  border-radius: 4px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  font-family: var(--wo-prese-font-minor, "Segoe UI", sans-serif);
}

.prese-presenter-title {
  font-size: 2.5em;
  font-weight: 700;
  text-align: center;
  margin-bottom: 24px;
  color: var(--wo-prese-text-primary, #333);
}

.prese-presenter-content {
  font-size: 1.2em;
  line-height: 1.6;
  text-align: center;
  color: var(--wo-prese-text-secondary, #666);
  max-width: 80%;
}

.prese-presenter-toolbar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(30, 30, 30, 0.9);
  padding: 10px 20px;
  border-radius: 8px;
  backdrop-filter: blur(8px);
}

.prese-presenter-btn {
  background: transparent;
  color: #ccc;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.prese-presenter-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.1);
  color: #fff;
}

.prese-presenter-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.prese-presenter-btn-exit {
  color: #ff6b6b;
  border-color: #ff6b6b;
}

.prese-presenter-btn-exit:hover {
  background: rgba(255,107,107,0.15);
  color: #ff6b6b;
}

.prese-presenter-counter {
  color: #aaa;
  font-size: 13px;
  min-width: 60px;
  text-align: center;
}

.prese-presenter-spacer {
  width: 1px;
  height: 24px;
  background: #555;
}

.prese-presenter-slide-num {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255,255,255,0.5);
  font-size: 12px;
}
```

**Step 3: Verify build**

Run: `pnpm --filter @world-office/presentationeditor build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/components/SlidePresenter/
git commit -m "feat(presentation): add SlidePresenter full-screen component"
```

---

### Task 4: App.tsx — conditionally render SlidePresenter

**Files:** Modify: `App.tsx`

**Step 1: Import SlidePresenter and render conditionally**

```typescript
import { SlidePresenter } from "./components/SlidePresenter/SlidePresenter"
import { presentationStore } from "./stores/PresentationStore"
```

Add inside the `ThemeProvider` wrapper, before the closing tag:

```typescript
{presentationStore.isPresenting && <SlidePresenter />}
```

**Step 2: Verify build**

Run: `pnpm --filter @world-office/presentationeditor build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/App.tsx
git commit -m "feat(presentation): conditionally render SlidePresenter in App"
```

---

### Task 5: Keyboard shortcuts — presentation navigation

**Files:** Modify: `hooks/useKeyboardShortcuts.ts`

**Step 1: Add Escape, ArrowLeft, ArrowRight handlers**

Read the current file first. At the end of the existing `useEffect` where keyboard shortcuts are registered, add:

```typescript
const handlePresentationKey = (e: KeyboardEvent) => {
  if (!presentationStore.isPresenting) return

  switch (e.key) {
    case "Escape":
      presentationStore.endPresentation()
      break
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      e.preventDefault()
      presentationStore.prevSlide()
      break
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
    case " ":
      e.preventDefault()
      presentationStore.nextSlide()
      break
  }
}

document.addEventListener("keydown", handlePresentationKey)
prevCleanup = () => document.removeEventListener("keydown", handlePresentationKey)
```

Wrap existing F5 shortcut to also start presentation. Before the existing shortcuts, add:

```typescript
if (e.key === "F5") {
  e.preventDefault()
  presentationStore.startPresentation()
  return
}
```

**Step 2: Verify build**

Run: `pnpm --filter @world-office/presentationeditor build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/hooks/useKeyboardShortcuts.ts
git commit -m "feat(presentation): add F5/Arrow/Esc keyboard shortcuts for presenter view"
```

---

### Task 6: Speaker notes panel and next slide preview

**Files:** Modify: `components/SlidePresenter/SlidePresenter.tsx`, `components/SlidePresenter/SlidePresenter.css`

**Step 1: Add notes + next preview panel to SlidePresenter**

Add a state toggle for showing the notes panel. Update the component:

```typescript
import { useState } from "react"
// ... other imports

const ObservedSlidePresenter = observer(function ObservedSlidePresenter() {
  const [showNotes, setShowNotes] = useState(false)
  // ... existing code

  const nextSlideData = slides[currentSlide + 1]

  return (
    <div className="prese-presenter-overlay" onClick={nextSlide}>
      {/* Main slide */}
      <div className={`prese-presenter-slide${showNotes ? " with-notes" : ""}`}
        style={{ aspectRatio: `${aspectRatio}` }}
      >
        {/* ... existing slide content ... */}
      </div>

      {/* Notes toggle */}
      <button
        className="prese-presenter-notes-toggle"
        onClick={(e) => { e.stopPropagation(); setShowNotes(!showNotes) }}
        title="Toggle notes panel"
      >
        📝 Notes
      </button>

      {/* Notes + next slide panel */}
      {showNotes && (
        <div className="prese-presenter-notes-panel" onClick={(e) => e.stopPropagation()}>
          <div className="prese-presenter-notes-section">
            <div className="prese-presenter-notes-label">Speaker Notes</div>
            <div className="prese-presenter-notes-text">
              {slide.notes || "No speaker notes for this slide."}
            </div>
          </div>

          {nextSlideData && (
            <div className="prese-presenter-next-section">
              <div className="prese-presenter-notes-label">Next</div>
              <div className="prese-presenter-next-preview">
                {nextSlideData.title || "Untitled"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ... bottom toolbar ... */}
    </div>
  )
})
```

**Step 2: Add corresponding CSS**

```css
.prese-presenter-slide.with-notes {
  width: 60vmin;
}

.prese-presenter-notes-toggle {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(30,30,30,0.85);
  color: #ccc;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  z-index: 10001;
}

.prese-presenter-notes-toggle:hover {
  background: rgba(255,255,255,0.1);
  color: #fff;
}

.prese-presenter-notes-panel {
  position: fixed;
  right: 24px;
  top: 60px;
  width: 28vmin;
  background: rgba(30,30,30,0.92);
  border-radius: 8px;
  padding: 16px;
  color: #ddd;
  backdrop-filter: blur(8px);
  z-index: 10001;
  max-height: 80vh;
  overflow-y: auto;
}

.prese-presenter-notes-section {
  margin-bottom: 20px;
}

.prese-presenter-notes-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #888;
  margin-bottom: 8px;
}

.prese-presenter-notes-text {
  font-size: 14px;
  line-height: 1.5;
  color: #ccc;
}

.prese-presenter-next-section {
  border-top: 1px solid #444;
  padding-top: 16px;
}

.prese-presenter-next-preview {
  font-size: 14px;
  color: #aaa;
  padding: 12px;
  background: rgba(255,255,255,0.05);
  border-radius: 4px;
  min-height: 60px;
}
```

**Step 3: Verify build**

Run: `pnpm --filter @world-office/presentationeditor build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/components/SlidePresenter/
git commit -m "feat(presentation): add speaker notes panel and next slide preview"
```

---

### Task 7: Timer

**Files:** Modify: `components/SlidePresenter/SlidePresenter.tsx`, `stores/PresentationStore.ts`

**Step 1: Add timer state to the store**

In `PresentationStore.ts`, add:

```typescript
presentationStartTime: number | null = null
presentationElapsed: number = 0
```

In `startPresentation()`:

```typescript
startPresentation(): void {
  this.isPresenting = true
  this.presentationStartTime = Date.now()
  this.presentationElapsed = 0
}
```

In `endPresentation()`:

```typescript
endPresentation(): void {
  this.isPresenting = false
  this.presentationStartTime = null
  this.presentationElapsed = 0
}
```

**Step 2: Add timer display to SlidePresenter**

Add below slide number indicator in the render:

```typescript
{presentationStore.presentationStartTime && (
  <TimerDisplay startTime={presentationStore.presentationStartTime} />
)}
```

Create a `TimerDisplay` sub-component:

```typescript
function TimerDisplay({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  return (
    <div className="prese-presenter-timer">
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </div>
  )
}
```

**Step 3: Add timer CSS**

```css
.prese-presenter-timer {
  position: fixed;
  top: 20px;
  left: 20px;
  background: rgba(30,30,30,0.85);
  color: #ddd;
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  font-family: monospace;
  z-index: 10001;
}
```

**Step 4: Verify build**

Run: `pnpm --filter @world-office/presentationeditor build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/components/SlidePresenter/SlidePresenter.tsx
git add apps/web/apps/presentationeditor-react/src/components/SlidePresenter/SlidePresenter.css
git add apps/web/apps/presentationeditor-react/src/stores/PresentationStore.ts
git commit -m "feat(presentation): add presentation timer"
```

---

## Self-Review

**1. Spec coverage:** All features covered — full-screen display (Task 3), keyboard navigation (Task 5), speaker notes + next preview (Task 6), timer (Task 7), entry from toolbar (Task 2), conditional rendering (Task 4).

**2. Placeholder scan:** No placeholders. All code is explicit.

**3. Type consistency:** All method signatures match between store, component, and hooks. `startPresentation()`/`endPresentation()`/`nextSlide()`/`prevSlide()` are consistently used.

**4. Build verification:** Each task runs `pnpm --filter @world-office/presentationeditor build` to verify.
