import { observer } from "mobx-react-lite";
import { type JSX, useEffect, useRef, useState } from "react";
import { presentationStore } from "../../stores/PresentationStore";
import type { ShapeType } from "../../types/presentation";

interface ShapeOption {
	type: ShapeType;
	label: string;
	icon: JSX.Element;
}

function generateId(): string {
	return `shape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function addShapeToCurrentSlide(type: ShapeType) {
	const slideIndex = presentationStore.currentSlide;
	const slide = presentationStore.slides[slideIndex];
	if (!slide) return;

	const existingShapes = slide.shapes?.length || 0;
	const x = 50 + existingShapes * 40;
	const y = 50 + existingShapes * 30;

	presentationStore.addShape(slideIndex, {
		id: generateId(),
		type,
		x,
		y,
		width: 120,
		height: 80,
		zIndex: existingShapes,
		fillColor: "#4472C4",
		strokeColor: "#2B5797",
		strokeWidth: 1.5,
		rotation: 0,
		text: undefined,
		fontSize: undefined,
		fontColor: undefined,
	});
}

const SHAPES: ShapeOption[] = [
	{
		type: "rect",
		label: "Rectangle",
		icon: (
			<svg width="32" height="32" viewBox="0 0 32 32">
				<rect
					x="4"
					y="8"
					width="24"
					height="16"
					fill="#4472C4"
					stroke="#2B5797"
					strokeWidth="1.5"
				/>
			</svg>
		),
	},
	{
		type: "roundedRect",
		label: "Rounded Rectangle",
		icon: (
			<svg width="32" height="32" viewBox="0 0 32 32">
				<rect
					x="4"
					y="8"
					width="24"
					height="16"
					rx="4"
					fill="#4472C4"
					stroke="#2B5797"
					strokeWidth="1.5"
				/>
			</svg>
		),
	},
	{
		type: "ellipse",
		label: "Ellipse",
		icon: (
			<svg width="32" height="32" viewBox="0 0 32 32">
				<ellipse
					cx="16"
					cy="16"
					rx="13"
					ry="9"
					fill="#4472C4"
					stroke="#2B5797"
					strokeWidth="1.5"
				/>
			</svg>
		),
	},
	{
		type: "triangle",
		label: "Triangle",
		icon: (
			<svg width="32" height="32" viewBox="0 0 32 32">
				<polygon
					points="16,5 29,27 3,27"
					fill="#4472C4"
					stroke="#2B5797"
					strokeWidth="1.5"
				/>
			</svg>
		),
	},
	{
		type: "diamond",
		label: "Diamond",
		icon: (
			<svg width="32" height="32" viewBox="0 0 32 32">
				<polygon
					points="16,4 28,16 16,28 4,16"
					fill="#4472C4"
					stroke="#2B5797"
					strokeWidth="1.5"
				/>
			</svg>
		),
	},
	{
		type: "line",
		label: "Line",
		icon: (
			<svg width="32" height="32" viewBox="0 0 32 32">
				<line x1="4" y1="16" x2="28" y2="16" stroke="#333" strokeWidth="2" />
			</svg>
		),
	},
	{
		type: "arrow",
		label: "Arrow",
		icon: (
			<svg width="32" height="32" viewBox="0 0 32 32">
				<defs>
					<marker
						id="sg-arr"
						markerWidth="8"
						markerHeight="8"
						refX="7"
						refY="4"
						orient="auto"
					>
						<path d="M0,0 L8,4 L0,8" fill="#333" />
					</marker>
				</defs>
				<line
					x1="4"
					y1="16"
					x2="24"
					y2="16"
					stroke="#333"
					strokeWidth="2"
					markerEnd="url(#sg-arr)"
				/>
			</svg>
		),
	},
	{
		type: "textbox",
		label: "Text Box",
		icon: (
			<svg width="32" height="32" viewBox="0 0 32 32">
				<rect
					x="4"
					y="8"
					width="24"
					height="16"
					fill="white"
					stroke="#333"
					strokeWidth="1.5"
					strokeDasharray="2"
				/>
				<text x="16" y="19" textAnchor="middle" fontSize="10" fill="#333">
					T
				</text>
			</svg>
		),
	},
];

const ObservedShapesGallery = observer(function ObservedShapesGallery() {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		if (open) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open]);

	const handleSelect = (type: ShapeType) => {
		addShapeToCurrentSlide(type);
		setOpen(false);
	};

	return (
		<div ref={ref} style={{ position: "relative", display: "inline-block" }}>
			<button
				type="button"
				className="prese-inserttab-btn"
				title="Shapes"
				onClick={() => setOpen(!open)}
			>
				Shapes
			</button>
			{open && (
				<div
					className="prese-shapes-gallery"
					style={{
						position: "absolute",
						top: "100%",
						left: 0,
						zIndex: 2000,
						background: "white",
						border: "1px solid #ccc",
						borderRadius: "4px",
						padding: "8px",
						display: "grid",
						gridTemplateColumns: "repeat(4, 1fr)",
						gap: "4px",
						boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
					}}
				>
					{SHAPES.map((s) => (
						<button
							key={s.type}
							type="button"
							title={s.label}
							onClick={() => handleSelect(s.type)}
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: 48,
								height: 48,
								border: "1px solid transparent",
								borderRadius: "4px",
								background: "none",
								cursor: "pointer",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = "#66afe9";
								e.currentTarget.style.backgroundColor = "#f0f0f0";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor = "transparent";
								e.currentTarget.style.backgroundColor = "transparent";
							}}
						>
							{s.icon}
						</button>
					))}
				</div>
			)}
		</div>
	);
});

export { ObservedShapesGallery as ShapesGallery };
