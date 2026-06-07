# SC1: Canvas Polish & Shapes Sprint

> **Goal:** Add shape support to the Slides Editor — render, create, select, move, resize shapes on the SlideCanvas
>
> **Architecture:** Shape data lives in `SlideData.shapes[]` as typed objects with bounds/fill/stroke. Canvas renders shapes via positioned divs within the slide container. InsertTab Shapes and Text Box buttons open a shapes gallery. Arrange buttons control z-order.
>
> **Tech Stack:** TypeScript, MobX (store), React (components), CSS (SVG-free shape rendering via divs)

---

### Task 1: Shape data types + store actions

**Files:**
- Modify: `apps/web/apps/presentationeditor-react/src/types/presentation.ts`
- Modify: `apps/web/apps/presentationeditor-react/src/stores/PresentationStore.ts`

Add to `types/presentation.ts`:

```typescript
export type ShapeType = "rect" | "ellipse" | "triangle" | "diamond" | "line" | "arrow" | "connector" | "textbox"

export interface ShapeData {
  id: string
  type: ShapeType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  fillColor: string
  strokeColor: string
  strokeWidth: number
  text?: string
  fontSize?: number
  fontColor?: string
  zIndex: number
}
```

Add `shapes: ShapeData[]` to `SlideData` (default `[]`).

Add to `PresentationStore.ts`:
```typescript
addShape(slideIndex: number, shape: Omit<ShapeData, "id" | "zIndex">): void
updateShape(slideIndex: number, shapeId: string, props: Partial<ShapeData>): void
removeShape(slideIndex: number, shapeId: string): void
moveShape(slideIndex: number, shapeId: string, direction: "forward" | "backward" | "front" | "back"): void
```

Update `toJSON`/`fromJSON` to persist shapes. Update `addSlide`/`duplicateSlide`/`resetToDefaults`.

Run: `pnpm --filter @world-office/presentationeditor build`

### Task 2: Shape rendering on SlideCanvas

**Files:**
- Modify: `apps/web/apps/presentationeditor-react/src/components/SlideCanvas/SlideCanvas.tsx`
- Modify: `apps/web/apps/presentationeditor-react/src/styles/presentation.css`

Update `SlideCanvas.tsx`:
- After the layout placeholders, render `slide.shapes.map(shape => <ShapeComponent key={shape.id} shape={shape} />)`
- Create a `ShapeComponent` inline function that renders each shape type as a positioned div with CSS styling:
  - `rect`: `<div>` with border-radius: 0, background, border
  - `ellipse`: `<div>` with border-radius: 50%
  - `triangle`: `<div>` with clip-path: polygon(50% 0%, 0% 100%, 100% 100%)
  - `diamond`: `<div>` with clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)
  - `line`/`arrow`/`connector`: `<div>` with border-top or transform: rotate()

Add CSS for shape selection and handles.

### Task 3: Shape selection, move, resize

**Files:**
- Modify: `apps/web/apps/presentationeditor-react/src/components/SlideCanvas/SlideCanvas.tsx`
- Modify: `apps/web/apps/presentationeditor-react/src/styles/presentation.css`

- Add `selectedShapeId: string | null` to store + `selectShape(id)`, `deselectShapes()`
- On canvas click (not on a shape): deselect
- On shape click: select that shape, show selection border + 8 resize handles
- Drag shape: update `x`, `y` via mousedown/mousemove/mouseup
- Resize handles: 4 corners + 4 midpoints, drag to resize

### Task 4: Shapes gallery + InsertTab Shapes button

**Files:**
- Create: `apps/web/apps/presentationeditor-react/src/components/Toolbar/ShapeGallery.tsx`
- Modify: `apps/web/apps/presentationeditor-react/src/components/Toolbar/InsertTab.tsx`

Create `ShapeGallery.tsx`:
- A popover/gallery showing shape options grouped by type
- Basic shapes: rect, rounded rect, ellipse, triangle, diamond
- Arrows: right arrow, left arrow, up arrow, down arrow
- Lines: line, connector
- Click inserts shape at center of current slide with default size

Wire InsertTab Shapes button:
```typescript
import { useState } from "react"
const [showShapes, setShowShapes] = useState(false)
// Button onClick toggles shape gallery
```

### Task 5: Arrange controls

**Files:**
- Modify: `apps/web/apps/presentationeditor-react/src/components/Toolbar/HomeTab.tsx`

Wire Arrange button in HomeTab:
- When a shape is selected, show Arrange sub-menu with:
  - Bring to Front
  - Send to Back
  - Bring Forward
  - Send Backward

### Task 6: Text Box insert

**Files:**
- Modify: `apps/web/apps/presentationeditor-react/src/components/Toolbar/InsertTab.tsx`

Wire Text Box button → insert a textbox shape at center of current slide.

### Task 7: Build verification + keyboard delete

**Files:**
- No new files

- Wire Delete/Backspace key to remove selected shape
- Verify build: `pnpm --filter @world-office/presentationeditor build`

### Task 8: Commit

Commit all changes as a single cohesive feature commit.
