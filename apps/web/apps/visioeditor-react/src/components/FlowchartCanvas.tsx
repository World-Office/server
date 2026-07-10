import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flowchartStore } from "../stores/FlowchartStore";
import type {
	FlowchartDocument,
	FlowchartEdge,
	FlowchartNode,
} from "../types/visio";
import { ContextMenu, type ContextMenuState } from "./ContextMenu";
import styles from "./FlowchartCanvas.module.css";
import { MiniMap } from "./MiniMap";
import { PropertiesPanel } from "./PropertiesPanel";

interface Point {
	x: number;
	y: number;
}

function getNodeCenter(node: FlowchartNode): Point {
	return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function getEdgeEndpoint(
	node: FlowchartNode,
	anchor: string | undefined,
): Point {
	if (anchor === "top") return { x: node.x + node.width / 2, y: node.y };
	if (anchor === "bottom")
		return { x: node.x + node.width / 2, y: node.y + node.height };
	if (anchor === "left") return { x: node.x, y: node.y + node.height / 2 };
	if (anchor === "right")
		return { x: node.x + node.width, y: node.y + node.height / 2 };
	return getNodeCenter(node);
}

function orthogonalPath(src: Point, tgt: Point): string {
	const dx = tgt.x - src.x;
	const dy = tgt.y - src.y;
	const adx = Math.abs(dx);
	const ady = Math.abs(dy);
	if (adx >= ady) {
		const midX = (src.x + tgt.x) / 2;
		return `M ${src.x},${src.y} L ${midX},${src.y} L ${midX},${tgt.y} L ${tgt.x},${tgt.y}`;
	}
	const midY = (src.y + tgt.y) / 2;
	return `M ${src.x},${src.y} L ${src.x},${midY} L ${tgt.x},${midY} L ${tgt.x},${tgt.y}`;
}

/** Convert a mouse event (clientX/Y) to SVG canvas coordinates. */
function eventToSVGPoint(
	e: React.MouseEvent | MouseEvent,
	svg: SVGSVGElement,
): Point {
	const pt = svg.createSVGPoint();
	pt.x = e.clientX;
	pt.y = e.clientY;
	const ctm = svg.getScreenCTM()?.inverse();
	const svgPt = pt.matrixTransform(ctm);
	return { x: svgPt.x, y: svgPt.y };
}

/* ─── Shape renderer ─── */

interface ShapeRendererProps {
	node: FlowchartNode;
	isSelected: boolean;
	isHighlightTarget: boolean;
}

/**
 * Returns SVG primitive(s) for the flowchart shape body.
 * The shapeType is widened to string because the runtime store
 * supports more shapes than the TypeScript type declares.
 */
/* ── Resize handles ── */

const HANDLE_SIZE = 8;

function ResizeHandles({ node }: { node: FlowchartNode }): React.JSX.Element {
	const { x, y, width: w, height: h } = node;
	const hs = HANDLE_SIZE;
	const hh = hs / 2;
	const handleFill = "#ffffff";
	const handleStroke = "#4472c4";
	const handleMouseDown = (e: React.MouseEvent, handleId: string) => {
		e.stopPropagation();
		flowchartStore.startResize(node.id, handleId);
	};
	const handles = [
		{ id: "nw", cx: x, cy: y },
		{ id: "n", cx: x + w / 2, cy: y },
		{ id: "ne", cx: x + w, cy: y },
		{ id: "w", cx: x, cy: y + h / 2 },
		{ id: "e", cx: x + w, cy: y + h / 2 },
		{ id: "sw", cx: x, cy: y + h },
		{ id: "s", cx: x + w / 2, cy: y + h },
		{ id: "se", cx: x + w, cy: y + h },
	];
	return (
		<g>
			{handles.map((hndl) => (
				<rect
					key={hndl.id}
					x={hndl.cx - hh}
					y={hndl.cy - hh}
					width={hs}
					height={hs}
					fill={handleFill}
					stroke={handleStroke}
					strokeWidth={1.5}
					style={{ cursor: `${hndl.id}-resize` }}
					onMouseDown={(e) => handleMouseDown(e, hndl.id)}
				/>
			))}
		</g>
	);
}

function renderShapeBody({
	node,
	isSelected,
	isHighlightTarget,
}: ShapeRendererProps): React.JSX.Element {
	const { x, y, width: w, height: h, fillColor, strokeColor } = node;
	// strokeWidth is not in the FlowchartNode type but IS set by the store at runtime
	// biome-ignore lint/suspicious/noExplicitAny: runtime property, not in type
	const strokeWidth = (node as any).strokeWidth;
	const cx = x + w / 2;
	const cy = y + h / 2;
	const shapeType = node.shapeType as string;

	const isSel = isSelected;
	const isHL = !isSel && isHighlightTarget;

	const classNames = [
		styles.shapeBody,
		isSel ? styles.selected : "",
		isHL ? styles.connectTargetHighlight : "",
	]
		.filter(Boolean)
		.join(" ");

	const fill = fillColor || "#ffffff";
	const stroke = isSel ? undefined : strokeColor || "#333333";
	const sw = isSel ? 3 : strokeWidth || 2;

	switch (shapeType) {
		/* ── Rounded rectangle (start-end / terminator) ── */
		case "start-end":
		case "terminator":
			return (
				<rect
					className={classNames}
					x={x}
					y={y}
					width={w}
					height={h}
					rx={25}
					ry={25}
					fill={fill}
					stroke={stroke}
					strokeWidth={sw}
				/>
			);

		/* ── Plain rectangle (process) ── */
		case "process":
			return (
				<rect
					className={classNames}
					x={x}
					y={y}
					width={w}
					height={h}
					fill={fill}
					stroke={stroke}
					strokeWidth={sw}
				/>
			);

		/* ── Diamond (decision / condition) ── */
		case "decision":
		case "condition":
			return (
				<polygon
					className={classNames}
					points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`}
					fill={fill}
					stroke={stroke}
					strokeWidth={sw}
				/>
			);

		/* ── Parallelogram (input-output / data) ── */
		case "input-output":
		case "data": {
			const offset = Math.min(w * 0.15, h * 0.4);
			return (
				<polygon
					className={classNames}
					points={`${x + offset},${y} ${x + w},${y} ${x + w - offset},${y + h} ${x},${y + h}`}
					fill={fill}
					stroke={stroke}
					strokeWidth={sw}
				/>
			);
		}

		/* ── Document (rect with wavy bottom) ── */
		case "document": {
			const waveAmp = 8;
			const bot = y + h;
			return (
				<path
					className={classNames}
					d={`
            M ${x},${y}
            L ${x + w},${y}
            L ${x + w},${bot - waveAmp}
            Q ${x + w * 0.75},${bot + waveAmp} ${x + w * 0.5},${bot}
            Q ${x + w * 0.25},${bot - waveAmp} ${x},${bot - waveAmp}
            Z
          `}
					fill={fill}
					stroke={stroke}
					strokeWidth={sw}
				/>
			);
		}

		/* ── Subprocess (rect with double vertical lines) ── */
		case "subprocess": {
			const gap = 6;
			return (
				<g>
					<rect
						className={classNames}
						x={x}
						y={y}
						width={w}
						height={h}
						fill={fill}
						stroke={stroke}
						strokeWidth={sw}
					/>
					<line
						className={styles.subprocessLine}
						x1={x + gap}
						y1={y + 4}
						x2={x + gap}
						y2={y + h - 4}
					/>
					<line
						className={styles.subprocessLine}
						x1={x + gap + 3}
						y1={y + 4}
						x2={x + gap + 3}
						y2={y + h - 4}
					/>
				</g>
			);
		}

		/* ── Connector (circle) ── */
		case "connector":
			return (
				<ellipse
					className={classNames}
					cx={cx}
					cy={cy}
					rx={w / 2}
					ry={h / 2}
					fill={fill}
					stroke={stroke}
					strokeWidth={sw}
				/>
			);

		/* ── Manual-input (rect with angled top-right) ── */
		case "manual-input": {
			const cutX = Math.min(12, w * 0.2);
			return (
				<polygon
					className={classNames}
					points={`${x},${y} ${x + w - cutX},${y} ${x + w},${y + cutX} ${x + w},${y + h} ${x},${y + h}`}
					fill={fill}
					stroke={stroke}
					strokeWidth={sw}
				/>
			);
		}

		/* ── Display (rect with angled top) ── */
		case "display": {
			const slant = Math.min(10, h * 0.15);
			return (
				<polygon
					className={classNames}
					points={`${x},${y + slant} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`}
					fill={fill}
					stroke={stroke}
					strokeWidth={sw}
				/>
			);
		}

		/* ── Predefined-process (rect with vertical lines at each side) ── */
		case "predefined-process": {
			const gap = 6;
			return (
				<g>
					<rect
						className={classNames}
						x={x}
						y={y}
						width={w}
						height={h}
						fill={fill}
						stroke={stroke}
						strokeWidth={sw}
					/>
					<line
						className={styles.subprocessLine}
						x1={x + gap}
						y1={y + 4}
						x2={x + gap}
						y2={y + h - 4}
					/>
					<line
						className={styles.subprocessLine}
						x1={x + w - gap}
						y1={y + 4}
						x2={x + w - gap}
						y2={y + h - 4}
					/>
				</g>
			);
		}

		/* ── Stored-data (cylinder) ── */
		case "stored-data": {
			const topRy = Math.min(h * 0.22, 16);
			const bodyTop = y + topRy;
			const bodyH = h - 2 * topRy;
			const botY = bodyTop + bodyH;
			return (
				<g>
					{/* Bottom arc */}
					<path
						className={classNames}
						d={`M ${x},${botY} A ${w / 2},${topRy} 0 0,0 ${x + w},${botY}`}
						fill={fill}
						stroke={stroke}
						strokeWidth={sw}
					/>
					{/* Body rect (fill only — sides drawn as lines) */}
					<rect x={x} y={bodyTop} width={w} height={bodyH} fill={fill} />
					{/* Side lines */}
					<line
						x1={x}
						y1={bodyTop}
						x2={x}
						y2={botY}
						stroke={stroke}
						strokeWidth={sw}
						className={styles.subprocessLine}
					/>
					<line
						x1={x + w}
						y1={bodyTop}
						x2={x + w}
						y2={botY}
						stroke={stroke}
						strokeWidth={sw}
						className={styles.subprocessLine}
					/>
					{/* Top ellipse drawn last so it covers the rect's top edge */}
					<ellipse
						className={classNames}
						cx={cx}
						cy={bodyTop}
						rx={w / 2}
						ry={topRy}
						fill={fill}
						stroke={stroke}
						strokeWidth={sw}
					/>
				</g>
			);
		}

		/* ── Hexagon (delay / preparation) ── */
		case "delay":
		case "preparation": {
			const indentX = Math.min(w * 0.25, 30);
			return (
				<polygon
					className={classNames}
					points={`
            ${x + indentX},${y}
            ${x + w - indentX},${y}
            ${x + w},${cy}
            ${x + w - indentX},${y + h}
            ${x + indentX},${y + h}
            ${x},${cy}
          `}
					fill={fill}
					stroke={stroke}
					strokeWidth={sw}
				/>
			);
		}

		/* ── Pentagon (loop-limit) ── */
		case "loop-limit": {
			const topInset = Math.min(h * 0.35, 24);
			return (
				<polygon
					className={classNames}
					points={`
            ${cx},${y}
            ${x + w},${y + topInset}
            ${x + w * 0.82},${y + h}
            ${x + w * 0.18},${y + h}
            ${x},${y + topInset}
          `}
					fill={fill}
					stroke={stroke}
					strokeWidth={sw}
				/>
			);
		}

		/* ── Fallback ― plain rect ── */
		default:
			return (
				<rect
					className={classNames}
					x={x}
					y={y}
					width={w}
					height={h}
					fill={fill}
					stroke={stroke}
					strokeWidth={sw}
				/>
			);
	}
}

/* ─── Node component ─── */

interface NodeRendererProps {
	node: FlowchartNode;
	isSelected: boolean;
	isConnectSource: boolean;
	isConnectTarget: boolean;
	isEditing: boolean;
	editValue: string;
	onMouseDown: (nodeId: string, e: React.MouseEvent) => void;
	onDoubleClick: (nodeId: string, e: React.MouseEvent) => void;
	onConnectorMouseDown: (nodeId: string, e: React.MouseEvent) => void;
	onNodeMouseUp: (nodeId: string, e: React.MouseEvent) => void;
	onEditChange: (value: string) => void;
	onEditBlur: () => void;
	onEditKeyDown: (e: React.KeyboardEvent) => void;
}

const FlowchartNodeRenderer = observer(function FlowchartNodeRenderer({
	node,
	isSelected,
	isConnectSource,
	isConnectTarget,
	isEditing,
	editValue,
	onMouseDown,
	onDoubleClick,
	onConnectorMouseDown,
	onNodeMouseUp,
	onEditChange,
	onEditBlur,
	onEditKeyDown,
}: NodeRendererProps) {
	const { id: nodeId, x, y, width: w, height: h, label, fontSize } = node;

	const groupClass = [
		styles.nodeGroup,
		isConnectSource ? styles.connectSource : "",
		isConnectTarget ? styles.connectTarget : "",
	]
		.filter(Boolean)
		.join(" ");

	const dotR = 5;
	const dotCX = x + w / 2;
	const dotCY = y + h;

	return (
		<g
			data-node-id={nodeId}
			className={groupClass}
			onMouseDown={(e) => onMouseDown(nodeId, e)}
			onMouseUp={(e) => onNodeMouseUp(nodeId, e)}
			onDoubleClick={(e) => onDoubleClick(nodeId, e)}
		>
			{/* Shape body */}
			{renderShapeBody({
				node,
				isSelected,
				isHighlightTarget: isConnectTarget,
			})}

			{/* Label */}
			<text
				className={styles.nodeLabel}
				x={x + w / 2}
				y={y + h / 2}
				fontSize={fontSize || 14}
			>
				{label}
			</text>

			{/* Inline editing overlay */}
			{isEditing && (
				<foreignObject
					className={styles.editForeignObject}
					x={x}
					y={y}
					width={w}
					height={h}
				>
					<input
						className={styles.editInput}
						style={{ fontSize: fontSize || 14 }}
						value={editValue}
						onChange={(e) => onEditChange(e.target.value)}
						onBlur={onEditBlur}
						onKeyDown={onEditKeyDown}
					/>
				</foreignObject>
			)}

			{/* Connector dot at bottom center */}
			<circle
				className={`${styles.connectorDot}${isConnectSource ? ` ${styles.active}` : ""}`}
				cx={dotCX}
				cy={dotCY}
				r={dotR}
				onMouseDown={(e) => onConnectorMouseDown(nodeId, e)}
			/>
		</g>
	);
});

/* ── Arrowhead markers ── */

const ARROW_COLOR = "#333333";

/* ─── Edge component ─── */

interface EdgeRendererProps {
	edge: FlowchartEdge;
	sourceNode: FlowchartNode;
	targetNode: FlowchartNode;
	isSelected: boolean;
	isEditing: boolean;
	editValue: string;
	onMouseDown: (edgeId: string, e: React.MouseEvent) => void;
	onDoubleClick: (edgeId: string, e: React.MouseEvent) => void;
	onEditChange: (value: string) => void;
	onEditBlur: () => void;
	onEditKeyDown: (e: React.KeyboardEvent) => void;
}

const FlowchartEdgeRenderer = observer(function FlowchartEdgeRenderer({
	edge,
	sourceNode,
	targetNode,
	isSelected,
	isEditing,
	editValue,
	onMouseDown,
	onDoubleClick,
	onEditChange,
	onEditBlur,
	onEditKeyDown,
}: EdgeRendererProps) {
	const src = getEdgeEndpoint(sourceNode, edge.sourceAnchor);
	const tgt = getEdgeEndpoint(targetNode, edge.targetAnchor);
	const strokeColor = edge.strokeColor || "#333333";
	const strokeWidth = edge.strokeWidth || 2;
	const isDashed = edge.strokeStyle === "dashed";
	const isDotted = edge.strokeStyle === "dotted";
	const edgeClass = `${styles.edgeLine}${isSelected ? ` ${styles.selected}` : ""}`;
	const d = orthogonalPath(src, tgt);
	const midX = (src.x + tgt.x) / 2;
	const midY = (src.y + tgt.y) / 2;
	const ah = edge.arrowheadType || "arrow";
	const markerEnd = ah !== "none" ? `url(#ah-${ah})` : undefined;
	const dashArray = isDashed ? "8 4" : isDotted ? "4 4" : undefined;

	return (
		<g>
			<path
				d={d}
				fill="none"
				stroke="transparent"
				strokeWidth={14}
				style={{ cursor: "pointer" }}
				onMouseDown={(e) => onMouseDown(edge.id, e)}
				onDoubleClick={(e) => onDoubleClick(edge.id, e)}
			/>
			<path
				className={edgeClass}
				d={d}
				fill="none"
				stroke={isSelected ? undefined : strokeColor}
				strokeWidth={isSelected ? 3 : strokeWidth}
				strokeDasharray={dashArray}
				markerEnd={markerEnd}
				onMouseDown={(e) => onMouseDown(edge.id, e)}
				onDoubleClick={(e) => onDoubleClick(edge.id, e)}
			/>
			{isEditing ? (
				<foreignObject x={midX - 60} y={midY - 14} width={120} height={28}>
					<input
						className={styles.editInput}
						style={{ fontSize: 12, textAlign: "center" }}
						value={editValue}
						onChange={(e) => onEditChange(e.target.value)}
						onBlur={onEditBlur}
						onKeyDown={onEditKeyDown}
					/>
				</foreignObject>
			) : edge.label ? (
				<text className={styles.edgeLabel} x={midX} y={midY - 8}>
					{edge.label}
				</text>
			) : null}
		</g>
	);
});

function generateSvgXml(doc: FlowchartDocument): string {
	const pad = 40;
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const n of doc.nodes) {
		if (n.x < minX) minX = n.x;
		if (n.y < minY) minY = n.y;
		if (n.x + n.width > maxX) maxX = n.x + n.width;
		if (n.y + n.height > maxY) maxY = n.y + n.height;
	}
	if (!Number.isFinite(minX)) {
		minX = 0;
		minY = 0;
		maxX = 800;
		maxY = 600;
	}
	const w = maxX - minX + pad * 2;
	const h = maxY - minY + pad * 2;

	let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${w} ${h}" width="${w}" height="${h}">`;
	svg += `<rect width="100%" height="100%" fill="white"/>`;

	for (const edge of doc.edges) {
		const src = doc.nodes.find((n) => n.id === edge.sourceId);
		const tgt = doc.nodes.find((n) => n.id === edge.targetId);
		if (!src || !tgt) continue;
		const sp = getEdgeEndpoint(src, edge.sourceAnchor);
		const tp = getEdgeEndpoint(tgt, edge.targetAnchor);
		const d = orthogonalPath(sp, tp);
		const color = edge.strokeColor || "#333";
		svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${edge.strokeWidth || 2}"/>`;
		if (edge.label) {
			const mx = (sp.x + tp.x) / 2;
			const my = (sp.y + tp.y) / 2;
			svg += `<text x="${mx}" y="${my - 8}" text-anchor="middle" font-size="12" fill="#333">${escapeXml(edge.label)}</text>`;
		}
	}

	for (const node of doc.nodes) {
		const {
			x,
			y,
			width: nw,
			height: nh,
			label,
			fillColor,
			strokeColor,
			strokeWidth,
			fontSize,
		} = node;
		const cx = x + nw / 2;
		const cy = y + nh / 2;
		const fill = fillColor || "white";
		const sColor = strokeColor || "#333";
		const sWidth = strokeWidth || 2;

		let shape = "";
		switch (node.shapeType) {
			case "start-end":
			case "terminator":
				shape = `<rect x="${x}" y="${y}" width="${nw}" height="${nh}" rx="${25}" ry="${25}" fill="${fill}" stroke="${sColor}" stroke-width="${sWidth}"/>`;
				break;
			case "process":
				shape = `<rect x="${x}" y="${y}" width="${nw}" height="${nh}" fill="${fill}" stroke="${sColor}" stroke-width="${sWidth}"/>`;
				break;
			case "decision":
			case "condition":
				shape = `<polygon points="${cx},${y} ${x + nw},${cy} ${cx},${y + nh} ${x},${cy}" fill="${fill}" stroke="${sColor}" stroke-width="${sWidth}"/>`;
				break;
			case "input-output":
			case "data": {
				const off = Math.min(nw * 0.15, nh * 0.4);
				shape = `<polygon points="${x + off},${y} ${x + nw},${y} ${x + nw - off},${y + nh} ${x},${y + nh}" fill="${fill}" stroke="${sColor}" stroke-width="${sWidth}"/>`;
				break;
			}
			case "connector":
				shape = `<ellipse cx="${cx}" cy="${cy}" rx="${nw / 2}" ry="${nh / 2}" fill="${fill}" stroke="${sColor}" stroke-width="${sWidth}"/>`;
				break;
			default:
				shape = `<rect x="${x}" y="${y}" width="${nw}" height="${nh}" fill="${fill}" stroke="${sColor}" stroke-width="${sWidth}"/>`;
		}
		svg += shape;
		if (label) {
			svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize || 14}" fill="#333">${escapeXml(label)}</text>`;
		}
	}

	svg += "</svg>";
	return svg;
}

export function exportFlowchartAsSvg(
	doc: FlowchartDocument,
	filename?: string,
): void {
	const svg = generateSvgXml(doc);
	const blob = new Blob([svg], { type: "image/svg+xml" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename || "flowchart.svg";
	a.click();
	URL.revokeObjectURL(url);
}

export function exportFlowchartAsPng(
	doc: FlowchartDocument,
	filename?: string,
	scale = 2,
): void {
	const svg = generateSvgXml(doc);
	const img = new Image();
	const blob = new Blob([svg], { type: "image/svg+xml" });
	const url = URL.createObjectURL(blob);
	img.onload = () => {
		const cvs = document.createElement("canvas");
		cvs.width = img.naturalWidth * scale;
		cvs.height = img.naturalHeight * scale;
		// biome-ignore lint/style/noNonNullAssertion: canvas created above, getContext always returns value
		const ctx = cvs.getContext("2d")!;
		ctx.scale(scale, scale);
		ctx.drawImage(img, 0, 0);
		URL.revokeObjectURL(url);
		cvs.toBlob((pngBlob) => {
			if (!pngBlob) return;
			const pngUrl = URL.createObjectURL(pngBlob);
			const a = document.createElement("a");
			a.href = pngUrl;
			a.download = filename || "flowchart.png";
			a.click();
			URL.revokeObjectURL(pngUrl);
		}, "image/png");
	};
	img.src = url;
}

export function exportFlowchartAsPdf(
	doc: FlowchartDocument,
	filename?: string,
): void {
	const svg = generateSvgXml(doc);
	const title = filename?.replace(/\.pdf$/i, "") || "flowchart";
	const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeXml(title)}</title>
<style>body{margin:0;display:flex;justify-content:center;align-items:flex-start;min-height:100vh}
svg{max-width:100%;height:auto}@media print{body{margin:0}svg{max-width:100%;height:auto}}</style></head>
<body>${svg}</body></html>`;
	const w = window.open("", "_blank");
	if (!w) return;
	w.document.write(html);
	w.document.title = title;
	w.document.close();
}

function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/* ─── Main component ─── */

export const FlowchartCanvas = observer(function FlowchartCanvas() {
	/* ── Refs ── */
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const dragLastPos = useRef<Point>({ x: 0, y: 0 });
	const connectMouseRef = useRef<Point>({ x: 0, y: 0 });

	/* ── State ── */
	const [containerSize, setContainerSize] = useState<{
		width: number;
		height: number;
	}>({
		width: 800,
		height: 600,
	});
	const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
	const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");
	const [connectMousePos, setConnectMousePos] = useState<Point | null>(null);
	const [isPanning, setIsPanning] = useState(false);
	const [isRubberBanding, setIsRubberBanding] = useState(false);
	const [rubberBandRect, setRubberBandRect] = useState<{
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	} | null>(null);

	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

	const panStartRef = useRef<Point>({ x: 0, y: 0 });
	const panOffsetStartRef = useRef<Point>({ x: 0, y: 0 });
	const rubberBandStartRef = useRef<Point>({ x: 0, y: 0 });
	const hasDragged = useRef(false);
	const DRAG_THRESHOLD = 4;

	/* ── Store ── */
	const store = flowchartStore;
	const { document: doc } = store;

	/* ── Node lookup map ── */
	const nodeMap = useMemo(() => {
		const map = new Map<string, FlowchartNode>();
		for (const node of doc.nodes) {
			map.set(node.id, node);
		}
		return map;
	}, [doc.nodes]);

	/* ── ResizeObserver — keep SVG viewBox in sync with container ── */
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (width > 0 && height > 0) {
					setContainerSize({ width, height });
				}
			}
		});
		ro.observe(container);
		return () => ro.disconnect();
	}, []);

	/* ── Convert a browser mouse event to SVG canvas coordinates ── */
	const getSVGPoint = useCallback((e: React.MouseEvent | MouseEvent): Point => {
		const svg = svgRef.current;
		if (!svg) return { x: 0, y: 0 };
		return eventToSVGPoint(e, svg);
	}, []);

	/* ── Check whether a mouse event hit the canvas background ── */
	const isBackgroundTarget = useCallback((target: EventTarget): boolean => {
		const el = target as SVGElement;
		if (el === svgRef.current) return true;
		// CSS-module class check
		if (el.classList.contains(styles.canvasBackground)) return true;
		// Without CSS-module hashed lookup, fall back to tag+role heuristics
		if (el.tagName === "rect" && !el.closest("[data-node-id]")) return true;
		return false;
	}, []);

	/* ── mousedown on a node: start drag + select ── */
	const handleNodeMouseDown = useCallback(
		(nodeId: string, e: React.MouseEvent) => {
			if (e.button !== 0) return; // left button only
			if (store.connectSourceId) return; // in connect mode — no dragging
			e.stopPropagation();
			store.startDrag(nodeId);
			store.selectNode(nodeId);
			dragLastPos.current = getSVGPoint(e);
		},
		[store, getSVGPoint],
	);

	/* ── mousedown on a connector dot: start connection ── */
	const handleConnectorMouseDown = useCallback(
		(nodeId: string, e: React.MouseEvent) => {
			e.stopPropagation();
			store.startConnect(nodeId);
			const pt = getSVGPoint(e);
			connectMouseRef.current = pt;
			setConnectMousePos({ ...pt });
		},
		[store, getSVGPoint],
	);

	/* ── mouseup on a node: finish connection if in connect mode ── */
	const handleNodeMouseUp = useCallback(
		(nodeId: string, e: React.MouseEvent) => {
			if (store.connectSourceId && store.connectSourceId !== nodeId) {
				e.stopPropagation();
				store.finishConnect(nodeId);
				setConnectMousePos(null);
			}
		},
		[store],
	);

	/* ── double-click on a node: enter inline label editing ── */
	const handleNodeDoubleClick = useCallback(
		(nodeId: string, e: React.MouseEvent) => {
			e.stopPropagation();
			const node = doc.nodes.find((n) => n.id === nodeId);
			if (!node) return;
			setEditingNodeId(nodeId);
			setEditValue(node.label);
		},
		[doc.nodes],
	);

	/* ── mousedown on an edge: select it ── */
	const handleEdgeMouseDown = useCallback(
		(edgeId: string, e: React.MouseEvent) => {
			e.stopPropagation();
			store.selectEdge(edgeId);
		},
		[store],
	);

	const handleEdgeDoubleClick = useCallback(
		(edgeId: string, e: React.MouseEvent) => {
			e.stopPropagation();
			const edge = doc.edges.find((ed) => ed.id === edgeId);
			if (!edge) return;
			setEditingNodeId(null);
			setEditingEdgeId(edgeId);
			setEditValue(edge.label ?? "");
		},
		[doc.edges],
	);

	/* ── SVG-level right-click → context menu ── */
	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const target = e.target as SVGElement;
			// Check if the click was on a node group
			const nodeGroup = target.closest("[data-node-id]");
			if (nodeGroup) {
				const nodeId = nodeGroup.getAttribute("data-node-id");
				if (nodeId) {
					if (!store.selectedNodeIds.includes(nodeId)) {
						store.selectNode(nodeId);
					}
					setContextMenu({ x: e.clientX, y: e.clientY, type: "node", nodeId });
					return;
				}
			}
			setContextMenu({ x: e.clientX, y: e.clientY, type: "background" });
		},
		[store],
	);

	const closeContextMenu = useCallback(() => {
		setContextMenu(null);
	}, []);

	/* ── SVG-level mousedown ── */
	const handleSVGMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (!isBackgroundTarget(e.target)) return;

			if (e.button === 1) {
				e.preventDefault();
				setIsPanning(true);
				panStartRef.current = getSVGPoint(e);
				panOffsetStartRef.current = { ...store.canvasOffset };
				return;
			}

			if (e.button === 0) {
				if (store.connectSourceId) {
					store.cancelConnect();
					setConnectMousePos(null);
					return;
				}
				hasDragged.current = false;
				const pt = getSVGPoint(e);
				rubberBandStartRef.current = pt;
				setIsRubberBanding(true);
				setRubberBandRect({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
			}
		},
		[store, getSVGPoint, isBackgroundTarget],
	);

	/* ── SVG-level mousemove ── */
	const handleSVGMouseMove = useCallback(
		(e: React.MouseEvent) => {
			const svgPoint = getSVGPoint(e);

			if (isPanning) {
				const dx = svgPoint.x - panStartRef.current.x;
				const dy = svgPoint.y - panStartRef.current.y;
				store.setCanvasOffset(
					panOffsetStartRef.current.x - dx,
					panOffsetStartRef.current.y - dy,
				);
				return;
			}

			if (store.isDragging && store.dragNodeId) {
				const dx = svgPoint.x - dragLastPos.current.x;
				const dy = svgPoint.y - dragLastPos.current.y;
				if (dx !== 0 || dy !== 0) {
					store.moveNode(store.dragNodeId, dx, dy);
					dragLastPos.current = svgPoint;
				}
				return;
			}

			if (store.isResizing && store.resizeNodeId && store.resizeStartNode) {
				const svgPoint2 = getSVGPoint(e);
				const start = store.resizeStartNode;
				const handle = store.resizeHandle || "";
				let nx = start.x;
				let ny = start.y;
				let nw = start.width;
				let nh = start.height;
				const snap = (v: number) =>
					store.snapToGridEnabled
						? Math.round(v / store.gridSize) * store.gridSize
						: v;
				if (handle.includes("w")) {
					nx = snap(Math.min(svgPoint2.x, start.x + start.width - 30));
					nw = start.x + start.width - nx;
				}
				if (handle.includes("e")) {
					nw = Math.max(30, svgPoint2.x - start.x);
				}
				if (handle.includes("n")) {
					ny = snap(Math.min(svgPoint2.y, start.y + start.height - 30));
					nh = start.y + start.height - ny;
				}
				if (handle.includes("s")) {
					nh = Math.max(30, svgPoint2.y - start.y);
				}
				store.resizeTo(
					store.resizeNodeId,
					nx,
					ny,
					Math.round(nw),
					Math.round(nh),
				);
				return;
			}

			if (store.connectSourceId) {
				connectMouseRef.current = svgPoint;
				setConnectMousePos({ ...svgPoint });
				return;
			}

			if (isRubberBanding && rubberBandRect) {
				const dx = svgPoint.x - rubberBandStartRef.current.x;
				const dy = svgPoint.y - rubberBandStartRef.current.y;
				if (
					!hasDragged.current &&
					(Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)
				) {
					hasDragged.current = true;
				}
				setRubberBandRect((prev) =>
					prev ? { ...prev, x2: svgPoint.x, y2: svgPoint.y } : prev,
				);
			}
		},
		[store, getSVGPoint, isPanning, isRubberBanding, rubberBandRect],
	);

	/* ── SVG-level mouseup ── */
	const handleSVGMouseUp = useCallback(() => {
		if (store.isResizing) {
			store.endResize();
		}
		if (store.isDragging) {
			store.endDrag();
		}
		if (isPanning) {
			setIsPanning(false);
		}
		if (isRubberBanding && rubberBandRect) {
			setIsRubberBanding(false);
			if (hasDragged.current) {
				store.selectNodesInRect(
					rubberBandRect.x1,
					rubberBandRect.y1,
					rubberBandRect.x2,
					rubberBandRect.y2,
				);
			} else {
				store.clearSelection();
			}
			setRubberBandRect(null);
			hasDragged.current = false;
		}
	}, [store, isPanning, isRubberBanding, rubberBandRect]);

	useEffect(() => {
		const handler = () => {
			if (store.isResizing) {
				store.endResize();
			}
			if (store.isDragging) store.endDrag();
			if (isPanning) setIsPanning(false);
			if (isRubberBanding && rubberBandRect) {
				setIsRubberBanding(false);
				if (hasDragged.current) {
					store.selectNodesInRect(
						rubberBandRect.x1,
						rubberBandRect.y1,
						rubberBandRect.x2,
						rubberBandRect.y2,
					);
				}
				setRubberBandRect(null);
				hasDragged.current = false;
			}
		};
		window.addEventListener("mouseup", handler);
		return () => window.removeEventListener("mouseup", handler);
	}, [store, isPanning, isRubberBanding, rubberBandRect]);

	/* ── Inline editing ── */
	const handleEditChange = useCallback((value: string) => {
		setEditValue(value);
	}, []);

	const saveEdit = useCallback(() => {
		if (editingNodeId !== null) {
			store.setNodeLabel(editingNodeId, editValue);
			setEditingNodeId(null);
			setEditValue("");
		} else if (editingEdgeId !== null) {
			store.setEdgeLabel(editingEdgeId, editValue);
			setEditingEdgeId(null);
			setEditValue("");
		}
	}, [editingNodeId, editingEdgeId, editValue, store]);

	const cancelEdit = useCallback(() => {
		setEditingNodeId(null);
		setEditingEdgeId(null);
		setEditValue("");
	}, []);

	const handleEditBlur = useCallback(() => {
		saveEdit();
	}, [saveEdit]);

	const handleEditKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				saveEdit();
			}
			if (e.key === "Escape") {
				e.preventDefault();
				cancelEdit();
			}
		},
		[saveEdit, cancelEdit],
	);

	/* ── ViewBox ── */
	const viewBox = `${store.canvasOffset.x} ${store.canvasOffset.y} ${containerSize.width} ${containerSize.height}`;

	/* ── Source node position for temp connection line ── */
	let sourceNodeCenter: Point | null = null;
	if (store.connectSourceId) {
		const srcNode = nodeMap.get(store.connectSourceId);
		if (srcNode) {
			sourceNodeCenter = getNodeCenter(srcNode);
		}
	}

	/* ── Zoom-to-fit via custom event ── */
	useEffect(() => {
		const handler = () => {
			const container = containerRef.current;
			if (!container) return;
			const rect = container.getBoundingClientRect();
			const result = store.zoomToFit(rect.width, rect.height);
			store.canvasOffset = { x: result.offsetX, y: result.offsetY };
		};
		window.addEventListener("fc-zoom-fit", handler);
		return () => window.removeEventListener("fc-zoom-fit", handler);
	}, [store]);

	/* ── Set data attributes on node groups for background detection ── */

	const gs = store.gridSize > 1 ? store.gridSize : 0;

	const hasSingleSelection =
		store.selectedNodeIds.length === 1 || store.selectedEdgeIds.length === 1;

	return (
		<div ref={containerRef} className={styles.container}>
			<svg
				ref={svgRef}
				className={`${styles.svg}${isPanning ? ` ${styles.panning}` : ""}`}
				viewBox={viewBox}
				preserveAspectRatio="xMidYMid meet"
				role="img"
				aria-label="Flowchart canvas"
				onMouseDown={handleSVGMouseDown}
				onMouseMove={handleSVGMouseMove}
				onMouseUp={handleSVGMouseUp}
				onMouseLeave={handleSVGMouseUp}
				onContextMenu={handleContextMenu}
			>
				<defs>
					{gs > 0 && (
						<pattern
							id="fc-grid"
							width={gs}
							height={gs}
							patternUnits="userSpaceOnUse"
						>
							<circle
								cx={gs / 2}
								cy={gs / 2}
								r={0.5}
								fill="#ccc"
								opacity={0.5}
							/>
						</pattern>
					)}
					<marker
						id="ah-arrow"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="8"
						markerHeight="8"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 10 5 L 0 10 Z" fill={ARROW_COLOR} />
					</marker>
					<marker
						id="ah-triangle"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="8"
						markerHeight="8"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 10 5 L 0 10 Z" fill={ARROW_COLOR} />
					</marker>
					<marker
						id="ah-hollow-triangle"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="8"
						markerHeight="8"
						orient="auto-start-reverse"
					>
						<path
							d="M 0 0 L 10 5 L 0 10 Z"
							fill="white"
							stroke={ARROW_COLOR}
							strokeWidth="1"
						/>
					</marker>
					<marker
						id="ah-diamond"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="10"
						markerHeight="10"
						orient="auto-start-reverse"
					>
						<path d="M 5 0 L 10 5 L 5 10 L 0 5 Z" fill={ARROW_COLOR} />
					</marker>
				</defs>

				<rect
					className={styles.canvasBackground}
					x={-20000}
					y={-20000}
					width={40000}
					height={40000}
				/>

				{gs > 0 && (
					<rect
						x={-20000}
						y={-20000}
						width={40000}
						height={40000}
						fill="url(#fc-grid)"
						pointerEvents="none"
					/>
				)}

				{rubberBandRect && (
					<rect
						x={Math.min(rubberBandRect.x1, rubberBandRect.x2)}
						y={Math.min(rubberBandRect.y1, rubberBandRect.y2)}
						width={Math.abs(rubberBandRect.x2 - rubberBandRect.x1)}
						height={Math.abs(rubberBandRect.y2 - rubberBandRect.y1)}
						fill="rgba(66,133,244,0.08)"
						stroke="#4285f4"
						strokeWidth={1}
						strokeDasharray="4 2"
					/>
				)}

				{doc.edges.map((edge) => {
					const srcNode = nodeMap.get(edge.sourceId);
					const tgtNode = nodeMap.get(edge.targetId);
					if (!srcNode || !tgtNode) return null;
					return (
						<FlowchartEdgeRenderer
							key={edge.id}
							edge={edge}
							sourceNode={srcNode}
							targetNode={tgtNode}
							isSelected={store.selectedEdgeIds.includes(edge.id)}
							isEditing={editingEdgeId === edge.id}
							editValue={editingEdgeId === edge.id ? editValue : ""}
							onMouseDown={handleEdgeMouseDown}
							onDoubleClick={handleEdgeDoubleClick}
							onEditChange={handleEditChange}
							onEditBlur={handleEditBlur}
							onEditKeyDown={handleEditKeyDown}
						/>
					);
				})}

				{/* Temporary connection line (from source node to cursor) */}
				{store.connectSourceId && connectMousePos && sourceNodeCenter && (
					<line
						className={styles.tempConnection}
						x1={sourceNodeCenter.x}
						y1={sourceNodeCenter.y}
						x2={connectMousePos.x}
						y2={connectMousePos.y}
					/>
				)}

				{/* Nodes layer */}
				{doc.nodes.map((node) => (
					<g key={node.id}>
						<FlowchartNodeRenderer
							node={node}
							isSelected={store.selectedNodeIds.includes(node.id)}
							isConnectSource={store.connectSourceId === node.id}
							isConnectTarget={
								store.connectSourceId !== null &&
								store.connectSourceId !== node.id
							}
							isEditing={editingNodeId === node.id}
							editValue={editingNodeId === node.id ? editValue : ""}
							onMouseDown={handleNodeMouseDown}
							onDoubleClick={handleNodeDoubleClick}
							onConnectorMouseDown={handleConnectorMouseDown}
							onNodeMouseUp={handleNodeMouseUp}
							onEditChange={handleEditChange}
							onEditBlur={handleEditBlur}
							onEditKeyDown={handleEditKeyDown}
						/>
						{store.selectedNodeIds.includes(node.id) && (
							<ResizeHandles node={node} />
						)}
					</g>
				))}
			</svg>

			{hasSingleSelection && <PropertiesPanel />}
			{contextMenu && (
				<ContextMenu state={contextMenu} onClose={closeContextMenu} />
			)}
			<MiniMap
				containerWidth={containerSize.width}
				containerHeight={containerSize.height}
			/>
		</div>
	);
});
