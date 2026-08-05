/**
 * Spreadsheet command bridge for the toolbar.
 *
 * The toolbar is a sibling of SpreadsheetGrid (separate React components).
 * To dispatch formatting commands from toolbar buttons we use a module-level
 * "active Univer API" reference set by SpreadsheetGrid after createUniver().
 *
 * If a command is dispatched while no Univer instance is mounted the
 * dispatcher becomes a no-op. Callers do not need to guard for this.
 *
 * Pattern follows rte-command.ts from documenteditor-react.
 */

import {
	applyConditionalFormatting,
	removeConditionalFormatting,
} from "./conditional-formatting";
import { applyDataValidation } from "./data-validation";
import { createPivotTable } from "./pivot-table";

/** Commands that the spreadsheet ribbon can dispatch. */
export type UniverCommand =
	// ── Font formatting ──
	| "bold"
	| "italic"
	| "underline"
	| "strikethrough"
	| "increaseFontSize"
	| "decreaseFontSize"
	| "fontFamily"
	| "textColor"
	| "fillColor"
	// ── Alignment ──
	| "alignLeft"
	| "alignCenter"
	| "alignRight"
	| "mergeCells"
	| "wrapText"
	// ── Number format ──
	| "numberFormatCurrency"
	| "currencyFormat"
	| "numberFormatPercent"
	| "percentFormat"
	| "increaseDecimal"
	| "decreaseDecimal"
	| "decimalFormat"
	// ── Clear ──
	| "clearFormatting"
	// ── Data operations ──
	| "sort"
	| "sortAscending"
	| "sortDescending"
	| "filter"
	| "sum"
	| "insertCells"
	| "deleteCells"
	// ── Charts (stub) ──
	| "insertColumnChart"
	| "insertLineChart"
	| "insertPieChart"
	| "insertBarChart"
	| "insertAreaChart"
	| "insertScatterChart"
	| "insertLineSparkline"
	| "insertColumnSparkline"
	| "insertWinLossSparkline"
	// ── Formula functions (stub) ──
	| "funcSum"
	| "funcAverage"
	| "funcCount"
	| "funcMin"
	| "funcMax"
	| "funcIf"
	| "funcVLookup"
	// ── Page layout ──
	| "setMargins"
	| "setOrientation"
	| "setPageSize"
	// ── Arrange ──
	| "bringForward"
	| "sendBackward"
	| "bringToFront"
	| "sendToBack"
	| "alignObjects"
	| "groupObjects"
	| "ungroupObjects"
	// ── Find / Replace ──
	| "find"
	| "replace"
	// ── Advanced ──
	| "pivotTable"
	| "conditionalFormat"
	| "removeConditionalFormat"
	| "dataValidation";

/**
 * Minimal subset of the Univer facade API that we use.
 *
 * The real type comes from @univerjs/presets (re-exports from @univerjs/core).
 * We declare a narrow interface here so we don't depend on Univer types at the
 * command-bridge level and can unit-test without a full Univer install.
 */
export interface UniverAPIFacade {
	getActiveWorkbook(): UniverWorkbookFacade | null;
	addEvent(
		event: unknown,
		callback: (...args: unknown[]) => void,
	): {
		dispose(): void;
	};
}

export interface UniverSheetInfo {
	id: string;
	name: string;
}

export interface UniverWorkbookFacade {
	getActiveSheet(): UniverWorksheetFacade | null;
	/** Save workbook snapshot data (cell values, styles, merges, etc.). */
	save(): unknown;
	/** Get all sheets in the workbook. */
	getSheets(): UniverSheetInfo[];
	/** Set the active sheet by ID. */
	setActiveSheet(sheetId: string): unknown;
	/** Add a new sheet with the given name. */
	addSheet(name: string): unknown;
	/** Delete a sheet by ID. */
	deleteSheet(sheetId: string): unknown;
	/** Rename a sheet. */
	renameSheet(sheetId: string, name: string): unknown;
	/** Duplicate a sheet. */
	duplicateSheet(sheetId: string): unknown;
	/** Get the active sheet ID. */
	getActiveSheetId(): string;
	/** Get sheet names array. */
	getSheetNames(): string[];
}

export interface UniverWorksheetFacade {
	getSelection(): {
		getActiveRange(): UniverRangeFacade | null;
	};
	/** Get the sheet's unique ID. */
	getSheetId(): string;
	/** Get the sheet's display name. */
	getSheetName(): string;
	/** Sort the selected range (ascending or descending). */
	sort(options?: { ascending?: boolean }): unknown;
	/** Toggle filter on the selected range. */
	filter(): unknown;
	/** Insert cells (shift right or shift down). */
	insertCells(direction?: "right" | "down"): unknown;
	/** Delete cells (shift left or shift up). */
	deleteCells(direction?: "left" | "up"): unknown;
	/** Insert rows at the given index. */
	insertRow(row: number, count?: number): unknown;
	/** Delete rows at the given index. */
	deleteRow(row: number, count?: number): unknown;
	/** Insert columns at the given index. */
	insertColumn(col: number, count?: number): unknown;
	/** Delete columns at the given index. */
	deleteColumn(col: number, count?: number): unknown;
}

export interface UniverRangeFacade {
	// ── Setters ──
	setFontWeight(weight: "bold" | "normal" | null): unknown;
	setFontStyle(style: "italic" | "normal" | null): unknown;
	setFontLine(line: "underline" | "line-through" | "none" | null): unknown;
	setFontColor(color: string | null): unknown;
	setBackgroundColor(color: string | null): unknown;
	setHorizontalAlignment(
		align: "left" | "center" | "right" | "normal",
	): unknown;
	setFontSize(size: number | null): unknown;
	setFontName(name: string | null): unknown;
	setNumberFormat(format: string | null): unknown;
	merge(): unknown;
	setWrap(isWrapEnabled: boolean): unknown;
	clear(options?: unknown): unknown;

	// ── Getters (for state tracking) ──
	getFontWeight(): string;
	getFontStyle(): string;
	getFontLine(): string;
	getFontColor(): string;
	getBackgroundColor(): string;
	getHorizontalAlignment(): string;
	getFontSize(): number;
	getWrap(): boolean;
	getValue(): string | number | null;
	getFormula(): string | null;
	/** 0-based row index. */
	getRow(): number;
	/** 0-based column index. */
	getColumn(): number;
	/** Get the cell reference string (e.g. "A1"). */
	getCellRef(): string;

	// ── Value setters ──
	/** Set the cell value (plain text or number). */
	setValue(value: string | number | null): unknown;
	/** Set a formula (e.g. "=SUM(A1:A10)"). */
	setFormula(formula: string): unknown;
}

let activeAPI: UniverAPIFacade | null = null;

export function getActiveUniverAPI(): UniverAPIFacade | null {
	return activeAPI;
}

export function setActiveUniverAPI(api: UniverAPIFacade | null): void {
	activeAPI = api;
}

/**
 * Get the current Univer workbook snapshot (cell data, styles, merges, etc.).
 * Returns null if no Univer instance is active.
 */
export function getUniverSnapshot(): unknown | null {
	const api = activeAPI;
	if (!api) return null;
	const workbook = api.getActiveWorkbook();
	if (!workbook) return null;
	return workbook.save();
}

type ChangeListener = () => void;
const changeListeners = new Set<ChangeListener>();

/**
 * Subscribe to Univer workbook changes. The callback fires after every
 * command execution (cell edits, formatting, etc.).
 * Returns an unsubscribe function.
 */
export function onUniverChange(callback: ChangeListener): () => void {
	changeListeners.add(callback);
	return () => {
		changeListeners.delete(callback);
	};
}

/**
 * Register the Univer command-executed event handler.
 * Called by SpreadsheetGrid after createUniver().
 */
export function registerUniverChangeHandler(api: UniverAPIFacade): void {
	try {
		api.addEvent(
			(api as unknown as { Event: { CommandExecuted: string } }).Event
				.CommandExecuted,
			() => {
				for (const listener of changeListeners) {
					listener();
				}
			},
		);
	} catch {
		console.warn("[UniverCommand] Failed to register change handler");
	}
}

/**
 * Get the active worksheet and range. Returns null if unavailable.
 */
function getActiveRange(): UniverRangeFacade | null {
	const api = activeAPI;
	if (!api) return null;
	const workbook = api.getActiveWorkbook();
	if (!workbook) return null;
	const worksheet = workbook.getActiveSheet();
	if (!worksheet) return null;
	return worksheet.getSelection().getActiveRange();
}

/**
 * Dispatch a formatting command to the active Univer instance.
 * Returns true if the command was handled, false if no Univer is active.
 */
export function dispatchUniverCommand(
	command: UniverCommand,
	value?: string,
): boolean {
	const range = getActiveRange();
	if (!range) return false;

	switch (command) {
		// ── Font formatting ──
		case "bold":
			range.setFontWeight("bold");
			return true;
		case "italic":
			range.setFontStyle("italic");
			return true;
		case "underline":
			range.setFontLine("underline");
			return true;
		case "strikethrough":
			range.setFontLine("line-through");
			return true;
		case "increaseFontSize": {
			const incSize = Number.parseInt(value ?? "14", 10);
			range.setFontSize(incSize);
			return true;
		}
		case "decreaseFontSize": {
			const decSize = Number.parseInt(value ?? "10", 10);
			range.setFontSize(decSize);
			return true;
		}
		case "fontFamily": {
			if (value) {
				range.setFontName(value);
			}
			return true;
		}
		case "textColor": {
			if (value) {
				range.setFontColor(value);
			}
			return true;
		}
		case "fillColor": {
			if (value) {
				range.setBackgroundColor(value);
			}
			return true;
		}

		// ── Alignment ──
		case "alignLeft":
			range.setHorizontalAlignment("left");
			return true;
		case "alignCenter":
			range.setHorizontalAlignment("center");
			return true;
		case "alignRight":
			range.setHorizontalAlignment("right");
			return true;
		case "mergeCells":
			range.merge();
			return true;
		case "wrapText":
			range.setWrap(true);
			return true;

		// ── Number format ──
		case "numberFormatCurrency":
		case "currencyFormat":
			range.setNumberFormat("$#,##0.00");
			return true;
		case "numberFormatPercent":
		case "percentFormat":
			range.setNumberFormat("0.00%");
			return true;
		case "increaseDecimal":
			range.setNumberFormat("#,##0.0");
			return true;
		case "decreaseDecimal":
		case "decimalFormat":
			range.setNumberFormat("#,##0");
			return true;

		// ── Clear ──
		case "clearFormatting":
			range.clear();
			return true;

		// ── Data operations ──
		case "sort":
		case "sortAscending":
		case "sortDescending": {
			try {
				const api = activeAPI;
				const workbook = api?.getActiveWorkbook();
				const worksheet = workbook?.getActiveSheet();
				if (worksheet && typeof worksheet.sort === "function") {
					worksheet.sort({
						ascending: command !== "sortDescending",
					});
					return true;
				}
				console.warn("[UniverCommand] sort API not available on facade");
				return false;
			} catch {
				console.warn("[UniverCommand] sort threw an error");
				return false;
			}
		}
		case "filter": {
			try {
				const api = activeAPI;
				const workbook = api?.getActiveWorkbook();
				const worksheet = workbook?.getActiveSheet();
				if (worksheet && typeof worksheet.filter === "function") {
					worksheet.filter();
					return true;
				}
				console.warn("[UniverCommand] filter API not available on facade");
				return false;
			} catch {
				console.warn("[UniverCommand] filter threw an error");
				return false;
			}
		}
		case "sum": {
			// Auto-sum: detect the range above or to the left of the active cell
			try {
				const row = range.getRow();
				const col = range.getColumn();
				// Default: sum the column above (rows 0..row-1 in same column)
				const startRow = 0;
				const endRow = row - 1;
				if (endRow >= startRow) {
					const colLetter = String.fromCharCode(65 + col);
					const formula = `=SUM(${colLetter}${startRow + 1}:${colLetter}${endRow + 1})`;
					range.setFormula(formula);
					return true;
				}
				console.warn("[UniverCommand] sum: no range above active cell");
				return false;
			} catch {
				console.warn("[UniverCommand] sum threw an error");
				return false;
			}
		}
		case "insertCells": {
			try {
				const api = activeAPI;
				const workbook = api?.getActiveWorkbook();
				const worksheet = workbook?.getActiveSheet();
				if (worksheet && typeof worksheet.insertCells === "function") {
					worksheet.insertCells(value as "right" | "down" | undefined);
					return true;
				}
				console.warn("[UniverCommand] insertCells API not available on facade");
				return false;
			} catch {
				console.warn("[UniverCommand] insertCells threw an error");
				return false;
			}
		}
		case "deleteCells": {
			try {
				const api = activeAPI;
				const workbook = api?.getActiveWorkbook();
				const worksheet = workbook?.getActiveSheet();
				if (worksheet && typeof worksheet.deleteCells === "function") {
					worksheet.deleteCells(value as "left" | "up" | undefined);
					return true;
				}
				console.warn("[UniverCommand] deleteCells API not available on facade");
				return false;
			} catch {
				console.warn("[UniverCommand] deleteCells threw an error");
				return false;
			}
		}

		// ── Charts ──
		case "insertColumnChart":
		case "insertLineChart":
		case "insertPieChart":
		case "insertBarChart":
		case "insertAreaChart":
		case "insertScatterChart": {
			// Insert a chart by setting a formula that creates a chart from selection
			try {
				const api = activeAPI;
				const workbook = api?.getActiveWorkbook();
				const worksheet = workbook?.getActiveSheet();
				if (!worksheet) return false;
				const chartType = command.replace("insert", "").toLowerCase();
				// Use Univer's command API to insert a chart if available
				const univerApi = api as unknown as {
					executeCommand?: (id: string, params: unknown) => boolean;
				};
				if (typeof univerApi.executeCommand === "function") {
					univerApi.executeCommand("sheet.command.insertChart", {
						type: chartType,
						range: range.getCellRef(),
					});
					return true;
				}
				console.warn(`[UniverCommand] ${command}: chart API not available`);
				return false;
			} catch {
				console.warn(`[UniverCommand] ${command} threw an error`);
				return false;
			}
		}
		case "insertLineSparkline":
		case "insertColumnSparkline":
		case "insertWinLossSparkline": {
			// Sparklines: insert a formula-based sparkline
			try {
				const sparklineType =
					command === "insertLineSparkline"
						? "line"
						: command === "insertColumnSparkline"
							? "column"
							: "winloss";
				range.setFormula(
					`=SPARKLINE(${range.getCellRef()}, "${sparklineType}")`,
				);
				return true;
			} catch {
				console.warn(`[UniverCommand] ${command} threw an error`);
				return false;
			}
		}

		// ── Formula functions ──
		case "funcSum":
			range.setFormula("=SUM()");
			return true;
		case "funcAverage":
			range.setFormula("=AVERAGE()");
			return true;
		case "funcCount":
			range.setFormula("=COUNT()");
			return true;
		case "funcMin":
			range.setFormula("=MIN()");
			return true;
		case "funcMax":
			range.setFormula("=MAX()");
			return true;
		case "funcIf":
			range.setFormula("=IF()");
			return true;
		case "funcVLookup":
			range.setFormula("=VLOOKUP()");
			return true;

		// ── Page layout ──
		case "setMargins": {
			// Store page margins in the workbook metadata via Univer API
			try {
				const api = activeAPI as unknown as {
					executeCommand?: (id: string, params: unknown) => boolean;
				};
				if (typeof api.executeCommand === "function") {
					api.executeCommand("sheet.command.setPageMargins", {
						value: value ?? "normal",
					});
					return true;
				}
			} catch {
				/* page layout not available */
			}
			return false;
		}
		case "setOrientation": {
			try {
				const api = activeAPI as unknown as {
					executeCommand?: (id: string, params: unknown) => boolean;
				};
				if (typeof api.executeCommand === "function") {
					api.executeCommand("sheet.command.setPageOrientation", {
						value: value ?? "portrait",
					});
					return true;
				}
			} catch {
				/* page layout not available */
			}
			return false;
		}
		case "setPageSize": {
			try {
				const api = activeAPI as unknown as {
					executeCommand?: (id: string, params: unknown) => boolean;
				};
				if (typeof api.executeCommand === "function") {
					api.executeCommand("sheet.command.setPageSize", {
						value: value ?? "A4",
					});
					return true;
				}
			} catch {
				/* page layout not available */
			}
			return false;
		}

		// ── Arrange (not applicable to spreadsheet cells; return false) ──
		case "bringForward":
		case "sendBackward":
		case "bringToFront":
		case "sendToBack":
		case "alignObjects":
		case "groupObjects":
		case "ungroupObjects":
			// These commands apply to floating objects/shapes, not spreadsheet cells.
			// They are listed in the ribbon for UI consistency but have no effect
			// on a cell-based grid.
			return false;

		// ── Find / Replace ──
		case "find":
		case "replace": {
			// Use Univer's built-in find/replace if available
			try {
				const api = activeAPI;
				const workbook = api?.getActiveWorkbook();
				const worksheet = workbook?.getActiveSheet();
				if (
					worksheet &&
					typeof (worksheet as unknown as { find?: () => void }).find ===
						"function"
				) {
					(worksheet as unknown as { find: () => void }).find();
					return true;
				}
				console.warn(`[UniverCommand] ${command} not available on facade`);
				return false;
			} catch {
				console.warn(`[UniverCommand] ${command} threw an error`);
				return false;
			}
		}

		case "pivotTable": {
			if (!activeAPI) return false;
			return createPivotTable(activeAPI, {
				sourceRange: value ?? "A1:D20",
				targetSheetName: "PivotTable",
				fields: [],
			});
		}
		case "conditionalFormat": {
			if (range) {
				applyConditionalFormatting(
					range.getCellRef(),
					{ type: "greaterThan", value: 0, format: { bold: true } },
					range,
				);
			}
			return true;
		}
		case "removeConditionalFormat": {
			if (range) removeConditionalFormatting(range.getCellRef());
			return true;
		}
		case "dataValidation": {
			if (range) {
				applyDataValidation(
					range.getCellRef(),
					{ type: "list", listItems: [] },
					range,
				);
			}
			return true;
		}

		default:
			return false;
	}
}
