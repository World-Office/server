/**
 * Cell access helpers for the left-menu panels (Search, Spell Check).
 *
 * Reading goes through the Univer workbook snapshot (`workbook.save()` →
 * `sheets[sheetId].cellData`), the same source `lib/conversion.ts` uses —
 * it is the only reliable full-sheet read surface and needs no facade types.
 * Writing / navigating goes through the active Univer facade
 * (`getSheetBySheetId` → `getRange(row, col)` → `setValue()` / `activate()`),
 * each guarded with a runtime check so a facade that lacks a method degrades
 * to a no-op instead of throwing (the pattern used by univer-command.ts).
 */

import { getActiveUniverAPI, getUniverSnapshot } from "./univer-command";

/** A text-bearing cell located in the active workbook. */
export interface SheetCell {
	sheetId: string;
	sheetName: string;
	/** 0-based row index. */
	row: number;
	/** 0-based column index. */
	col: number;
	/** A1-style reference inside the sheet (e.g. "B7"). */
	ref: string;
	/** Displayed text of the cell ("" when empty). */
	value: string;
}

interface SnapshotCell {
	v?: string | number | boolean | null;
}

interface SnapshotSheet {
	id?: string;
	name?: string;
	cellData?: Record<string, Record<string, SnapshotCell | null>>;
}

interface WorkbookSnapshot {
	name?: string;
	sheetOrder?: string[];
	sheets?: Record<string, SnapshotSheet>;
}

/** Convert 0-based row/column indices to an A1-style reference. */
export function toCellRef(row: number, col: number): string {
	let colStr = "";
	let c = col;
	while (c >= 0) {
		colStr = String.fromCharCode(65 + (c % 26)) + colStr;
		c = Math.floor(c / 26) - 1;
		if (c < 0) break;
	}
	return `${colStr}${row + 1}`;
}

/**
 * Every text-bearing cell of every sheet, in sheet order (row-major).
 * Empty cells are skipped — the snapshot only materialises cells that hold
 * data, so this is cheap even on large sheets. `limit` caps the walk for
 * UI lists; the default is generous enough for panel use.
 */
export function collectTextCells(limit = 5000): SheetCell[] {
	const snapshot = getUniverSnapshot() as WorkbookSnapshot | null;
	if (!snapshot?.sheets) return [];
	const order = snapshot.sheetOrder ?? Object.keys(snapshot.sheets);
	const cells: SheetCell[] = [];
	for (const sheetId of order) {
		const sheet = snapshot.sheets[sheetId];
		if (!sheet) continue;
		const sheetName = sheet.name ?? sheetId;
		const cellData = sheet.cellData ?? {};
		for (const rowKey of Object.keys(cellData).sort(
			(a, b) => Number(a) - Number(b),
		)) {
			const row = Number.parseInt(rowKey, 10);
			if (Number.isNaN(row)) continue;
			const rowData = cellData[rowKey] ?? {};
			for (const colKey of Object.keys(rowData).sort(
				(a, b) => Number(a) - Number(b),
			)) {
				const col = Number.parseInt(colKey, 10);
				if (Number.isNaN(col)) continue;
				const cell = rowData[colKey];
				if (!cell || cell.v === undefined || cell.v === null) continue;
				const value = String(cell.v);
				if (!value) continue;
				cells.push({
					sheetId: sheet.id ?? sheetId,
					sheetName,
					row,
					col,
					ref: toCellRef(row, col),
					value,
				});
				if (cells.length >= limit) return cells;
			}
		}
	}
	return cells;
}

/** A1 reference of the current selection's active cell (e.g. "B7"), or null. */
export function getActiveCellRef(): string | null {
	const api = getActiveUniverAPI();
	const workbook = api?.getActiveWorkbook();
	if (!workbook) return null;
	try {
		const sheet = workbook.getActiveSheet();
		const range = sheet?.getSelection?.().getActiveRange();
		if (!range) return null;
		const row = typeof range.getRow === "function" ? range.getRow() : 0;
		const col = typeof range.getColumn === "function" ? range.getColumn() : 0;
		return toCellRef(row, col);
	} catch {
		return null;
	}
}

/** Name of the sheet the current selection lives on, or null. */
export function getActiveSheetName(): string | null {
	const api = getActiveUniverAPI();
	const sheet = api?.getActiveWorkbook()?.getActiveSheet();
	if (!sheet) return null;
	try {
		return typeof sheet.getSheetName === "function"
			? sheet.getSheetName()
			: null;
	} catch {
		return null;
	}
}

/**
 * Make a cell the active cell (switch sheet if needed, select the cell and
 * scroll it into view). Returns true when the facade accepted the command.
 */
export function activateCell(cell: SheetCell): boolean {
	const api = getActiveUniverAPI();
	const workbook = api?.getActiveWorkbook() as
		| (ReturnType<NonNullable<typeof getActiveUniverAPI>["getActiveWorkbook"]> & {
				getSheetBySheetId?: (id: string) => unknown;
		  })
		| null;
	if (!workbook) return false;
	try {
		const sheet =
			typeof workbook.getSheetBySheetId === "function"
				? (workbook.getSheetBySheetId(cell.sheetId) as WorksheetLike | null)
				: null;
		if (!sheet) return false;
		if (typeof workbook.setActiveSheet === "function") {
			workbook.setActiveSheet(cell.sheetId);
		}
		if (typeof sheet.getRange !== "function") return false;
		const range = sheet.getRange(cell.row, cell.col);
		if (typeof range?.activate === "function") {
			range.activate();
			return true;
		}
		if (typeof sheet.setActiveRange === "function") {
			sheet.setActiveRange(range);
			return true;
		}
		return false;
	} catch {
		return false;
	}
}

/**
 * Write a new value into a cell. Returns true when the write was dispatched
 * (Univer fires the change listeners that flip `spreadsheetStore.isModified`).
 */
export function setCellValue(cell: SheetCell, value: string): boolean {
	const api = getActiveUniverAPI();
	const workbook = api?.getActiveWorkbook() as
		| (ReturnType<NonNullable<typeof getActiveUniverAPI>["getActiveWorkbook"]> & {
				getSheetBySheetId?: (id: string) => unknown;
		  })
		| null;
	if (!workbook) return false;
	try {
		const sheet =
			typeof workbook.getSheetBySheetId === "function"
				? (workbook.getSheetBySheetId(cell.sheetId) as WorksheetLike | null)
				: null;
		if (!sheet || typeof sheet.getRange !== "function") return false;
		const range = sheet.getRange(cell.row, cell.col);
		if (typeof range?.setValue !== "function") return false;
		range.setValue(value);
		return true;
	} catch {
		return false;
	}
}
