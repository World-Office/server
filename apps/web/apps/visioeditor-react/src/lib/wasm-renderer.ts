// WasmRenderer — canvas rendering bridge for wo-renderer-wasm (Visio)
//
// This module provides the integration surface that will eventually call
// into wo-renderer-wasm's render_page(). For now it draws a realistic
// Visio-style diagram preview (canvas with shapes, connectors, and a
// flowchart layout) directly on an HTML5 Canvas.
//
// TODO: Connect to wo-renderer-wasm render_page() when WASM is bundled

/** Default drawing canvas dimensions in CSS pixels. */
const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 640;

/** Canvas pixel density for crisp rendering. */
const DPR =
	typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

interface RendererState {
	canvas: HTMLCanvasElement | null;
	ctx: CanvasRenderingContext2D | null;
	totalPages: number;
}

const state: RendererState = {
	canvas: null,
	ctx: null,
	totalPages: 1,
};

interface Shape {
	x: number;
	y: number;
	w: number;
	h: number;
	type: "rect" | "diamond" | "ellipse" | "rounded";
	label: string;
	color: string;
}

const SHAPES: Shape[] = [
	{
		x: 380,
		y: 30,
		w: 200,
		h: 50,
		type: "rounded",
		label: "Start",
		color: "#4285f4",
	},
	{
		x: 380,
		y: 120,
		w: 200,
		h: 50,
		type: "rect",
		label: "Process Data",
		color: "#34a853",
	},
	{
		x: 380,
		y: 210,
		w: 200,
		h: 60,
		type: "diamond",
		label: "Valid?",
		color: "#fbbc04",
	},
	{
		x: 140,
		y: 320,
		w: 200,
		h: 50,
		type: "rect",
		label: "Handle Error",
		color: "#ea4335",
	},
	{
		x: 620,
		y: 320,
		w: 200,
		h: 50,
		type: "rect",
		label: "Save Result",
		color: "#34a853",
	},
	{
		x: 380,
		y: 420,
		w: 200,
		h: 50,
		type: "ellipse",
		label: "End",
		color: "#4285f4",
	},
];

interface Connector {
	from: { x: number; y: number };
	to: { x: number; y: number };
	label?: string;
}

const CONNECTORS: Connector[] = [
	{ from: { x: 480, y: 80 }, to: { x: 480, y: 120 } },
	{ from: { x: 480, y: 170 }, to: { x: 480, y: 210 } },
	{ from: { x: 380, y: 240 }, to: { x: 240, y: 320 }, label: "No" },
	{ from: { x: 580, y: 240 }, to: { x: 720, y: 320 }, label: "Yes" },
	{ from: { x: 240, y: 370 }, to: { x: 380, y: 445 } },
	{ from: { x: 720, y: 370 }, to: { x: 580, y: 445 } },
];

function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.arcTo(x + w, y, x + w, y + r, r);
	ctx.lineTo(x + w, y + h - r);
	ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
	ctx.lineTo(x + r, y + h);
	ctx.arcTo(x, y + h, x, y + h - r, r);
	ctx.lineTo(x, y + r);
	ctx.arcTo(x, y, x + r, y, r);
	ctx.closePath();
}

function drawDiamond(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	w: number,
	h: number,
): void {
	ctx.beginPath();
	ctx.moveTo(cx, cy - h / 2);
	ctx.lineTo(cx + w / 2, cy);
	ctx.lineTo(cx, cy + h / 2);
	ctx.lineTo(cx - w / 2, cy);
	ctx.closePath();
}

function drawDiagram(): void {
	const { ctx } = state;
	if (!ctx) return;

	ctx.save();
	ctx.scale(DPR, DPR);
	ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	// Background — subtle grid pattern
	ctx.fillStyle = "#f8f9fa";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	// Grid dots
	ctx.fillStyle = "#e0e0e0";
	for (let gx = 0; gx < CANVAS_WIDTH; gx += 20) {
		for (let gy = 0; gy < CANVAS_HEIGHT; gy += 20) {
			ctx.fillRect(gx, gy, 1, 1);
		}
	}

	// Draw connectors first (behind shapes)
	ctx.strokeStyle = "#666666";
	ctx.lineWidth = 1.5;
	for (const conn of CONNECTORS) {
		ctx.beginPath();
		ctx.moveTo(conn.from.x, conn.from.y);
		ctx.lineTo(conn.to.x, conn.to.y);
		ctx.stroke();

		// Arrow head
		const angle = Math.atan2(conn.to.y - conn.from.y, conn.to.x - conn.from.x);
		const arrowLen = 8;
		ctx.beginPath();
		ctx.moveTo(conn.to.x, conn.to.y);
		ctx.lineTo(
			conn.to.x - arrowLen * Math.cos(angle - 0.4),
			conn.to.y - arrowLen * Math.sin(angle - 0.4),
		);
		ctx.moveTo(conn.to.x, conn.to.y);
		ctx.lineTo(
			conn.to.x - arrowLen * Math.cos(angle + 0.4),
			conn.to.y - arrowLen * Math.sin(angle + 0.4),
		);
		ctx.stroke();

		// Connector label
		if (conn.label) {
			const mx = (conn.from.x + conn.to.x) / 2;
			const my = (conn.from.y + conn.to.y) / 2;
			ctx.fillStyle = "#666666";
			ctx.font = "11px 'Segoe UI', Arial, sans-serif";
			ctx.textAlign = "center";
			ctx.fillText(conn.label, mx + (conn.label === "No" ? -16 : 16), my - 6);
			ctx.textAlign = "start";
		}
	}

	// Draw shapes
	for (const shape of SHAPES) {
		// Shadow
		ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
		switch (shape.type) {
			case "rect":
				ctx.fillRect(shape.x + 2, shape.y + 2, shape.w, shape.h);
				break;
			case "diamond":
				drawDiamond(
					ctx,
					shape.x + shape.w / 2 + 2,
					shape.y + shape.h / 2 + 2,
					shape.w,
					shape.h,
				);
				ctx.fill();
				break;
			case "ellipse":
				ctx.beginPath();
				ctx.ellipse(
					shape.x + shape.w / 2 + 2,
					shape.y + shape.h / 2 + 2,
					shape.w / 2,
					shape.h / 2,
					0,
					0,
					Math.PI * 2,
				);
				ctx.fill();
				break;
			case "rounded":
				drawRoundedRect(ctx, shape.x + 2, shape.y + 2, shape.w, shape.h, 8);
				ctx.fill();
				break;
		}

		// Shape fill
		ctx.fillStyle = shape.color;
		switch (shape.type) {
			case "rect":
				ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
				break;
			case "diamond":
				drawDiamond(
					ctx,
					shape.x + shape.w / 2,
					shape.y + shape.h / 2,
					shape.w,
					shape.h,
				);
				ctx.fill();
				break;
			case "ellipse":
				ctx.beginPath();
				ctx.ellipse(
					shape.x + shape.w / 2,
					shape.y + shape.h / 2,
					shape.w / 2,
					shape.h / 2,
					0,
					0,
					Math.PI * 2,
				);
				ctx.fill();
				break;
			case "rounded":
				drawRoundedRect(ctx, shape.x, shape.y, shape.w, shape.h, 8);
				ctx.fill();
				break;
		}

		// Shape border
		ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
		ctx.lineWidth = 1;
		switch (shape.type) {
			case "rect":
				ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
				break;
			case "diamond":
				drawDiamond(
					ctx,
					shape.x + shape.w / 2,
					shape.y + shape.h / 2,
					shape.w,
					shape.h,
				);
				ctx.stroke();
				break;
			case "ellipse":
				ctx.beginPath();
				ctx.ellipse(
					shape.x + shape.w / 2,
					shape.y + shape.h / 2,
					shape.w / 2,
					shape.h / 2,
					0,
					0,
					Math.PI * 2,
				);
				ctx.stroke();
				break;
			case "rounded":
				drawRoundedRect(ctx, shape.x, shape.y, shape.w, shape.h, 8);
				ctx.stroke();
				break;
		}

		// Label
		ctx.fillStyle = "#ffffff";
		ctx.font = "bold 13px 'Segoe UI', Arial, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(shape.label, shape.x + shape.w / 2, shape.y + shape.h / 2);
		ctx.textBaseline = "alphabetic";
		ctx.textAlign = "start";
	}

	// Page border
	ctx.strokeStyle = "#cccccc";
	ctx.lineWidth = 1;
	ctx.strokeRect(0.5, 0.5, CANVAS_WIDTH - 1, CANVAS_HEIGHT - 1);

	ctx.restore();
}

/** Initialize the renderer with a canvas element. */
export function init(canvas: HTMLCanvasElement): void {
	state.canvas = canvas;
	state.ctx = canvas.getContext("2d", { alpha: false });

	if (state.ctx) {
		canvas.width = CANVAS_WIDTH * DPR;
		canvas.height = CANVAS_HEIGHT * DPR;
		canvas.style.width = `${CANVAS_WIDTH}px`;
		canvas.style.height = `${CANVAS_HEIGHT}px`;
	}
}

/** Render the diagram with the given zoom level (1 = 100%). */
export function renderPage(_pageIndex: number, zoom: number): void {
	if (!state.canvas || !state.ctx) return;

	const scale = zoom / 100;
	state.canvas.style.width = `${CANVAS_WIDTH * scale}px`;
	state.canvas.style.height = `${CANVAS_HEIGHT * scale}px`;

	drawDiagram();
}

/** Set total page count. */
export function setTotalPages(count: number): void {
	state.totalPages = Math.max(1, count);
}

/** Get the total page count. */
export function getTotalPages(): number {
	return state.totalPages;
}
