import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core"
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US"
import { LocaleType, createUniver, mergeLocales } from "@univerjs/presets"
import { useEffect, useRef, useState } from "react"

import "@univerjs/preset-sheets-core/lib/index.css"
import { convertXlsxToWoSpreadsheet } from "../lib/conversion"

interface WoSpreadsheet {
  version: number
  name: string
  sheetOrder: string[]
  sheets: WoSheet[]
  sharedStrings: string[]
}

interface WoSheet {
  id: string
  name: string
  rowCount: number
  columnCount: number
  rows: WoRow[]
  merges: string[]
}

interface WoRow {
  r: number
  cells: WoCell[]
}

interface WoCell {
  r: string
  t: string
  v: string
  s?: number
  f?: string
}

interface UniverCellData {
  [key: number]: {
    [key: number]: {
      v?: string | number
      f?: string
    }
  }
}

interface UniverSheet {
  id: string
  name: string
  rowCount: number
  columnCount: number
  cellData: UniverCellData
  mergeData?: Array<{
    startRow: number
    startColumn: number
    endRow: number
    endColumn: number
  }>
}

interface UniverWorkbookData {
  name: string
  sheetOrder: string[]
  sheets: Record<string, UniverSheet>
}

function woCellRefToColRow(ref: string): [number, number] {
  const match = ref.match(/^([A-Z]+)(\d+)$/)
  if (!match) return [0, 0]
  const colStr = match[1]
  const row = Number.parseInt(match[2], 10) - 1
  let col = 0
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + colStr.charCodeAt(i) - 64
  }
  return [row, col - 1]
}

function parseMergeRange(range: string): {
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
} | null {
  const parts = range.split(":")
  if (parts.length !== 2) return null
  const [startRow, startCol] = woCellRefToColRow(parts[0])
  const [endRow, endCol] = woCellRefToColRow(parts[1])
  return { startRow, startColumn: startCol, endRow, endColumn: endCol }
}

function woSpreadsheetToUniverData(wo: WoSpreadsheet): UniverWorkbookData {
  const sheets: Record<string, UniverSheet> = {}
  for (const sheet of wo.sheets) {
    const cellData: UniverCellData = {}
    for (const row of sheet.rows) {
      const rowIdx = row.r - 1
      cellData[rowIdx] = {}
      for (const cell of row.cells) {
        const [r, c] = woCellRefToColRow(cell.r)
        if (r !== rowIdx) continue
        const entry: { v?: string | number; f?: string } = {}
        if (cell.f) entry.f = cell.f
        const num = Number.parseFloat(cell.v)
        if (!Number.isNaN(num) && cell.t === "n") {
          entry.v = num
        } else {
          entry.v = cell.v
        }
        cellData[r][c] = entry
      }
    }

    const mergeData = sheet.merges
      .map(parseMergeRange)
      .filter((m): m is NonNullable<typeof m> => m !== null)

    sheets[sheet.id] = {
      id: sheet.id,
      name: sheet.name,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      cellData,
      ...(mergeData.length > 0 ? { mergeData } : {}),
    }
  }

  return {
    name: wo.name,
    sheetOrder: wo.sheetOrder,
    sheets,
  }
}

interface SpreadsheetGridProps {
  data: ArrayBuffer | null
}

export function SpreadsheetGrid({ data }: SpreadsheetGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const disposeRef = useRef<(() => void) | null>(null)
  const [univerData, setUniverData] = useState<UniverWorkbookData | null>(null)

  useEffect(() => {
    if (!data) {
      setUniverData({
        name: "Spreadsheet",
        sheetOrder: ["sheet1"],
        sheets: {
          sheet1: {
            id: "sheet1",
            name: "Sheet 1",
            rowCount: 200,
            columnCount: 26,
            cellData: {},
          },
        },
      })
      return
    }

    const text = new TextDecoder().decode(data)
    // Try to parse as WoSpreadsheet JSON first
    try {
      const parsed = JSON.parse(text) as WoSpreadsheet | Record<string, unknown>
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "sheets" in parsed &&
        Array.isArray((parsed as WoSpreadsheet).sheets)
      ) {
        setUniverData(woSpreadsheetToUniverData(parsed as WoSpreadsheet))
        return
      }
    } catch {
      // Not JSON — try XLSX binary conversion via API
    }
    // Attempt XLSX binary → WoSpreadsheet conversion
    convertXlsxToWoSpreadsheet(data)
      .then((json) => {
        try {
          const wo = JSON.parse(json) as WoSpreadsheet
          setUniverData(woSpreadsheetToUniverData(wo))
        } catch {
          setUniverData({
            name: "Spreadsheet",
            sheetOrder: ["sheet1"],
            sheets: {
              sheet1: {
                id: "sheet1",
                name: "Sheet 1",
                rowCount: 200,
                columnCount: 26,
                cellData: {},
              },
            },
          })
        }
      })
      .catch(() => {
        setUniverData({
          name: "Spreadsheet",
          sheetOrder: ["sheet1"],
          sheets: {
            sheet1: {
              id: "sheet1",
              name: "Sheet 1",
              rowCount: 200,
              columnCount: 26,
              cellData: {},
            },
          },
        })
      })
  }, [data])

  useEffect(() => {
    if (!containerRef.current || !univerData) return

    try {
      const { univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: {
          [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS),
        },
        presets: [
          UniverSheetsCorePreset({
            container: containerRef.current,
          }),
        ],
      })

      univerAPI.createWorkbook(univerData as unknown as Record<string, unknown>)
      disposeRef.current = () => univerAPI.dispose()
    } catch (err) {
      console.error("Failed to initialize Univer:", err)
    }

    return () => {
      disposeRef.current?.()
      disposeRef.current = null
    }
  }, [data, univerData])

  return (
    <div
      className="spreadsheet-grid"
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  )
}
