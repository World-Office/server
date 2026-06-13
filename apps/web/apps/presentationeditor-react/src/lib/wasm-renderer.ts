// WasmRenderer — canvas rendering bridge for wo-renderer-wasm (Presentation)
//
// This module provides the integration surface that will eventually call
// into wo-renderer-wasm's render_page(). For now it draws a realistic
// presentation preview (slide with title, bullet points, and decorative
// elements) directly on an HTML5 Canvas.
//
// TODO: Connect to wo-renderer-wasm render_page() when WASM is bundled

/** Slide dimensions in CSS pixels (16:9 aspect ratio). */
const SLIDE_WIDTH = 960;
const SLIDE_HEIGHT = 540;

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
	totalPages: 4,
};

const SLIDE_TITLES = [
	"World Office Presentation",
	"Key Features",
	"Architecture Overview",
	"Thank You",
];

const SLIDE_BULLETS: string[][] = [
	[
		"Welcome to World Office",
		"A modern document editing suite",
		"Built with Rust and TypeScript",
	],
	[
		"Real-time collaboration",
		"Multi-format support (DOCX, XLSX, PPTX, PDF)",
		"Canvas-based rendering via WASM",
		"Cross-platform desktop and web",
	],
	[
		"Rust core — format parsing, rendering, conversion",
		"React 19 frontend with MobX state management",
		"WOPI and WebDAV protocol support",
		"Tauri 2.0 desktop integration",
	],
	[
		"Questions?",
		"Contact: team@world-office.org",
		"Source: codeberg.org/World-Office/server",
	],
];

function drawSlide(pageIndex: number): void {
	const { ctx } = state;
	if (!ctx) return;

	const clampedPage = Math.max(0, Math.min(pageIndex, state.totalPages - 1));

	ctx.save();
	ctx.scale(DPR, DPR);
	ctx.clearRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);

	// Slide background — dark gradient
	const gradient = ctx.createLinearGradient(0, 0, 0, SLIDE_HEIGHT);
	gradient.addColorStop(0, "#1a1a2e");
	gradient.addColorStop(1, "#16213e");
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);

	// Accent bar at top
	ctx.fillStyle = "#4285f4";
	ctx.fillRect(0, 0, SLIDE_WIDTH, 4);

	// Decorative circle (bottom-right)
	ctx.beginPath();
	ctx.arc(SLIDE_WIDTH - 80, SLIDE_HEIGHT - 80, 120, 0, Math.PI * 2);
	ctx.fillStyle = "rgba(66, 133, 244, 0.1)";
	ctx.fill();

	// Title
	ctx.fillStyle = "#ffffff";
	ctx.font = "bold 32px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(SLIDE_TITLES[clampedPage] ?? `Slide ${clampedPage + 1}`, 60, 60);

	// Horizontal rule under title
	ctx.strokeStyle = "#4285f4";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(60, 110);
	ctx.lineTo(200, 110);
	ctx.stroke();

	// Bullet points
	const bullets = SLIDE_BULLETS[clampedPage] ?? [];
	ctx.font = "16px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
	ctx.fillStyle = "#cccccc";

	bullets.forEach((bullet, i) => {
		const y = 140 + i * 36;

		// Bullet dot
		ctx.beginPath();
		ctx.arc(72, y + 8, 4, 0, Math.PI * 2);
		ctx.fillStyle = "#4285f4";
		ctx.fill();

		// Bullet text
		ctx.fillStyle = "#cccccc";
		ctx.fillText(bullet, 88, y);
	});

	// Slide number at bottom-right
	ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
	ctx.font = "12px 'Segoe UI', Arial, sans-serif";
	ctx.textAlign = "right";
	ctx.fillText(
		`${clampedPage + 1} / ${state.totalPages}`,
		SLIDE_WIDTH - 30,
		SLIDE_HEIGHT - 20,
	);
	ctx.textAlign = "start";

	// Slide border
	ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
	ctx.lineWidth = 1;
	ctx.strokeRect(0.5, 0.5, SLIDE_WIDTH - 1, SLIDE_HEIGHT - 1);

	ctx.restore();
}

/** Initialize the renderer with a canvas element. */
export function init(canvas: HTMLCanvasElement): void {
	state.canvas = canvas;
	state.ctx = canvas.getContext("2d", { alpha: false });

	if (state.ctx) {
		canvas.width = SLIDE_WIDTH * DPR;
		canvas.height = SLIDE_HEIGHT * DPR;
		canvas.style.width = `${SLIDE_WIDTH}px`;
		canvas.style.height = `${SLIDE_HEIGHT}px`;
	}
}

/** Render a specific slide with the given zoom level (1 = 100%). */
export function renderPage(pageIndex: number, zoom: number): void {
	if (!state.canvas || !state.ctx) return;

	const clampedPage = Math.max(0, Math.min(pageIndex, state.totalPages - 1));
	const scale = zoom / 100;

	state.canvas.style.width = `${SLIDE_WIDTH * scale}px`;
	state.canvas.style.height = `${SLIDE_HEIGHT * scale}px`;

	drawSlide(clampedPage);
}

/** Set total slide count. */
export function setTotalPages(count: number): void {
	state.totalPages = Math.max(1, count);
}

/** Get the total slide count. */
export function getTotalPages(): number {
	return state.totalPages;
}
