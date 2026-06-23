import { observer } from "mobx-react-lite";
import { type JSX, useCallback, useMemo, useState } from "react";
import { flowchartStore } from "../../stores/FlowchartStore";
import { visioStore } from "../../stores/VisioStore";
import type { FlowchartShapeType } from "../../types/visio";
import styles from "./ShapePalette.module.css";

/* ── Shape metadata ── */

interface ShapeMeta {
	type: FlowchartShapeType;
	label: string;
	category: "flow" | "data" | "io" | "advanced";
	description: string;
}

const SHAPES: ShapeMeta[] = [
	/* Flow */
	{
		type: "start-end",
		label: "Start/End",
		category: "flow",
		description: "Terminator — start or end point",
	},
	{
		type: "process",
		label: "Process",
		category: "flow",
		description: "A process step or action",
	},
	{
		type: "decision",
		label: "Decision",
		category: "flow",
		description: "A conditional branch",
	},
	{
		type: "subprocess",
		label: "Subprocess",
		category: "flow",
		description: "A predefined sub-process",
	},
	{
		type: "connector",
		label: "Connector",
		category: "flow",
		description: "On-page connector / jump",
	},

	/* Data */
	{
		type: "data",
		label: "Data",
		category: "data",
		description: "Data I/O (parallelogram)",
	},
	{
		type: "stored-data",
		label: "Stored Data",
		category: "data",
		description: "Data stored on disk or database",
	},
	{
		type: "document",
		label: "Document",
		category: "data",
		description: "Printed or electronic document",
	},

	/* Input / Output */
	{
		type: "input-output",
		label: "Input/Output",
		category: "io",
		description: "General I/O operation",
	},
	{
		type: "manual-input",
		label: "Manual Input",
		category: "io",
		description: "Manual data entry",
	},
	{
		type: "display",
		label: "Display",
		category: "io",
		description: "Information display",
	},

	/* Advanced */
	{
		type: "predefined-process",
		label: "Predefined",
		category: "advanced",
		description: "Predefined process (subroutine)",
	},
	{
		type: "delay",
		label: "Delay",
		category: "advanced",
		description: "A waiting period or delay",
	},
	{
		type: "preparation",
		label: "Preparation",
		category: "advanced",
		description: "Setup or preparation step",
	},
	{
		type: "loop-limit",
		label: "Loop Limit",
		category: "advanced",
		description: "Loop boundary indicator",
	},
];

const CATEGORIES = [
	{ key: "flow" as const, label: "Flow", dotClass: styles.dotFlow },
	{ key: "data" as const, label: "Data", dotClass: styles.dotData },
	{ key: "io" as const, label: "Input / Output", dotClass: styles.dotIO },
	{ key: "advanced" as const, label: "Advanced", dotClass: styles.dotAdvanced },
];

/* ── SVG icon renderers ── */

function ShapeIcon({ type }: { type: FlowchartShapeType }): JSX.Element {
	const accent = "currentColor";
	const fill = "transparent";
	const sw = 1.5;

	switch (type) {
		/* ── start-end: pill / stadium shape ── */
		case "start-end":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<rect
						x="4"
						y="9"
						width="28"
						height="18"
						rx="9"
						ry="9"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── process: plain rectangle ── */
		case "process":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<rect
						x="4"
						y="8"
						width="28"
						height="20"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── decision: diamond ── */
		case "decision":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<polygon
						points="18,4 32,18 18,32 4,18"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── subprocess: rectangle with double side bars ── */
		case "subprocess":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<rect
						x="4"
						y="8"
						width="28"
						height="20"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
					<line x1="9" y1="8" x2="9" y2="28" stroke={accent} strokeWidth={sw} />
					<line
						x1="27"
						y1="8"
						x2="27"
						y2="28"
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── connector: circle ── */
		case "connector":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<circle
						cx="18"
						cy="18"
						r="11"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── data / input-output: parallelogram ── */
		case "data":
		case "input-output":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<polygon
						points="8,8 32,8 28,28 4,28"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── stored-data: cylinder (disk) ── */
		case "stored-data":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<ellipse
						cx="18"
						cy="9"
						rx="12"
						ry="4"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
					<path
						d="M6,9 L6,26 Q6,30 18,30 Q30,30 30,26 L30,9"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
					<ellipse
						cx="18"
						cy="26"
						rx="12"
						ry="4"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── document: rectangle with wavy bottom ── */
		case "document":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<path
						d="M6,6 L6,28 Q9,24 12,28 Q15,24 18,28 Q21,24 24,28 Q27,24 30,28 L30,6 Z"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── manual-input: trapezoid (slanted top) ── */
		case "manual-input":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<polygon
						points="6,26 30,26 26,10 10,10"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── display: rectangle with curved bottom (CRT shape) ── */
		case "display":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<path
						d="M6,8 L30,8 L30,22 Q30,28 18,28 Q6,28 6,22 Z"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── predefined-process: rectangle with double horizontal bars ── */
		case "predefined-process":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<rect
						x="4"
						y="8"
						width="28"
						height="20"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
					<line
						x1="6"
						y1="12"
						x2="30"
						y2="12"
						stroke={accent}
						strokeWidth={sw}
					/>
					<line
						x1="6"
						y1="24"
						x2="30"
						y2="24"
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── delay: half-oval / D-shape ── */
		case "delay":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<path
						d="M8,8 L8,28 Q22,28 22,18 Q22,8 8,8 Z"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── preparation: hexagon ── */
		case "preparation":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<polygon
						points="10,4 28,4 34,18 28,32 10,32 4,18"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		/* ── loop-limit: pentagon (home plate) ── */
		case "loop-limit":
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<polygon
						points="18,4 32,14 28,30 8,30 4,14"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
					/>
				</svg>
			);

		default:
			return (
				<svg className={styles.iconSvg} viewBox="0 0 36 36" aria-hidden="true">
					<rect
						x="6"
						y="8"
						width="24"
						height="20"
						fill={fill}
						stroke={accent}
						strokeWidth={sw}
						strokeDasharray="2 2"
					/>
				</svg>
			);
	}
}

/* ── Component ── */

function ShapePaletteInner(): JSX.Element {
	const [search, setSearch] = useState("");
	const [draggedType, setDraggedType] = useState<FlowchartShapeType | null>(
		null,
	);

	const filteredShapes = useMemo(() => {
		if (!search.trim()) return SHAPES;
		const q = search.toLowerCase().trim();
		return SHAPES.filter(
			(s) =>
				s.label.toLowerCase().includes(q) ||
				s.type.toLowerCase().includes(q) ||
				s.description.toLowerCase().includes(q),
		);
	}, [search]);

	const grouped = useMemo(() => {
		const map = new Map<string, ShapeMeta[]>();
		for (const cat of CATEGORIES) {
			const items = filteredShapes.filter((s) => s.category === cat.key);
			if (items.length > 0) map.set(cat.key, items);
		}
		return CATEGORIES.filter((c) => map.has(c.key)).map((c) => ({
			...c,
			// biome-ignore lint/style/noNonNullAssertion: guarded by filter above
			shapes: map.get(c.key)!,
		}));
	}, [filteredShapes]);

	/* ── Add at viewport center ── */
	const addAtCenter = useCallback((shapeType: FlowchartShapeType) => {
		const zoom = visioStore.zoomLevel / 100;
		const centerX =
			(window.innerWidth / 2 - flowchartStore.canvasOffset.x) / zoom;
		const centerY =
			(window.innerHeight / 2 - flowchartStore.canvasOffset.y) / zoom;
		flowchartStore.addNode(shapeType, centerX, centerY, undefined);
	}, []);

	/* ── Drag handlers ── */
	const handleDragStart = useCallback(
		(e: React.DragEvent, shapeType: FlowchartShapeType) => {
			e.dataTransfer.setData("application/x-world-office-shape", shapeType);
			e.dataTransfer.effectAllowed = "copy";
			setDraggedType(shapeType);
		},
		[],
	);

	const handleDragEnd = useCallback(() => {
		setDraggedType(null);
	}, []);

	const handleClick = useCallback(
		(shapeType: FlowchartShapeType) => {
			addAtCenter(shapeType);
		},
		[addAtCenter],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent, shapeType: FlowchartShapeType) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				addAtCenter(shapeType);
			}
		},
		[addAtCenter],
	);

	return (
		<div className={styles.palette}>
			{/* Search */}
			<div className={styles.searchWrapper}>
				<input
					className={styles.searchInput}
					type="text"
					placeholder="Search shapes…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					aria-label="Search shapes"
				/>
			</div>

			{/* Shape grid */}
			<div className={styles.scrollArea}>
				{grouped.length === 0 ? (
					<div className={styles.emptyState}>
						<div className={styles.emptyIcon}>🔍</div>
						<span>No shapes match &quot;{search}&quot;</span>
					</div>
				) : (
					grouped.map((cat) => (
						<div key={cat.key} className={styles.category}>
							<div className={styles.categoryHeader}>
								<span className={`${styles.categoryDot} ${cat.dotClass}`} />
								{cat.label}
							</div>
							<div className={styles.grid}>
								{cat.shapes.map((shape) => (
									<button
										key={shape.type}
										type="button"
										className={`${styles.shapeItem} ${draggedType === shape.type ? styles.dragging : ""}`}
										onClick={() => handleClick(shape.type)}
										onKeyDown={(e) => handleKeyDown(e, shape.type)}
										onDragStart={(e) => handleDragStart(e, shape.type)}
										onDragEnd={handleDragEnd}
										draggable
										aria-label={`Add ${shape.label} shape`}
										title={shape.description}
									>
										<span className={styles.tooltip}>{shape.label}</span>
										<ShapeIcon type={shape.type} />
										<span className={styles.shapeLabel}>{shape.label}</span>
									</button>
								))}
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
}

export const ShapePalette = observer(ShapePaletteInner);
