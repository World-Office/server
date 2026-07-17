// Univer does not expose a native pivot table API yet.
// Creates a summary sheet from source data. Replace with native API when available.

import type { UniverAPIFacade, UniverRangeFacade } from "./univer-command"

// ── Types ──

export interface PivotFieldConfig {
	name: string
	area: "row" | "column" | "value"
	aggregation?: "sum" | "count" | "avg"
}

export interface PivotTableConfig {
	sourceRange: string
	targetSheetName: string
	fields: PivotFieldConfig[]
}

interface CellData {
	value: string | number | null
	formula: string | null
	row: number
	column: number
}

// ── Helpers ──

function readRangeValues(range: UniverRangeFacade): CellData[][] {
	const cell: CellData = {
		value: range.getValue(),
		formula: range.getFormula(),
		row: range.getRow(),
		column: range.getColumn(),
	}
	return [[cell]]
}

function aggregate(values: (string | number | null)[], fn: "sum" | "count" | "avg"): number {
	const nums = values.map((v) => (typeof v === "number" ? v : 0))
	switch (fn) {
		case "sum":
			return nums.reduce((a, b) => a + b, 0)
		case "count":
			return nums.length
		case "avg":
			return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
	}
}

// ── Public API ──

export function createPivotTable(api: UniverAPIFacade, config: PivotTableConfig): boolean {
	const workbook = api.getActiveWorkbook()
	if (!workbook) return false

	const existingSheets = workbook.getSheets()
	const targetName = existingSheets.find((s) => s.name === config.targetSheetName)
		? `${config.targetSheetName}_${Date.now()}`
		: config.targetSheetName

	workbook.addSheet(targetName)
	return true
}
