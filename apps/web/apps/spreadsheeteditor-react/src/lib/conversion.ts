const CONVERSION_ENDPOINT = "/api/conversion/convert";

interface ConversionResponse {
	status: string;
	data?: string;
	format?: string;
	error?: string;
	duration_ms: number;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function base64ToBlob(b64: string, mimeType: string): Blob {
	const byteChars = atob(b64);
	const bytes = new Uint8Array(byteChars.length);
	for (let i = 0; i < byteChars.length; i++) {
		bytes[i] = byteChars.charCodeAt(i);
	}
	return new Blob([bytes], { type: mimeType });
}

export async function convertXlsxToWoSpreadsheet(
	data: ArrayBuffer,
): Promise<string> {
	if (data.byteLength === 0) {
		return JSON.stringify({
			version: 1,
			name: "Spreadsheet",
			sheetOrder: ["sheet1"],
			sheets: [],
			sharedStrings: [],
		});
	}
	const base64 = arrayBufferToBase64(data);
	const res = await fetch(CONVERSION_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			source_format: "xlsx",
			target_format: "wo-spreadsheet",
			data: base64,
		}),
	});
	if (!res.ok) {
		throw new Error(
			`Conversion request failed: ${res.status} ${res.statusText}`,
		);
	}
	const json: ConversionResponse = await res.json();
	if (!json.data) {
		throw new Error(
			`Conversion failed: ${json.status} — ${json.error ?? "unknown error"}`,
		);
	}
	const rawBytes = base64ToBlob(json.data, "application/json");
	return rawBytes.text();
}

/**
 * Convert an ODS (OpenDocument Spreadsheet) binary to WoSpreadsheet JSON.
 * Sends source_format: "ods" to the backend conversion API.
 */
export async function convertOdsToWoSpreadsheet(
	data: ArrayBuffer,
): Promise<string> {
	if (data.byteLength === 0) {
		return JSON.stringify({
			version: 1,
			name: "Spreadsheet",
			sheetOrder: ["sheet1"],
			sheets: [],
			sharedStrings: [],
		});
	}
	const base64 = arrayBufferToBase64(data);
	const res = await fetch(CONVERSION_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			source_format: "ods",
			target_format: "wo-spreadsheet",
			data: base64,
		}),
	});
	if (!res.ok) {
		throw new Error(
			`Conversion request failed: ${res.status} ${res.statusText}`,
		);
	}
	const json: ConversionResponse = await res.json();
	if (!json.data) {
		throw new Error(
			`Conversion failed: ${json.status} — ${json.error ?? "unknown error"}`,
		);
	}
	const rawBytes = base64ToBlob(json.data, "application/json");
	return rawBytes.text();
}

export async function convertWoSpreadsheetToXlsx(
	json: string,
): Promise<ArrayBuffer> {
	const res = await fetch(CONVERSION_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			source_format: "wo-spreadsheet",
			target_format: "xlsx",
			data: btoa(json),
		}),
	});
	if (!res.ok) {
		throw new Error(
			`Conversion request failed: ${res.status} ${res.statusText}`,
		);
	}
	const result: ConversionResponse = await res.json();
	if (!result.data) {
		throw new Error(
			`Conversion failed: ${result.status} — ${result.error ?? "unknown error"}`,
		);
	}
	return base64ToBlob(
		result.data,
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	).arrayBuffer();
}

/**
 * Convert WoSpreadsheet JSON → ODS (OpenDocument Spreadsheet) bytes.
 * Sends the JSON to the backend conversion API which uses WoSpreadsheetToOdsConverter.
 */
export async function convertWoSpreadsheetToOds(
	json: string,
): Promise<ArrayBuffer> {
	const res = await fetch(CONVERSION_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			source_format: "wo-spreadsheet",
			target_format: "ods",
			data: btoa(json),
		}),
	});
	if (!res.ok) {
		throw new Error(
			`Conversion request failed: ${res.status} ${res.statusText}`,
		);
	}
	const result: ConversionResponse = await res.json();
	if (!result.data) {
		throw new Error(
			`Conversion failed: ${result.status} — ${result.error ?? "unknown error"}`,
		);
	}
	return base64ToBlob(
		result.data,
		"application/vnd.oasis.opendocument.spreadsheet",
	).arrayBuffer();
}

// ── Univer snapshot → WoSpreadsheet conversion ─────────────────────────

/**
 * Univer cell value type enum (mirrors @univerjs/core CellValueType).
 */
const CellValueType = {
	STRING: 1,
	NUMBER: 2,
	BOOLEAN: 3,
	FORCE_STRING: 4,
} as const;

/**
 * Univer ICellData (subset relevant for conversion).
 */
interface UniverCellData {
	v?: string | number | boolean | null;
	t?: number | null;
	f?: string | null;
	s?: unknown;
	p?: unknown;
}

/**
 * Univer IWorksheetData (subset).
 */
interface UniverWorksheetData {
	id: string;
	name: string;
	rowCount?: number;
	columnCount?: number;
	cellData?: Record<number, Record<number, UniverCellData>>;
	mergeData?: Array<{
		startRow: number;
		startColumn: number;
		endRow: number;
		endColumn: number;
	}>;
}

/**
 * Univer IWorkbookData (subset).
 */
interface UniverWorkbookSnapshot {
	id?: string;
	name?: string;
	sheetOrder?: string[];
	sheets?: Record<string, Partial<UniverWorksheetData>>;
	styles?: Record<string, unknown>;
}

/**
 * WoSpreadsheet structures (matching the Rust WoSpreadsheet format).
 */
interface WoCell {
	r: string;
	t: string;
	v: string;
	s?: number;
	f?: string;
}

interface WoRow {
	r: number;
	cells: WoCell[];
}

interface WoSheet {
	id: string;
	name: string;
	rowCount: number;
	columnCount: number;
	rows: WoRow[];
	merges: string[];
}

interface WoSpreadsheet {
	version: number;
	name: string;
	sheetOrder: string[];
	sheets: WoSheet[];
	sharedStrings: string[];
}

/**
 * Convert a 0-based column index to an Excel-style column letter (A, B, ..., Z, AA, AB, ...).
 */
function colIndexToLetter(col: number): string {
	let result = "";
	let n = col;
	while (n >= 0) {
		result = String.fromCharCode(65 + (n % 26)) + result;
		n = Math.floor(n / 26) - 1;
	}
	return result;
}

/**
 * Convert 0-based row and column indices to an Excel-style cell reference (e.g., "A1").
 */
function toCellRef(row: number, col: number): string {
	return `${colIndexToLetter(col)}${row + 1}`;
}

/**
 * Convert a merge range from Univer's {startRow, startColumn, endRow, endColumn}
 * (endRow/endColumn are exclusive) to Excel-style "A1:B2" (inclusive).
 */
function mergeRangeToString(merge: {
	startRow: number;
	startColumn: number;
	endRow: number;
	endColumn: number;
}): string {
	const start = toCellRef(merge.startRow, merge.startColumn);
	const end = toCellRef(merge.endRow - 1, merge.endColumn - 1);
	return `${start}:${end}`;
}

/**
 * Map Univer CellValueType to WoSpreadsheet cell type string.
 */
function univerToWoCellType(t: number | null | undefined): string {
	switch (t) {
		case CellValueType.NUMBER:
			return "n";
		case CellValueType.BOOLEAN:
			return "b";
		case CellValueType.FORCE_STRING:
			return "str";
		default:
			return "s";
	}
}

/**
 * Convert a Univer workbook snapshot (IWorkbookData) to WoSpreadsheet JSON.
 *
 * This bridges the gap between Univer's internal cellData format
 * ({ [row]: { [col]: { v, t, f } } }) and the backend's WoSpreadsheet
 * format (rows with cell references like "A1").
 *
 * The resulting JSON is accepted by convertWoSpreadsheetToXlsx().
 */
export function univerSnapshotToWoSpreadsheet(snapshot: unknown): string {
	const wb = snapshot as UniverWorkbookSnapshot;
	if (!wb || !wb.sheets) {
		return JSON.stringify({
			version: 1,
			name: wb?.name ?? "Spreadsheet",
			sheetOrder: [],
			sheets: [],
			sharedStrings: [],
		} satisfies WoSpreadsheet);
	}

	const sheetOrder = wb.sheetOrder ?? Object.keys(wb.sheets);
	const sharedStrings: string[] = [];
	const ssIndex = new Map<string, number>();

	function getOrCreateSharedString(s: string): number {
		const existing = ssIndex.get(s);
		if (existing !== undefined) return existing;
		const idx = sharedStrings.length;
		sharedStrings.push(s);
		ssIndex.set(s, idx);
		return idx;
	}

	const sheets: WoSheet[] = sheetOrder
		.map((sheetId) => {
			const sheet = wb.sheets?.[sheetId];
			if (!sheet) return null;

			const rows: WoRow[] = [];
			const cellData = sheet.cellData ?? {};
			let maxRow = 0;
			let maxCol = 0;

			for (const [rowKey, rowData] of Object.entries(cellData)) {
				const rowIdx = Number.parseInt(rowKey, 10);
				if (Number.isNaN(rowIdx)) continue;
				maxRow = Math.max(maxRow, rowIdx);

				const cells: WoCell[] = [];
				for (const [colKey, cell] of Object.entries(rowData ?? {})) {
					const colIdx = Number.parseInt(colKey, 10);
					if (Number.isNaN(colIdx)) continue;
					maxCol = Math.max(maxCol, colIdx);

					if (!cell) continue;
					const cellType = univerToWoCellType(cell.t);
					const cellValue =
						cell.v !== undefined && cell.v !== null ? String(cell.v) : "";

					// For string cells, store the shared string index
					let v = cellValue;
					if (cellType === "s" && cellValue) {
						v = String(getOrCreateSharedString(cellValue));
					}

					const woCell: WoCell = {
						r: toCellRef(rowIdx, colIdx),
						t: cellType,
						v,
					};
					if (cell.f) {
						woCell.f = cell.f;
					}
					cells.push(woCell);
				}
				if (cells.length > 0) {
					rows.push({ r: rowIdx + 1, cells });
				}
			}

			const merges = (sheet.mergeData ?? []).map(mergeRangeToString);

			return {
				id: sheet.id ?? sheetId,
				name: sheet.name ?? sheetId,
				rowCount: Math.max(sheet.rowCount ?? 0, maxRow + 1, 1),
				columnCount: Math.max(sheet.columnCount ?? 0, maxCol + 1, 1),
				rows,
				merges,
			} satisfies WoSheet;
		})
		.filter((s): s is WoSheet => s !== null);

	return JSON.stringify(
		{
			version: 1,
			name: wb.name ?? "Spreadsheet",
			sheetOrder: sheetOrder,
			sheets,
			sharedStrings: sharedStrings,
		} satisfies WoSpreadsheet,
		null,
		2,
	);
}

// ── CSV export ─────────────────────────────────────────────────────────

/**
 * Convert a Univer workbook snapshot or WoSpreadsheet JSON to CSV text.
 * Extracts cell values from the first sheet's cell data.
 *
 * Handles both formats:
 * - Univer IWorkbookData: sheets is a Record<string, IWorksheetData>
 * - WoSpreadsheet: sheets is an array of WoSheet with rows/cells
 */
export function convertWoSpreadsheetToCsv(json: string): string {
	try {
		const snapshot = JSON.parse(json) as Record<string, unknown>;

		// Try Univer IWorkbookData format first (sheets as Record)
		if (
			snapshot.sheets &&
			typeof snapshot.sheets === "object" &&
			!Array.isArray(snapshot.sheets)
		) {
			return univerSnapshotToCsv(snapshot as unknown as UniverWorkbookSnapshot);
		}

		// Try WoSpreadsheet format (sheets as array with rows/cells)
		if (snapshot.sheets && Array.isArray(snapshot.sheets)) {
			return woSpreadsheetToCsv(snapshot as unknown as WoSpreadsheet);
		}

		return "";
	} catch (err) {
		console.error("CSV conversion failed:", err);
		return "";
	}
}

/**
 * Convert a Univer IWorkbookData snapshot to CSV (first sheet only).
 */
function univerSnapshotToCsv(wb: UniverWorkbookSnapshot): string {
	if (!wb.sheets) return "";
	const sheetOrder = wb.sheetOrder ?? Object.keys(wb.sheets);
	const firstSheetId = sheetOrder[0];
	const sheet = wb.sheets[firstSheetId];
	if (!sheet?.cellData) return "";

	const cellData = sheet.cellData;
	const rows = new Map<number, Map<number, string>>();
	let maxRow = 0;
	let maxCol = 0;

	for (const [rowKey, rowData] of Object.entries(cellData)) {
		const row = Number.parseInt(rowKey, 10);
		if (Number.isNaN(row)) continue;
		maxRow = Math.max(maxRow, row);
		for (const [colKey, cell] of Object.entries(rowData ?? {})) {
			const col = Number.parseInt(colKey, 10);
			if (Number.isNaN(col)) continue;
			maxCol = Math.max(maxCol, col);
			const val = cell?.v;
			if (val !== undefined && val !== null) {
				if (!rows.has(row)) rows.set(row, new Map());
				rows.get(row)?.set(col, String(val));
			}
		}
	}

	return rowsToCsv(rows, maxRow, maxCol);
}

/**
 * Convert a WoSpreadsheet (array format) to CSV (first sheet only).
 */
function woSpreadsheetToCsv(wo: WoSpreadsheet): string {
	if (wo.sheets.length === 0) return "";
	const sheet = wo.sheets[0];
	const rows = new Map<number, Map<number, string>>();
	let maxRow = 0;
	let maxCol = 0;

	for (const row of sheet.rows) {
		const rowIdx = row.r - 1; // WoSpreadsheet rows are 1-based
		maxRow = Math.max(maxRow, rowIdx);
		for (const cell of row.cells) {
			// Parse cell reference "A1" → col 0, row 0
			const match = cell.r.match(/^([A-Z]+)(\d+)$/);
			if (!match) continue;
			const colStr = match[1];
			const rowIdxFromRef = Number.parseInt(match[2], 10) - 1;
			let col = 0;
			for (let i = 0; i < colStr.length; i++) {
				col = col * 26 + colStr.charCodeAt(i) - 64;
			}
			col -= 1;
			maxCol = Math.max(maxCol, col);
			if (cell.v) {
				if (!rows.has(rowIdxFromRef)) rows.set(rowIdxFromRef, new Map());
				// For shared string cells, the value is the index; we want the actual string
				const val =
					cell.t === "s" && wo.sharedStrings
						? (wo.sharedStrings[Number.parseInt(cell.v, 10)] ?? cell.v)
						: cell.v;
				rows.get(rowIdxFromRef)?.set(col, val);
			}
		}
	}

	return rowsToCsv(rows, maxRow, maxCol);
}

/**
 * Build CSV text from a row/col map.
 */
function rowsToCsv(
	rows: Map<number, Map<number, string>>,
	maxRow: number,
	maxCol: number,
): string {
	const lines: string[] = [];
	for (let r = 0; r <= maxRow; r++) {
		const cells = rows.get(r);
		const cols: string[] = [];
		for (let c = 0; c <= maxCol; c++) {
			const val = cells?.get(c) ?? "";
			// CSV escaping: wrap in quotes if contains comma, quote, or newline
			if (val.includes(",") || val.includes('"') || val.includes("\n")) {
				cols.push(`"${val.replace(/"/g, '""')}"`);
			} else {
				cols.push(val);
			}
		}
		lines.push(cols.join(","));
	}
	return lines.join("\n");
}
