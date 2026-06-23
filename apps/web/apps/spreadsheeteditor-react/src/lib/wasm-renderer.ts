// WasmRenderer — canvas rendering bridge for wo-renderer-wasm (Spreadsheet)
//
// This module provides the integration surface that will eventually call
// into wo-renderer-wasm's render_page(). For now it draws a realistic
// spreadsheet preview (grid with cell outlines, column/row headers, and
// sample data) directly on an HTML5 Canvas.
//
// TODO: Connect to wo-renderer-wasm render_page() when WASM is bundled

/** Default spreadsheet dimensions in CSS pixels. */
const SHEET_WIDTH = 960;
const SHEET_HEIGHT = 640;

/** Grid geometry. */
const HEADER_HEIGHT = 24;
const HEADER_WIDTH = 36;
const CELL_HEIGHT = 22;
const CELL_WIDTH = 80;
const TOTAL_COLS = 12;
const TOTAL_ROWS = 27;

/** Canvas pixel density for crisp rendering. */
const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

interface RendererState {
	canvas: HTMLCanvasElement | null;
	ctx: CanvasRenderingContext2D | null;
}

const state: RendererState = {
	canvas: null,
	ctx: null,
};

/** Sample cell values for the preview grid. */
const SAMPLE_DATA: Record<string, string> = {
	"0,0": "Product",
	"0,1": "Q1",
	"0,2": "Q2",
	"0,3": "Q3",
	"0,4": "Q4",
	"0,5": "Total",
	"1,0": "Widget A",
	"1,1": "1,250",
	"1,2": "1,480",
	"1,3": "1,320",
	"1,4": "1,560",
	"1,5": "5,610",
	"2,0": "Widget B",
	"2,1": "890",
	"2,2": "1,020",
	"2,3": "960",
	"2,4": "1,150",
	"2,5": "4,020",
	"3,0": "Widget C",
	"3,1": "2,100",
	"3,2": "1,980",
	"3,3": "2,250",
	"3,4": "2,400",
	"3,5": "8,730",
	"4,0": "Total",
	"4,1": "4,240",
	"4,2": "4,480",
	"4,3": "4,530",
	"4,4": "5,110",
	"4,5": "18,360",
};

function drawSheet(): void {
	const { ctx } = state;
	if (!ctx) return;

	ctx.save();
	ctx.scale(DPR, DPR);
	ctx.clearRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);

	// Background
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);

	// Column header background
	ctx.fillStyle = "#f0f0f0";
	ctx.fillRect(HEADER_WIDTH, 0, TOTAL_COLS * CELL_WIDTH, HEADER_HEIGHT);

	// Row header background
	ctx.fillStyle = "#f0f0f0";
	ctx.fillRect(0, HEADER_HEIGHT, HEADER_WIDTH, TOTAL_ROWS * CELL_HEIGHT);

	// Top-left corner
	ctx.fillStyle = "#e0e0e0";
	ctx.fillRect(0, 0, HEADER_WIDTH, HEADER_HEIGHT);

	// Column headers (A, B, C, ...)
	ctx.fillStyle = "#333333";
	ctx.font = "10px 'Segoe UI', Arial, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	for (let c = 0; c < TOTAL_COLS; c++) {
		const label = String.fromCharCode(65 + c);
		ctx.fillText(
			label,
			HEADER_WIDTH + c * CELL_WIDTH + CELL_WIDTH / 2,
			HEADER_HEIGHT / 2,
		);
	}

	// Row headers (1, 2, 3, ...)
	for (let r = 0; r < TOTAL_ROWS; r++) {
		const label = String(r + 1);
		ctx.fillText(
			label,
			HEADER_WIDTH / 2,
			HEADER_HEIGHT + r * CELL_HEIGHT + CELL_HEIGHT / 2,
		);
	}

	// Sample data in cells
	ctx.textAlign = "left";
	ctx.font = "11px 'Segoe UI', Arial, sans-serif";
	for (const [key, value] of Object.entries(SAMPLE_DATA)) {
		const [rowStr, colStr] = key.split(",");
		const row = Number(rowStr);
		const col = Number(colStr);
		if (row >= TOTAL_ROWS || col >= TOTAL_COLS) continue;

		const isHeader = row === 0 || col === 0;
		const isTotal = row === 4 || col === 5;

		if (isHeader) {
			ctx.fillStyle = "#1a1a2e";
			ctx.font = "bold 11px 'Segoe UI', Arial, sans-serif";
		} else if (isTotal) {
			ctx.fillStyle = "#1a1a2e";
			ctx.font = "bold 11px 'Segoe UI', Arial, sans-serif";
		} else {
			ctx.fillStyle = "#333333";
			ctx.font = "11px 'Segoe UI', Arial, sans-serif";
		}

		const x = HEADER_WIDTH + col * CELL_WIDTH + 6;
		const y = HEADER_HEIGHT + row * CELL_HEIGHT + CELL_HEIGHT / 2;
		ctx.fillText(value, x, y);
	}

	// Grid lines — vertical
	ctx.strokeStyle = "#d4d4d4";
	ctx.lineWidth = 0.5;
	for (let c = 0; c <= TOTAL_COLS; c++) {
		const x = HEADER_WIDTH + c * CELL_WIDTH;
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, HEADER_HEIGHT + TOTAL_ROWS * CELL_HEIGHT);
		ctx.stroke();
	}

	// Grid lines — horizontal
	for (let r = 0; r <= TOTAL_ROWS; r++) {
		const y = HEADER_HEIGHT + r * CELL_HEIGHT;
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(HEADER_WIDTH + TOTAL_COLS * CELL_WIDTH, y);
		ctx.stroke();
	}

	// Header border (thicker)
	ctx.strokeStyle = "#b0b0b0";
	ctx.lineWidth = 1;
	ctx.strokeRect(
		0,
		0,
		HEADER_WIDTH + TOTAL_COLS * CELL_WIDTH,
		HEADER_HEIGHT + TOTAL_ROWS * CELL_HEIGHT,
	);

	// Active cell highlight (B2)
	ctx.strokeStyle = "#4285f4";
	ctx.lineWidth = 2;
	ctx.strokeRect(
		HEADER_WIDTH + 1 * CELL_WIDTH,
		HEADER_HEIGHT + 1 * CELL_HEIGHT,
		CELL_WIDTH,
		CELL_HEIGHT,
	);

	// Selection range highlight (B2:D4)
	ctx.fillStyle = "rgba(66, 133, 244, 0.08)";
	ctx.fillRect(
		HEADER_WIDTH + 1 * CELL_WIDTH,
		HEADER_HEIGHT + 1 * CELL_HEIGHT,
		4 * CELL_WIDTH,
		4 * CELL_HEIGHT,
	);

	ctx.restore();
}

/** Initialize the renderer with a canvas element. */
export function init(canvas: HTMLCanvasElement): void {
	state.canvas = canvas;
	state.ctx = canvas.getContext("2d", { alpha: false });

	if (state.ctx) {
		canvas.width = SHEET_WIDTH * DPR;
		canvas.height = SHEET_HEIGHT * DPR;
		canvas.style.width = `${SHEET_WIDTH}px`;
		canvas.style.height = `${SHEET_HEIGHT}px`;
	}
}

/** Render the spreadsheet grid with the given zoom level (1 = 100%). */
export function renderPage(_pageIndex: number, zoom: number): void {
	if (!state.canvas || !state.ctx) return;

	const scale = zoom / 100;
	state.canvas.style.width = `${SHEET_WIDTH * scale}px`;
	state.canvas.style.height = `${SHEET_HEIGHT * scale}px`;

	drawSheet();
}

/** Set total page count (for sheet count). */
export function setTotalPages(count: number): void {
	// Spreadsheets use sheets rather than pages — kept for API compatibility
	void count;
}

/** Get the total page count. */
export function getTotalPages(): number {
	return 1;
}
