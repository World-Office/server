import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { THEMES, flowchartStore } from "../stores/FlowchartStore";
import type { FlowchartEdge } from "../types/visio";
import {
	exportFlowchartAsPdf,
	exportFlowchartAsPng,
	exportFlowchartAsSvg,
} from "./FlowchartCanvas";

export interface ContextMenuState {
	x: number;
	y: number;
	type: "node" | "edge" | "background";
	nodeId?: string;
	edgeId?: string;
}

interface ContextMenuProps {
	state: ContextMenuState;
	onClose: () => void;
}

export function ContextMenu({ state, onClose }: ContextMenuProps): JSX.Element {
	const ref = useRef<HTMLDivElement>(null);
	const [submenu, setSubmenu] = useState<string | null>(null);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				onClose();
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [onClose]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
				setSubmenu(null);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [onClose]);

	const run = useCallback(
		(fn: () => void) => {
			fn();
			onClose();
		},
		[onClose],
	);

	const store = flowchartStore;
	const multiSelected = store.selectedNodeIds.length >= 2;

	if (submenu === "theme") {
		return (
			<div
				ref={ref}
				className="fc-context-menu"
				style={{ left: state.x, top: state.y }}
			>
				{THEMES.map((t) => (
					<button
						type="button"
						key={t.id}
						className="fc-context-item"
						onClick={() => run(() => store.applyTheme(t.id))}
					>
						{store.currentThemeId === t.id ? "\u2713 " : ""}
						{t.name}
					</button>
				))}
				<div className="fc-context-sep" />
				<button
					type="button"
					className="fc-context-item"
					onClick={() => setSubmenu(null)}
				>
					Back
				</button>
			</div>
		);
	}

	if (submenu === "routing") {
		const edge =
			store.selectedEdgeIds.length === 1
				? store.document.edges.find((e) => e.id === store.selectedEdgeIds[0])
				: null;
		const modes: Array<{
			mode: string;
			label: string;
		}> = [
			{ mode: "orthogonal", label: "Orthogonal (Right Angle)" },
			{ mode: "straight", label: "Straight" },
			{ mode: "manhattan", label: "Manhattan" },
			{ mode: "bezier", label: "Bezier (Smooth)" },
		];
		return (
			<div
				ref={ref}
				className="fc-context-menu"
				style={{ left: state.x, top: state.y }}
			>
				{modes.map(({ mode, label }) => (
					<button
						type="button"
						key={mode}
						className="fc-context-item"
						onClick={() =>
							run(() => {
								store.applyConnectorFormat({
									routeMode: mode as FlowchartEdge["routeMode"],
								});
							})
						}
					>
						{edge?.routeMode === mode ? "\u2713 " : ""}
						{label}
					</button>
				))}
				<div className="fc-context-sep" />
				<button
					type="button"
					className="fc-context-item"
					onClick={() => setSubmenu(null)}
				>
					Back
				</button>
			</div>
		);
	}

	if (submenu === "align") {
		return (
			<div
				ref={ref}
				className="fc-context-menu"
				style={{ left: state.x, top: state.y }}
			>
				<button
					type="button"
					className="fc-context-item"
					onClick={() => run(() => store.alignLeft())}
				>
					Align Left
				</button>
				<button
					type="button"
					className="fc-context-item"
					onClick={() => run(() => store.alignRight())}
				>
					Align Right
				</button>
				<button
					type="button"
					className="fc-context-item"
					onClick={() => run(() => store.alignTop())}
				>
					Align Top
				</button>
				<button
					type="button"
					className="fc-context-item"
					onClick={() => run(() => store.alignBottom())}
				>
					Align Bottom
				</button>
				<button
					type="button"
					className="fc-context-item"
					onClick={() => run(() => store.alignCenter())}
				>
					Align Center
				</button>
				<button
					type="button"
					className="fc-context-item"
					onClick={() => run(() => store.alignMiddle())}
				>
					Align Middle
				</button>
				<div className="fc-context-sep" />
				<button
					type="button"
					className="fc-context-item"
					onClick={() => run(() => store.distributeHorizontally())}
				>
					Distribute Horizontally
				</button>
				<button
					type="button"
					className="fc-context-item"
					onClick={() => run(() => store.distributeVertically())}
				>
					Distribute Vertically
				</button>
				<div className="fc-context-sep" />
				<button
					type="button"
					className="fc-context-item"
					onClick={() => run(() => store.makeEqualWidth())}
				>
					Make Equal Width
				</button>
				<button
					type="button"
					className="fc-context-item"
					onClick={() => run(() => store.makeEqualHeight())}
				>
					Make Equal Height
				</button>
				<div className="fc-context-sep" />
				<button
					type="button"
					className="fc-context-item"
					onClick={() => setSubmenu(null)}
				>
					Back
				</button>
			</div>
		);
	}

	return (
		<div
			ref={ref}
			className="fc-context-menu"
			style={{ left: state.x, top: state.y }}
		>
			{state.type === "node" && (
				<>
					<button
						type="button"
						className="fc-context-item"
						onClick={() => run(() => store.cutSelection())}
					>
						Cut
					</button>
					<button
						type="button"
						className="fc-context-item"
						onClick={() => run(() => store.copySelection())}
					>
						Copy
					</button>
					<button
						type="button"
						className="fc-context-item"
						onClick={() => run(() => store.duplicateSelection())}
					>
						Duplicate
					</button>
					{multiSelected && (
						<>
							<div className="fc-context-sep" />
							<button
								type="button"
								className="fc-context-item"
								onClick={() => setSubmenu("align")}
							>
								Align &rarr;
							</button>
						</>
					)}
					<div className="fc-context-sep" />
					<button
						type="button"
						className="fc-context-item"
						onClick={() =>
							run(() => {
								store.bringForward();
								store.bringForward();
							})
						}
					>
						Bring Forward
					</button>
					<button
						type="button"
						className="fc-context-item"
						onClick={() =>
							run(() => {
								store.sendBackward();
								store.sendBackward();
							})
						}
					>
						Send Backward
					</button>
					<button
						type="button"
						className="fc-context-item"
						onClick={() => run(() => store.bringToFront())}
					>
						Bring to Front
					</button>
					<button
						type="button"
						className="fc-context-item"
						onClick={() => run(() => store.sendToBack())}
					>
						Send to Back
					</button>
					<div className="fc-context-sep" />
					<button
						type="button"
						className="fc-context-item fc-context-danger"
						onClick={() =>
							run(() => {
								for (const nid of store.selectedNodeIds) store.removeNode(nid);
								for (const eid of store.selectedEdgeIds) store.removeEdge(eid);
							})
						}
					>
						Delete
					</button>
				</>
			)}
			{state.type === "edge" && (
				<>
					<button
						type="button"
						className="fc-context-item"
						onClick={() => run(() => store.copySelection())}
					>
						Copy
					</button>
					<button
						type="button"
						className="fc-context-item"
						onClick={() => run(() => store.duplicateSelection())}
					>
						Duplicate
					</button>
					<div className="fc-context-sep" />
					<button
						type="button"
						className="fc-context-item"
						onClick={() => setSubmenu("routing")}
					>
						Routing Mode &rarr;
					</button>
					<button
						type="button"
						className="fc-context-item"
						onClick={() =>
							run(() => {
								store.applyConnectorFormat({ routeMode: "straight" });
							})
						}
					>
						Straighten Connector
					</button>
					<div className="fc-context-sep" />
					<button
						type="button"
						className="fc-context-item fc-context-danger"
						onClick={() =>
							run(() => {
								for (const eid of store.selectedEdgeIds) store.removeEdge(eid);
							})
						}
					>
						Delete Connector
					</button>
				</>
			)}
			{state.type === "background" && (
				<>
					<button
						type="button"
						className="fc-context-item"
						disabled={!store.clipboard}
						onClick={() => run(() => store.paste())}
					>
						Paste
					</button>
					<div className="fc-context-sep" />
					<button
						type="button"
						className="fc-context-item"
						onClick={() => setSubmenu("theme")}
					>
						Theme &rarr;
					</button>
					<div className="fc-context-sep" />
					<button
						type="button"
						className="fc-context-item"
						onClick={() => run(() => exportFlowchartAsSvg(store.document))}
					>
						Export SVG
					</button>
					<button
						type="button"
						className="fc-context-item"
						onClick={() => run(() => exportFlowchartAsPng(store.document))}
					>
						Export PNG
					</button>
					<button
						type="button"
						className="fc-context-item"
						onClick={() => run(() => exportFlowchartAsPdf(store.document))}
					>
						Export PDF
					</button>
					<div className="fc-context-sep" />
					<button
						type="button"
						className="fc-context-item"
						onClick={() => run(() => store.autoLayout())}
					>
						Auto Layout
					</button>
					<div className="fc-context-sep" />
					<button
						type="button"
						className="fc-context-item"
						onClick={() => run(() => store.clear())}
					>
						Clear All
					</button>
				</>
			)}
		</div>
	);
}
