# TT1 — Tables on Slides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add table support to the Slides Editor — table shapes with rows, columns, header styling, and cell editing.

**Architecture:** Tables are rendered as SVG similar to charts. A `table` property on `ShapeData` stores the row/column structure. The SlideCanvas renders an SVG `<table>`-like grid with header styling. InsertTab opens a TablePicker popup to choose row/column count.

**Tech Stack:** React 18, TypeScript, MobX, Vite, SVG

---

### Task 1: TableData types

**Files:**
- Modify: `apps/web/apps/presentationeditor-react/src/types/presentation.ts`

- [ ] **Add TableData, TableCell, TableRow types**

Add after the ChartData types (around line 278):

```typescript
export interface TableData {
  rows: number
  columns: number
  headerRow: boolean
  cells: TableRow[]
  columnWidths?: number[]
}

export interface TableRow {
  cells: TableCell[]
}

export interface TableCell {
  text: string
  colSpan?: number
  rowSpan?: number
}
```

- [ ] **Add `table?: TableData` to ShapeData**

```typescript
  chart?: ChartData
  table?: TableData
}
```

- [ ] **Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/types/presentation.ts
git commit -m "feat(slides): add TableData/TableCell/TableRow types"
```

---

### Task 2: SVG table rendering

**Files:**
- Modify: `apps/web/apps/presentationeditor-react/src/components/SlideCanvas/SlideCanvas.tsx`

- [ ] **Add renderTableSvg function before renderShape**

```typescript
function renderTableSvg(table: TableData, width: number, height: number): JSX.Element[] {
  const elements: JSX.Element[] = []
  const numRows = Math.max(table.rows, 1)
  const numCols = Math.max(table.columns, 1)
  const colWidth = width / numCols
  const rowHeight = height / numRows
  const headerBg = "#4472C4"
  const headerFg = "#ffffff"
  const borderColor = "#ccc"

  for (let ri = 0; ri < numRows; ri++) {
    for (let ci = 0; ci < numCols; ci++) {
      const x = ci * colWidth
      const y = ri * rowHeight
      const cellText = table.cells?.[ri]?.cells?.[ci]?.text ?? ""
      const isHeader = table.headerRow && ri === 0

      elements.push(
        <rect
          key={`bg-${ri}-${ci}`}
          x={x}
          y={y}
          width={colWidth}
          height={rowHeight}
          fill={isHeader ? headerBg : "white"}
          stroke={borderColor}
          strokeWidth={0.5}
        />,
      )

      elements.push(
        <text
          key={`txt-${ri}-${ci}`}
          x={x + colWidth / 2}
          y={y + rowHeight / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fill={isHeader ? headerFg : "#333"}
          fontWeight={isHeader ? "bold" : "normal"}
        >
          {cellText || (isHeader ? `Header ${ci + 1}` : "")}
        </text>,
      )
    }
  }

  return elements
}
```

- [ ] **Create sample table data for empty tables**

```typescript
function getSampleTable(rows: number, columns: number): TableData {
  const cells: TableRow[] = []
  for (let ri = 0; ri < rows; ri++) {
    const row: TableCell[] = []
    for (let ci = 0; ci < columns; ci++) {
      row.push({ text: ri === 0 ? `Header ${ci + 1}` : "" })
    }
    cells.push({ cells: row })
  }
  return { rows, columns, headerRow: true, cells }
}
```

- [ ] **Wire table rendering in renderShape**

Add a `shape.table` block before the switch statement, similar to the chart block:

```typescript
  if (shape.table) {
    const tableSvg = renderTableSvg(shape.table, shape.width, shape.height)
    return (
      <div key={shape.id} style={style} onMouseDown={handleMouseDown}>
        <svg width={shape.width} height={shape.height}>
          {tableSvg}
        </svg>
        {isSelected && renderResizeHandles(shape.id, onResizeStart)}
      </div>
    )
  }
```

- [ ] **Add import for TableData at top of file**

```typescript
import type { ChartData, ShapeData, TableData } from "../../types/presentation"
```

- [ ] **Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/components/SlideCanvas/SlideCanvas.tsx
git commit -m "feat(slides): add SVG table rendering to SlideCanvas"
```

---

### Task 3: TablePicker popup

**Files:**
- Create: `apps/web/apps/presentationeditor-react/src/components/Toolbar/TablePicker.tsx`

- [ ] **Create TablePicker component**

```typescript
import { useState, useRef, useEffect } from "react"
import { observer } from "mobx-react-lite"
import { presentationStore } from "../../stores/PresentationStore"

const ObservedTablePicker = observer(function ObservedTablePicker() {
  const [open, setOpen] = useState(false)
  const [hoverCols, setHoverCols] = useState(3)
  const [hoverRows, setHoverRows] = useState(3)
  const maxRows = 8
  const maxCols = 8
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const insertTable = (rows: number, cols: number) => {
    const slideIndex = presentationStore.currentSlide
    const slide = presentationStore.slides[slideIndex]
    if (!slide) return
    const existing = slide.shapes?.length || 0

    const cells = []
    for (let ri = 0; ri < rows; ri++) {
      const row = []
      for (let ci = 0; ci < cols; ci++) {
        row.push({ text: ri === 0 ? `Header ${ci + 1}` : `Cell ${ci + 1}` })
      }
      cells.push({ cells: row })
    }

    presentationStore.addShape(slideIndex, {
      id: `table-${Date.now()}`,
      type: "rect",
      x: 80 + existing * 30,
      y: 60 + existing * 20,
      width: 400,
      height: 200,
      zIndex: existing,
      fillColor: "#f8f9fa",
      strokeColor: "#ccc",
      strokeWidth: 1,
      rotation: 0,
      table: {
        rows,
        columns: cols,
        headerRow: true,
        cells,
      },
    })
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="prese-inserttab-btn"
        title="Table"
        onClick={() => setOpen(!open)}
      >
        Table
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 1000,
            background: "white",
            border: "1px solid #e0e0e0",
            borderRadius: "4px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            padding: "8px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${maxCols}, 16px)`,
              gap: "2px",
              marginBottom: "4px",
            }}
          >
            {Array.from({ length: maxRows * maxCols }, (_, i) => {
              const col = i % maxCols
              const row = Math.floor(i / maxCols)
              const active = col < hoverCols && row < hoverRows
              return (
                <div
                  key={i}
                  style={{
                    width: "16px",
                    height: "16px",
                    border: active ? "1px solid #4472C4" : "1px solid #ccc",
                    background: active ? "#e8f0fe" : "white",
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => { setHoverCols(col + 1); setHoverRows(row + 1) }}
                  onClick={() => insertTable(row + 1, col + 1)}
                />
              )
            })}
          </div>
          <div style={{ fontSize: "11px", color: "#666", textAlign: "center" }}>
            {hoverRows} × {hoverCols}
          </div>
        </div>
      )}
    </div>
  )
})

export { ObservedTablePicker as TablePicker }
```

- [ ] **Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/components/Toolbar/TablePicker.tsx
git commit -m "feat(slides): add TablePicker popup for row/column selection"
```

---

### Task 4: Wire InsertTab Table button

**Files:**
- Modify: `apps/web/apps/presentationeditor-react/src/components/Toolbar/InsertTab.tsx`

- [ ] **Add import and replace Table button**

Add import after ChartTypePicker:

```typescript
import { TablePicker } from "./TablePicker"
```

Replace the existing Table button placeholder with `<TablePicker />`:

```typescript
      {/* Tables */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <TablePicker />
        </div>
      </div>
```

- [ ] **Commit**

```bash
git add apps/web/apps/presentationeditor-react/src/components/Toolbar/InsertTab.tsx
git commit -m "feat(slides): wire TablePicker in InsertTab"
```

---

### Task 5: Build verify

**Files:**
- Run at root: `server/`

- [ ] **Build and fix any issues**

```bash
pnpm --filter @world-office/presentationeditor build
```

Expected: ~131 modules transformed, clean exit.

- [ ] **Commit plan file and push all**

```bash
git add plan/2026-06-07-tt1-tables-on-slides.md
git commit -m "docs: add TT1 tables-on-slides sprint plan"
git push origin main
```
