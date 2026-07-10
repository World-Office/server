import { observer } from "mobx-react-lite";
import { type JSX, useCallback } from "react";
import { flowchartStore } from "../stores/FlowchartStore";
import type {
	ArrowheadType,
	FlowchartEdge,
	FlowchartNode,
} from "../types/visio";

const STROKE_STYLES = [
	{ value: "solid", label: "Solid" },
	{ value: "dashed", label: "Dashed" },
	{ value: "dotted", label: "Dotted" },
] as const;

const ARROWHEAD_OPTIONS = [
	{ value: "arrow", label: "Arrow" },
	{ value: "triangle", label: "Triangle" },
	{ value: "hollow-triangle", label: "Hollow" },
	{ value: "diamond", label: "Diamond" },
	{ value: "none", label: "None" },
] as const;

function NodeProperties({ node }: { node: FlowchartNode }): JSX.Element {
	const update = useCallback(
		(patch: Partial<FlowchartNode>) => {
			flowchartStore.updateNode(node.id, patch);
		},
		[node.id],
	);

	return (
		<div className="fc-props-section">
			<label className="fc-props-label">
				Label
				<input
					className="fc-props-input"
					type="text"
					value={node.label}
					onChange={(e) => update({ label: e.target.value })}
				/>
			</label>
			<div className="fc-props-row">
				<label className="fc-props-label">
					Fill
					<input
						className="fc-props-color"
						type="color"
						value={node.fillColor || "#ffffff"}
						onChange={(e) => update({ fillColor: e.target.value })}
					/>
				</label>
				<label className="fc-props-label">
					Stroke
					<input
						className="fc-props-color"
						type="color"
						value={node.strokeColor || "#333333"}
						onChange={(e) => update({ strokeColor: e.target.value })}
					/>
				</label>
			</div>
			<div className="fc-props-row">
				<label className="fc-props-label">
					Font
					<input
						className="fc-props-input fc-props-narrow"
						type="number"
						min={8}
						max={72}
						value={node.fontSize || 14}
						onChange={(e) => update({ fontSize: Number(e.target.value) })}
					/>
				</label>
				<label className="fc-props-check">
					<input
						type="checkbox"
						checked={node.fontWeight === "bold"}
						onChange={(e) =>
							update({ fontWeight: e.target.checked ? "bold" : "normal" })
						}
					/>
					Bold
				</label>
			</div>
		</div>
	);
}

function EdgeProperties({ edge }: { edge: FlowchartEdge }): JSX.Element {
	const setLabel = useCallback(
		(label: string) => {
			flowchartStore.setEdgeLabel(edge.id, label);
		},
		[edge.id],
	);

	const updateEdge = useCallback(
		(patch: Partial<FlowchartEdge>) => {
			const e = flowchartStore.document.edges.find((ed) => ed.id === edge.id);
			if (e) Object.assign(e, patch);
		},
		[edge.id],
	);

	return (
		<div className="fc-props-section">
			<label className="fc-props-label">
				Label
				<input
					className="fc-props-input"
					type="text"
					value={edge.label ?? ""}
					onChange={(e) => setLabel(e.target.value)}
				/>
			</label>
			<div className="fc-props-row">
				<label className="fc-props-label">
					Stroke
					<input
						className="fc-props-color"
						type="color"
						value={edge.strokeColor || "#333333"}
						onChange={(e) => updateEdge({ strokeColor: e.target.value })}
					/>
				</label>
				<label className="fc-props-label">
					Style
					<select
						className="fc-props-select"
						value={edge.strokeStyle || "solid"}
						onChange={(e) =>
							updateEdge({
								strokeStyle: e.target.value as "solid" | "dashed" | "dotted",
							})
						}
					>
						{STROKE_STYLES.map((s) => (
							<option key={s.value} value={s.value}>
								{s.label}
							</option>
						))}
					</select>
				</label>
			</div>
			<label className="fc-props-label">
				Arrowhead
				<select
					className="fc-props-select"
					value={edge.arrowheadType || "arrow"}
					onChange={(e) =>
						updateEdge({ arrowheadType: e.target.value as ArrowheadType })
					}
				>
					{ARROWHEAD_OPTIONS.map((a) => (
						<option key={a.value} value={a.value}>
							{a.label}
						</option>
					))}
				</select>
			</label>
		</div>
	);
}

export const PropertiesPanel = observer(
	function PropertiesPanel(): JSX.Element | null {
		const store = flowchartStore;
		const selectedNodeId =
			store.selectedNodeIds.length === 1 ? store.selectedNodeIds[0] : null;
		const selectedEdgeId =
			store.selectedEdgeIds.length === 1 ? store.selectedEdgeIds[0] : null;
		const node = selectedNodeId
			? store.document.nodes.find((n) => n.id === selectedNodeId)
			: null;
		const edge = selectedEdgeId
			? store.document.edges.find((e) => e.id === selectedEdgeId)
			: null;

		if (!node && !edge) return null;

		return (
			<div className="fc-props-panel">
				<div className="fc-props-header">Properties</div>
				{node && <NodeProperties node={node} />}
				{edge && <EdgeProperties edge={edge} />}
			</div>
		);
	},
);
