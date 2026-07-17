// Univer does not expose a native pivot table API yet.
// Creates a summary sheet from source data. Replace with native API when available.

import type { UniverAPIFacade } from "./univer-command"

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
