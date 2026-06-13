import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { presentationStore } from "../../stores/PresentationStore";
import type {
	ChartData,
	ConnectorData,
	GradientFill,
	ShadowEffect,
	ShapeData,
	TableData,
} from "../../types/presentation";

const CHART_COLORS = [
	"#4472C4",
	"#ED7D31",
	"#A5A5A5",
	"#FFC000",
	"#5B9BD5",
	"#70AD47",
	"#264478",
	"#9B57A0",
];

function renderChartSvg(
	chart: ChartData,
	width: number,
	height: number,
): JSX.Element[] {
	const elements: JSX.Element[] = [];
	const pad = { top: 20, right: 20, bottom: 40, left: 50 };
	const chartW = width - pad.left - pad.right;
	const chartH = height - pad.top - pad.bottom;

	if (chart.title) {
		elements.push(
			<text
				key="cht"
				x={width / 2}
				y={16}
				textAnchor="middle"
				fontSize={14}
				fontWeight="bold"
				fill="#333"
			>
				{chart.title}
			</text>,
		);
	}

	const allValues = chart.series.flatMap((s) => s.values);
	const maxVal = Math.max(...allValues, 1);
	const minVal = Math.min(...allValues, 0);

	if (chart.type === "column" || chart.type === "bar") {
		const isBar = chart.type === "bar";
		const groupCount = chart.labels.length;
		const seriesCount = chart.series.length;
		const totalGap = 4;
		const itemSize = isBar
			? Math.max(8, (chartH - groupCount * totalGap) / groupCount / seriesCount)
			: Math.max(
					8,
					(chartW - groupCount * totalGap) / groupCount / seriesCount,
				);

		chart.labels.forEach((label, li) => {
			chart.series.forEach((series, si) => {
				const val = series.values[li] || 0;
				const color = series.color || CHART_COLORS[si % CHART_COLORS.length];
				const frac = (val - minVal) / (maxVal - minVal);
				if (isBar) {
					const barH = Math.max(2, itemSize - 1);
					const barW = Math.max(1, frac * chartW);
					const y = pad.top + li * seriesCount * itemSize + si * itemSize;
					elements.push(
						<rect
							key={`bar-${label}-${series.name}`}
							x={pad.left}
							y={y}
							width={barW}
							height={barH}
							fill={color}
							rx={1}
						/>,
					);
					if (si === 0) {
						elements.push(
							<text
								key={`lb-${label}`}
								x={pad.left - 4}
								y={y + barH / 2 + 4}
								textAnchor="end"
								fontSize={10}
								fill="#666"
							>
								{label}
							</text>,
						);
					}
				} else {
					const barW = Math.max(2, itemSize - 1);
					const barH = Math.max(1, frac * chartH);
					const x = pad.left + li * seriesCount * itemSize + si * itemSize;
					const y = pad.top + chartH - barH;
					elements.push(
						<rect
							key={`col-${label}-${series.name}`}
							x={x}
							y={y}
							width={barW}
							height={barH}
							fill={color}
							rx={1}
						/>,
					);
					if (si === 0) {
						elements.push(
							<text
								key={`lb-${label}`}
								x={x + barW / 2}
								y={pad.top + chartH + 14}
								textAnchor="middle"
								fontSize={10}
								fill="#666"
							>
								{label}
							</text>,
						);
					}
				}
			});
		});
	}

	if (chart.type === "line") {
		const pointCount = chart.labels.length;
		chart.series.forEach((series, si) => {
			const pts = series.values.map((val, vi) => ({
				x: pad.left + (vi / Math.max(pointCount - 1, 1)) * chartW,
				y: pad.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH,
			}));
			const color = series.color || CHART_COLORS[si % CHART_COLORS.length];
			const d = pts
				.map((p, pi) => `${pi === 0 ? "M" : "L"}${p.x},${p.y}`)
				.join(" ");
			elements.push(
				<path
					key={`line-${series.name}`}
					d={d}
					stroke={color}
					strokeWidth={2}
					fill="none"
				/>,
			);
			pts.forEach((p, pi) => {
				elements.push(
					<circle
						key={`pt-${series.name}-${chart.labels[pi]}`}
						cx={p.x}
						cy={p.y}
						r={3}
						fill={color}
					/>,
				);
			});
		});
		chart.labels.forEach((label, li) => {
			const x = pad.left + (li / Math.max(pointCount - 1, 1)) * chartW;
			elements.push(
				<text
					key={`lb-${label}`}
					x={x}
					y={pad.top + chartH + 14}
					textAnchor="middle"
					fontSize={10}
					fill="#666"
				>
					{label}
				</text>,
			);
		});
	}

	if (chart.type === "pie" || chart.type === "doughnut") {
		const cx = width / 2;
		const cy = height / 2 + 8;
		const radius = Math.min(chartW, chartH) / 2 - 4;
		const total =
			chart.series.reduce(
				(sum, s) => sum + s.values.reduce((a, b) => a + b, 0),
				0,
			) || 1;
		const holeR = chart.type === "doughnut" ? radius * 0.55 : 0;
		let currentAngle = -Math.PI / 2;
		chart.series.forEach((series, si) => {
			series.values.forEach((val, vi) => {
				if (val <= 0) return;
				const sliceAngle = (val / total) * Math.PI * 2;
				const color =
					series.color || CHART_COLORS[(si + vi) % CHART_COLORS.length];
				const startX = cx + radius * Math.cos(currentAngle);
				const startY = cy + radius * Math.sin(currentAngle);
				const endX = cx + radius * Math.cos(currentAngle + sliceAngle);
				const endY = cy + radius * Math.sin(currentAngle + sliceAngle);
				const largeArc = sliceAngle > Math.PI ? 1 : 0;
				const d = [
					`M${cx + holeR * Math.cos(currentAngle)},${cy + holeR * Math.sin(currentAngle)}`,
					`L${startX},${startY}`,
					`A${radius},${radius} 0 ${largeArc} 1 ${endX},${endY}`,
					`L${cx + holeR * Math.cos(currentAngle + sliceAngle)},${cy + holeR * Math.sin(currentAngle + sliceAngle)}`,
					`A${holeR},${holeR} 0 ${largeArc} 0 ${cx + holeR * Math.cos(currentAngle)},${cy + holeR * Math.sin(currentAngle)}`,
					"Z",
				].join(" ");
				elements.push(
					<path
						key={`pie-${series.name}-${chart.labels[vi]}`}
						d={d}
						fill={color}
						stroke="#fff"
						strokeWidth={1}
					/>,
				);
				if (sliceAngle > 0.3) {
					const labelAngle = currentAngle + sliceAngle / 2;
					const lr = radius * 0.7;
					elements.push(
						<text
							key={`pv-${series.name}-${chart.labels[vi]}`}
							x={cx + lr * Math.cos(labelAngle)}
							y={cy + lr * Math.sin(labelAngle)}
							textAnchor="middle"
							dominantBaseline="central"
							fontSize={11}
							fill="#fff"
							fontWeight="bold"
						>
							{Math.round((val / total) * 100)}%
						</text>,
					);
				}
				currentAngle += sliceAngle;
			});
		});
	}

	return elements;
}

function renderTableSvg(
	table: TableData,
	width: number,
	height: number,
): JSX.Element[] {
	const elements: JSX.Element[] = [];
	const numRows = Math.max(table.rows, 1);
	const numCols = Math.max(table.columns, 1);
	const colWidth = width / numCols;
	const rowHeight = height / numRows;
	const headerBg = "#4472C4";
	const headerFg = "#ffffff";
	for (let ri = 0; ri < numRows; ri++) {
		for (let ci = 0; ci < numCols; ci++) {
			const x = ci * colWidth;
			const y = ri * rowHeight;
			const cellText = table.cells?.[ri]?.cells?.[ci]?.text ?? "";
			const isHeader = table.headerRow && ri === 0;
			elements.push(
				<rect
					key={`tbg-${ri}-${ci}`}
					x={x}
					y={y}
					width={colWidth}
					height={rowHeight}
					fill={isHeader ? headerBg : "white"}
					stroke="#ccc"
					strokeWidth={0.5}
				/>,
			);
			elements.push(
				<text
					key={`ttxt-${ri}-${ci}`}
					x={x + colWidth / 2}
					y={y + rowHeight / 2}
					textAnchor="middle"
					dominantBaseline="central"
					fontSize={11}
					fill={isHeader ? headerFg : "#333"}
					fontWeight={isHeader ? "bold" : "normal"}
				>
					{cellText || (isHeader ? `Header ${ci + 1}` : "")}
				</text>,
			);
		}
	}
	return elements;
}

function renderConnectorSvg(
	connector: ConnectorData,
	width: number,
	height: number,
	stroke: string,
	strokeWidth: number,
): JSX.Element {
	const arrowSize = Math.max(8, strokeWidth * 4);
	const markerId = `pconn-arrow-${connector.connectorType}`;
	const markerEnd = connector.hasEndArrow ? `url(#${markerId})` : undefined;
	const markerStart = connector.hasStartArrow
		? `url(#${markerId}-start)`
		: undefined;

	let pathD: string;
	if (connector.connectorType === "straight") {
		pathD = `M${connector.startX},${connector.startY} L${connector.endX},${connector.endY}`;
	} else if (connector.connectorType === "bent") {
		const midX = (connector.startX + connector.endX) / 2;
		pathD = `M${connector.startX},${connector.startY} L${midX},${connector.startY} L${midX},${connector.endY} L${connector.endX},${connector.endY}`;
	} else {
		const cpx = (connector.startX + connector.endX) / 2;
		pathD = `M${connector.startX},${connector.startY} Q${cpx},${connector.startY} ${cpx},${(connector.startY + connector.endY) / 2} Q${cpx},${connector.endY} ${connector.endX},${connector.endY}`;
	}

	return (
		<svg
			key="conn-svg"
			width={width}
			height={height}
			style={{
				overflow: "visible",
				position: "absolute",
				top: 0,
				left: 0,
				pointerEvents: "none",
			}}
			role="img"
			aria-label="Connector"
		>
			<title>Connector</title>
			<defs>
				{connector.hasEndArrow && (
					<marker
						id={markerId}
						markerWidth={arrowSize}
						markerHeight={arrowSize}
						refX={arrowSize}
						refY={arrowSize / 2}
						orient="auto"
					>
						<path
							d={`M0,0 L${arrowSize},${arrowSize / 2} L0,${arrowSize}`}
							fill={stroke}
						/>
					</marker>
				)}
				{connector.hasStartArrow && (
					<marker
						id={`${markerId}-start`}
						markerWidth={arrowSize}
						markerHeight={arrowSize}
						refX={0}
						refY={arrowSize / 2}
						orient="auto"
					>
						<path
							d={`M${arrowSize},0 L0,${arrowSize / 2} L${arrowSize},${arrowSize}`}
							fill={stroke}
						/>
					</marker>
				)}
			</defs>
			<path
				d={pathD}
				stroke={stroke}
				strokeWidth={strokeWidth}
				fill="none"
				markerEnd={markerEnd}
				markerStart={markerStart}
			/>
		</svg>
	);
}

function renderGradientSvg(
	gradient: GradientFill,
	id: string,
): JSX.Element | null {
	if (!gradient.stops.length) return null;
	const gradId = `pgrad-${id}`;
	if (gradient.kind === "linear") {
		const angle = gradient.angle || 0;
		const rad = (angle * Math.PI) / 180;
		const x1 = 0.5 - 0.5 * Math.cos(rad + Math.PI);
		const y1 = 0.5 - 0.5 * Math.sin(rad + Math.PI);
		const x2 = 0.5 + 0.5 * Math.cos(rad + Math.PI);
		const y2 = 0.5 + 0.5 * Math.sin(rad + Math.PI);
		return (
			<linearGradient id={gradId} x1={x1} y1={y1} x2={x2} y2={y2}>
				{gradient.stops.map((s) => (
					<stop
						key={`stop-${s.position}-${s.color}`}
						offset={`${s.position * 100}%`}
						stopColor={s.color}
					/>
				))}
			</linearGradient>
		);
	}
	return (
		<radialGradient id={gradId}>
			{gradient.stops.map((s) => (
				<stop
					key={`stop-${s.position}-${s.color}`}
					offset={`${s.position * 100}%`}
					stopColor={s.color}
				/>
			))}
		</radialGradient>
	);
}

function shadowToFilter(shadow: ShadowEffect, id: string): JSX.Element {
	const filterId = `pshadow-${id}`;
	const blur = shadow.blurRadius > 0 ? Math.max(1, shadow.blurRadius / 100) : 2;
	return (
		<filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
			<feDropShadow
				dx={shadow.dx / 100}
				dy={shadow.dy / 100}
				stdDeviation={blur}
				floodColor={shadow.color || "#000"}
				floodOpacity={shadow.opacity || 0.5}
			/>
		</filter>
	);
}

function renderPresenterShape(
	shape: ShapeData,
	defs: JSX.Element[],
): JSX.Element | null {
	const hasGradient = !!shape.gradientFill?.stops?.length;
	const hasShadow = !!shape.shadow;

	if (hasGradient && shape.gradientFill) {
		const gradEl = renderGradientSvg(shape.gradientFill, shape.id);
		if (gradEl) defs.push(gradEl);
	}
	if (hasShadow && shape.shadow) {
		defs.push(shadowToFilter(shape.shadow, shape.id));
	}

	const wrapperStyle: React.CSSProperties = {
		position: "absolute",
		left: `${shape.x}px`,
		top: `${shape.y}px`,
		width: `${shape.width}px`,
		height: `${shape.height}px`,
		zIndex: shape.zIndex,
		transform: shape.rotation ? `rotate(${shape.rotation}deg)` : undefined,
		pointerEvents: "none",
	};

	const fillValue = hasGradient
		? `url(#pgrad-${shape.id})`
		: shape.fillColor || "transparent";
	const strokeColor = shape.strokeColor || "#333";
	const strokeW = shape.strokeWidth || 1;
	const filterVal = hasShadow ? `url(#pshadow-${shape.id})` : undefined;

	if (shape.chart) {
		const chartSvg = renderChartSvg(shape.chart, shape.width, shape.height);
		return (
			<div key={shape.id} style={wrapperStyle}>
				<svg
					width={shape.width}
					height={shape.height}
					role="img"
					aria-label="Chart"
				>
					<title>Chart</title>
					{chartSvg}
				</svg>
			</div>
		);
	}

	if (shape.table) {
		const tableSvg = renderTableSvg(shape.table, shape.width, shape.height);
		return (
			<div key={shape.id} style={wrapperStyle}>
				<svg
					width={shape.width}
					height={shape.height}
					role="img"
					aria-label="Table"
				>
					<title>Table</title>
					{tableSvg}
				</svg>
			</div>
		);
	}

	switch (shape.type) {
		case "rect":
			return (
				<div key={shape.id} style={wrapperStyle}>
					<svg
						width={shape.width}
						height={shape.height}
						role="img"
						aria-label="Rectangle"
					>
						<title>Rectangle</title>
						<rect
							x={0}
							y={0}
							width={shape.width}
							height={shape.height}
							fill={fillValue}
							stroke={strokeColor}
							strokeWidth={strokeW}
							filter={filterVal}
							rx={0}
						/>
						{shape.text && (
							<text
								x={shape.width / 2}
								y={shape.height / 2}
								textAnchor="middle"
								dominantBaseline="central"
								fill={shape.fontColor || "#333"}
								fontSize={shape.fontSize || 14}
							>
								{shape.text}
							</text>
						)}
					</svg>
				</div>
			);
		case "roundedRect":
			return (
				<div key={shape.id} style={wrapperStyle}>
					<svg
						width={shape.width}
						height={shape.height}
						role="img"
						aria-label="Rounded Rectangle"
					>
						<title>Rounded Rectangle</title>
						<rect
							x={0}
							y={0}
							width={shape.width}
							height={shape.height}
							fill={fillValue}
							stroke={strokeColor}
							strokeWidth={strokeW}
							filter={filterVal}
							rx={8}
						/>
						{shape.text && (
							<text
								x={shape.width / 2}
								y={shape.height / 2}
								textAnchor="middle"
								dominantBaseline="central"
								fill={shape.fontColor || "#333"}
								fontSize={shape.fontSize || 14}
							>
								{shape.text}
							</text>
						)}
					</svg>
				</div>
			);
		case "ellipse":
			return (
				<div key={shape.id} style={wrapperStyle}>
					<svg
						width={shape.width}
						height={shape.height}
						role="img"
						aria-label="Ellipse"
					>
						<title>Ellipse</title>
						<ellipse
							cx={shape.width / 2}
							cy={shape.height / 2}
							rx={shape.width / 2}
							ry={shape.height / 2}
							fill={fillValue}
							stroke={strokeColor}
							strokeWidth={strokeW}
							filter={filterVal}
						/>
						{shape.text && (
							<text
								x={shape.width / 2}
								y={shape.height / 2}
								textAnchor="middle"
								dominantBaseline="central"
								fill={shape.fontColor || "#333"}
								fontSize={shape.fontSize || 14}
							>
								{shape.text}
							</text>
						)}
					</svg>
				</div>
			);
		case "triangle":
			return (
				<div key={shape.id} style={wrapperStyle}>
					<svg
						width={shape.width}
						height={shape.height}
						role="img"
						aria-label="Triangle"
					>
						<title>Triangle</title>
						<polygon
							points={`${shape.width / 2},0 ${shape.width},${shape.height} 0,${shape.height}`}
							fill={fillValue}
							stroke={strokeColor}
							strokeWidth={strokeW}
							filter={filterVal}
						/>
						{shape.text && (
							<text
								x={shape.width / 2}
								y={shape.height / 2}
								textAnchor="middle"
								dominantBaseline="central"
								fill={shape.fontColor || "#333"}
								fontSize={shape.fontSize || 14}
							>
								{shape.text}
							</text>
						)}
					</svg>
				</div>
			);
		case "diamond":
			return (
				<div key={shape.id} style={wrapperStyle}>
					<svg
						width={shape.width}
						height={shape.height}
						role="img"
						aria-label="Diamond"
					>
						<title>Diamond</title>
						<polygon
							points={`${shape.width / 2},0 ${shape.width},${shape.height / 2} ${shape.width / 2},${shape.height} 0,${shape.height / 2}`}
							fill={fillValue}
							stroke={strokeColor}
							strokeWidth={strokeW}
							filter={filterVal}
						/>
						{shape.text && (
							<text
								x={shape.width / 2}
								y={shape.height / 2}
								textAnchor="middle"
								dominantBaseline="central"
								fill={shape.fontColor || "#333"}
								fontSize={shape.fontSize || 14}
							>
								{shape.text}
							</text>
						)}
					</svg>
				</div>
			);
		case "line":
			return (
				<div key={shape.id} style={wrapperStyle}>
					<svg
						width={shape.width}
						height={shape.height}
						role="img"
						aria-label="Line"
					>
						<title>Line</title>
						<line
							x1={0}
							y1={0}
							x2={shape.width}
							y2={shape.height}
							stroke={strokeColor}
							strokeWidth={strokeW || 2}
							filter={filterVal}
						/>
					</svg>
				</div>
			);
		case "arrow":
			return (
				<div key={shape.id} style={wrapperStyle}>
					<svg
						width={shape.width}
						height={shape.height}
						role="img"
						aria-label="Arrow"
					>
						<title>Arrow</title>
						<defs>
							<marker
								id={`parrow-${shape.id}`}
								markerWidth={10}
								markerHeight={10}
								refX={9}
								refY={3}
								orient="auto"
							>
								<path d="M0,0 L10,3 L0,6" fill={strokeColor} />
							</marker>
						</defs>
						<line
							x1={0}
							y1={shape.height / 2}
							x2={shape.width - 5}
							y2={shape.height / 2}
							stroke={strokeColor}
							strokeWidth={strokeW || 2}
							markerEnd={`url(#parrow-${shape.id})`}
						/>
					</svg>
				</div>
			);
		case "connector":
			if (shape.connector) {
				return (
					<div key={shape.id} style={wrapperStyle}>
						{renderConnectorSvg(
							shape.connector,
							shape.width,
							shape.height,
							strokeColor,
							strokeW || 2,
						)}
					</div>
				);
			}
			return null;
		case "textbox":
			return (
				<div
					key={shape.id}
					style={{
						...wrapperStyle,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						backgroundColor: shape.fillColor || "transparent",
					}}
				>
					<span
						style={{
							color: shape.fontColor || "#333",
							fontSize: shape.fontSize || 14,
							textAlign: "center",
							userSelect: "none",
						}}
					>
						{shape.text || "Text"}
					</span>
				</div>
			);
		default:
			return null;
	}
}

const ObservedSlidePresenter = observer(
	function ObservedSlidePresenter(): JSX.Element {
		const {
			isPresenting,
			slides,
			presentStep,
			endPresentation,
			nextSlide,
			prevSlide,
		} = presentationStore;

		const [elapsed, setElapsed] = useState(0);
		const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
		const containerRef = useRef<HTMLDivElement | null>(null);
		const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

		useEffect(() => {
			if (!isPresenting) return;
			setElapsed(0);
			timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
			return () => {
				if (timerRef.current) clearInterval(timerRef.current);
			};
		}, [isPresenting]);

		useEffect(() => {
			if (isPresenting && containerRef.current) {
				containerRef.current.focus();
			}
		}, [isPresenting]);

		if (!isPresenting) return <></>;

		const slide = slides[presentStep];
		if (!slide) {
			endPresentation();
			return <></>;
		}

		const nextSlideData =
			presentStep < slides.length - 1 ? slides[presentStep + 1] : null;
		const totalSec = elapsed;
		const minutes = Math.floor(totalSec / 60);
		const seconds = totalSec % 60;
		const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

		const handleKeyDown = (e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				endPresentation();
			} else if (
				e.key === "ArrowRight" ||
				e.key === "ArrowDown" ||
				e.key === "Enter" ||
				e.key === " "
			) {
				e.preventDefault();
				nextSlide();
			} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
				e.preventDefault();
				prevSlide();
			}
		};

		const handleWheel = (e: React.WheelEvent) => {
			if (wheelTimerRef.current) return;
			wheelTimerRef.current = setTimeout(() => {
				wheelTimerRef.current = null;
			}, 500);
			if (e.deltaY > 0) {
				nextSlide();
			} else {
				prevSlide();
			}
		};

		const svgDefs: JSX.Element[] = [];
		const shapeElements = slide.shapes?.map((shape) =>
			renderPresenterShape(shape, svgDefs),
		);

		return (
			<div
				className="prese-presenter-overlay"
				onKeyDown={handleKeyDown}
				onWheel={handleWheel}
				ref={containerRef}
			>
				<div className="prese-presenter-main">
					<div
						className="prese-presenter-slide"
						style={{
							position: "relative",
							overflow: "hidden",
							isolation: "isolate",
						}}
					>
						{/* Layout content in normal document flow */}
						<div style={{ position: "relative", zIndex: 0 }}>
							{slide.layout === "title" && (
								<div className="prese-presenter-slide-title">
									{slide.title || "Untitled Slide"}
								</div>
							)}

							{slide.layout === "content" && (
								<>
									<div className="prese-presenter-slide-title">
										{slide.title || "Untitled Slide"}
									</div>
									{(!slide.shapes || slide.shapes.length === 0) && (
										<div
											className="prese-presenter-slide-content"
											style={{ color: "#999", fontStyle: "italic" }}
										>
											No content
										</div>
									)}
								</>
							)}

							{slide.layout === "blank" && slide.title && (
								<div
									className="prese-presenter-slide-title"
									style={{
										fontSize: "1.5rem",
										color: "#999",
										fontStyle: "italic",
										marginBottom: 0,
									}}
								>
									{slide.title}
								</div>
							)}

							{slide.notes && (
								<div className="prese-presenter-notes-panel">
									<div className="prese-presenter-notes-label">
										Speaker Notes
									</div>
									<div className="prese-presenter-notes-text">
										{slide.notes}
									</div>
								</div>
							)}
						</div>

						{/* SVG defs for gradients and shadows */}
						<svg
							style={{
								position: "absolute",
								inset: 0,
								width: "100%",
								height: "100%",
								pointerEvents: "none",
								zIndex: 1,
							}}
							role="img"
							aria-label="Shape gradients and shadows"
						>
							<title>Shape gradients and shadows</title>
							<defs>{svgDefs}</defs>
						</svg>

						{/* Shapes overlaid absolutely over layout content */}
						<div
							style={{
								position: "absolute",
								inset: 0,
								pointerEvents: "none",
								zIndex: 2,
							}}
						>
							{shapeElements}
						</div>
					</div>
				</div>

				{nextSlideData && (
					<div className="prese-presenter-next">
						<div className="prese-presenter-next-label">Next</div>
						<div className="prese-presenter-next-slide">
							<div className="prese-presenter-next-title">
								{nextSlideData.title || "Untitled"}
							</div>
							{nextSlideData.notes && (
								<div className="prese-presenter-next-notes">
									{nextSlideData.notes}
								</div>
							)}
						</div>
					</div>
				)}

				<div className="prese-presenter-controls">
					<div className="prese-presenter-timer">{timeStr}</div>
					<button
						type="button"
						className="prese-presenter-btn"
						onClick={prevSlide}
						disabled={presentStep === 0}
					>
						◀ Previous
					</button>
					<span className="prese-presenter-counter">
						{presentStep + 1} / {slides.length}
					</span>
					<button
						type="button"
						className="prese-presenter-btn"
						onClick={nextSlide}
						disabled={presentStep >= slides.length - 1}
					>
						Next ▶
					</button>
					<button
						type="button"
						className="prese-presenter-btn prese-presenter-btn-esc"
						onClick={endPresentation}
					>
						✕ Exit (Esc)
					</button>
				</div>
			</div>
		);
	},
);

export const SlidePresenter = ObservedSlidePresenter;
