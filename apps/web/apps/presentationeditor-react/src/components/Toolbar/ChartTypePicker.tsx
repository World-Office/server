import { observer } from "mobx-react-lite";
import { type JSX, useEffect, useRef, useState } from "react";
import { presentationStore } from "../../stores/PresentationStore";
import type { ChartType } from "../../types/presentation";

const chartTypes: { type: ChartType; label: string; icon: JSX.Element }[] = [
	{
		type: "bar",
		label: "Bar",
		icon: (
			<svg width="32" height="24" viewBox="0 0 32 24">
				<rect x="4" y="12" width="5" height="10" fill="#4472C4" rx="1" />
				<rect x="11" y="8" width="5" height="14" fill="#ED7D31" rx="1" />
				<rect x="18" y="5" width="5" height="17" fill="#A5A5A5" rx="1" />
				<rect x="25" y="10" width="5" height="12" fill="#FFC000" rx="1" />
			</svg>
		),
	},
	{
		type: "column",
		label: "Column",
		icon: (
			<svg width="32" height="24" viewBox="0 0 32 24">
				<rect x="3" y="10" width="5" height="12" fill="#4472C4" rx="1" />
				<rect x="10" y="6" width="5" height="16" fill="#ED7D31" rx="1" />
				<rect x="17" y="3" width="5" height="19" fill="#A5A5A5" rx="1" />
				<rect x="24" y="8" width="5" height="14" fill="#FFC000" rx="1" />
			</svg>
		),
	},
	{
		type: "line",
		label: "Line",
		icon: (
			<svg width="32" height="24" viewBox="0 0 32 24">
				<polyline
					points="3,18 10,12 17,6 24,10 29,15"
					fill="none"
					stroke="#4472C4"
					strokeWidth="2"
				/>
				<circle cx="3" cy="18" r="2" fill="#4472C4" />
				<circle cx="10" cy="12" r="2" fill="#4472C4" />
				<circle cx="17" cy="6" r="2" fill="#4472C4" />
				<circle cx="24" cy="10" r="2" fill="#4472C4" />
				<circle cx="29" cy="15" r="2" fill="#4472C4" />
			</svg>
		),
	},
	{
		type: "pie",
		label: "Pie",
		icon: (
			<svg width="32" height="24" viewBox="0 0 32 24">
				<circle cx="16" cy="12" r="10" fill="#E8E8E8" />
				<path d="M16,12 L16,2 A10,10 0 0,1 22.9,16.4 Z" fill="#4472C4" />
				<path d="M16,12 L22.9,16.4 A10,10 0 0,1 12.1,21.6 Z" fill="#ED7D31" />
				<path d="M16,12 L12.1,21.6 A10,10 0 0,1 7,14.2 Z" fill="#A5A5A5" />
			</svg>
		),
	},
	{
		type: "doughnut",
		label: "Doughnut",
		icon: (
			<svg width="32" height="24" viewBox="0 0 32 24">
				<circle cx="16" cy="12" r="10" fill="#E8E8E8" />
				<circle cx="16" cy="12" r="4" fill="white" />
			</svg>
		),
	},
];

function addChart(type: ChartType) {
	const slideIndex = presentationStore.currentSlide;
	const slide = presentationStore.slides[slideIndex];
	if (!slide) return;
	const existing = slide.shapes?.length || 0;

	const sampleData: Record<
		ChartType,
		{
			title: string;
			labels: string[];
			series: { name: string; values: number[] }[];
		}
	> = {
		bar: {
			title: "Sample Bar Chart",
			labels: ["Q1", "Q2", "Q3", "Q4"],
			series: [
				{ name: "Sales", values: [30, 45, 38, 52] },
				{ name: "Expenses", values: [22, 28, 25, 32] },
			],
		},
		column: {
			title: "Sample Column Chart",
			labels: ["Q1", "Q2", "Q3", "Q4"],
			series: [
				{ name: "Revenue", values: [50, 65, 58, 72] },
				{ name: "Cost", values: [35, 42, 38, 48] },
			],
		},
		line: {
			title: "Sample Line Chart",
			labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
			series: [{ name: "Trend", values: [15, 28, 22, 35, 30, 42] }],
		},
		pie: {
			title: "Sample Pie Chart",
			labels: ["Product A", "Product B", "Product C", "Product D"],
			series: [{ name: "Share", values: [35, 25, 20, 20] }],
		},
		doughnut: {
			title: "Sample Doughnut",
			labels: ["Segment A", "Segment B", "Segment C"],
			series: [{ name: "Distribution", values: [45, 30, 25] }],
		},
	};

	const data = sampleData[type];
	presentationStore.addShape(slideIndex, {
		id: `chart-${Date.now()}`,
		type: "rect",
		x: 80 + existing * 30,
		y: 60 + existing * 20,
		width: 400,
		height: 280,
		zIndex: existing,
		fillColor: "#f8f9fa",
		strokeColor: "#ccc",
		strokeWidth: 1,
		rotation: 0,
		chart: {
			type,
			title: data.title,
			labels: data.labels,
			series: data.series,
		},
	});
}

const ObservedChartTypePicker = observer(function ObservedChartTypePicker() {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handleClick = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	return (
		<div
			ref={ref}
			className="prese-chart-type-picker"
			style={{ position: "relative", display: "inline-block" }}
		>
			<button
				type="button"
				className="prese-inserttab-btn"
				title="Chart"
				onClick={() => setOpen(!open)}
			>
				Chart
			</button>
			{open && (
				<div
					style={{
						position: "absolute",
						top: "100%",
						left: 0,
						zIndex: 1000,
						background: "white",
						border: "1px solid #e0e0e0",
						borderRadius: "4px",
						boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
						padding: "8px",
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: "4px",
						minWidth: "180px",
					}}
				>
					{chartTypes.map((ct) => (
						<button
							key={ct.type}
							type="button"
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								padding: "8px 12px",
								border: "1px solid transparent",
								borderRadius: "4px",
								cursor: "pointer",
								background: "transparent",
							}}
							onClick={() => {
								addChart(ct.type);
								setOpen(false);
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = "#4472C4";
								e.currentTarget.style.background = "#f0f4fa";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor = "transparent";
								e.currentTarget.style.background = "transparent";
							}}
						>
							{ct.icon}
							<span style={{ fontSize: "11px", marginTop: "4px" }}>
								{ct.label}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
});

export { ObservedChartTypePicker as ChartTypePicker };
