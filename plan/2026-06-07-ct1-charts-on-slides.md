# CT1: Charts on Slides — Implementation Plan

**Goal:** Add chart creation and rendering to the presentation editor (bar, column, line, pie, doughnut).

**Architecture:** ChartData type + SVG rendering in SlideCanvas, chart type picker popup, InsertTab Chart button. Charts are stored as shapes with an optional `chart` field on ShapeData.

**Tech Stack:** TypeScript, React, MobX, SVG

---

### Task 1: ChartData types + store actions

**Files:**
- Modify: `src/types/presentation.ts`
- Modify: `src/stores/PresentationStore.ts`

- [ ] Add `ChartType`, `ChartData`, `ChartSeries` types to presentation.ts
- [ ] Add `chart?: ChartData` field to `ShapeData`
- [ ] Add `addChartToSlide(slideIndex, chartType)` action that creates a chart shape
- [ ] Update `toJSON`/`fromJSON` to persist chart data
- [ ] **Build check**

### Task 2: SVG chart rendering

**Files:**
- Modify: `src/components/SlideCanvas/SlideCanvas.tsx`

- [ ] Add `renderChart()` function that renders SVG charts:
  - Bar: horizontal bars with axis labels
  - Column: vertical bars with axis labels
  - Line: connected points with axis
  - Pie: sectors with labels
  - Doughnut: sectors with hole
- [ ] Render chart when `shape.chart` is present in `renderShape()`
- [ ] **Build check**

### Task 3: Chart type picker popup

**Files:**
- Create: `src/components/Toolbar/ChartTypePicker.tsx`

- [ ] Create ChartTypePicker component with 5 chart type buttons (bar, column, line, pie, doughnut) with SVG preview icons
- [ ] Click-outside-to-close behavior
- [ ] Each button calls `addChartToSlide(currentSlide, chartType)`
- [ ] **Build check**

### Task 4: Wire InsertTab Chart button

**Files:**
- Modify: `src/components/Toolbar/InsertTab.tsx`

- [ ] Replace "Table" stub button with ChartTypePicker popup
- [ ] Add a "Chart" button section in Illustrations group
- [ ] **Build check**

### Task 5: Build verify + commit

- [ ] `pnpm --filter @world-office/presentationeditor build`
- [ ] Commit with message: `feat(presentation): charts — bar, column, line, pie, doughnut rendering`
