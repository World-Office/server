/** Connector format panel for Visio editor — wiring wo-command events. */
import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { flowchartStore } from "../../stores/FlowchartStore";
import type { ArrowheadType, ConnectorRouteMode } from "../../types/visio";

interface Props {
	visible: boolean;
}

/** Dispatch a wo-command event for connector formatting operations. */
function cmd(c: string, v?: string) {
	window.dispatchEvent(
		new CustomEvent("wo-command", { detail: { command: c, value: v } }),
	);
}

export const ConnectorFormatPanel = observer(function ConnectorFormatPanel({
	visible,
}: Props): JSX.Element | null {
	if (!visible) return null;

	const hasEdgeSelection = flowchartStore.selectedEdgeIds.length > 0;
	const edge =
		flowchartStore.selectedEdgeIds.length === 1
			? flowchartStore.document.edges.find(
					(e) => e.id === flowchartStore.selectedEdgeIds[0],
				)
			: null;

	const currentRouteMode: ConnectorRouteMode =
		edge?.routeMode ?? flowchartStore.defaultRouteMode;
	const currentStrokeColor = edge?.strokeColor ?? "#333333";
	const currentStrokeWidth = edge?.strokeWidth ?? 2;
	const currentStrokeStyle = edge?.strokeStyle ?? "solid";
	const currentArrowhead: ArrowheadType = edge?.arrowheadType ?? "arrow";

	return (
		<div className="vi-properties-panel" style={p.panel}>
			<div style={p.header}>Connector Format</div>
			<div style={p.body}>
				{hasEdgeSelection ? (
					<>
						{/* Routing mode */}
						<div style={p.sec}>
							<div style={p.label}>Routing</div>
							<select
								value={currentRouteMode}
								onChange={(e) => cmd("connectorRouteMode", e.target.value)}
								style={p.sel}
							>
								<option value="orthogonal">Orthogonal</option>
								<option value="straight">Straight</option>
								<option value="manhattan">Manhattan</option>
								<option value="bezier">Bezier</option>
							</select>
						</div>

						{/* Line color */}
						<div style={p.sec}>
							<div style={p.label}>Line</div>
							<div
								style={{
									display: "flex",
									gap: 6,
									alignItems: "center",
									marginBottom: 6,
								}}
							>
								<input
									type="color"
									value={currentStrokeColor}
									onChange={(e) => cmd("connectorStroke", e.target.value)}
									style={p.clr}
								/>
								<select
									value={String(currentStrokeWidth)}
									onChange={(e) => cmd("connectorStrokeWidth", e.target.value)}
									style={p.sel}
								>
									<option value="1">1pt</option>
									<option value="2">2pt</option>
									<option value="3">3pt</option>
									<option value="5">5pt</option>
								</select>
							</div>

							{/* Dash style */}
							<select
								value={currentStrokeStyle}
								onChange={(e) => cmd("connectorStrokeStyle", e.target.value)}
								style={p.sel}
							>
								<option value="solid">Solid</option>
								<option value="dashed">Dashed</option>
								<option value="dotted">Dotted</option>
							</select>
						</div>

						{/* Arrowhead type */}
						<div style={p.sec}>
							<div style={p.label}>Arrowhead</div>
							<select
								value={currentArrowhead}
								onChange={(e) => cmd("connectorArrowhead", e.target.value)}
								style={p.sel}
							>
								<option value="arrow">Arrow</option>
								<option value="triangle">Triangle</option>
								<option value="hollow-triangle">Hollow Triangle</option>
								<option value="diamond">Diamond</option>
								<option value="none">None</option>
							</select>
						</div>

						{/* Source/Target anchor */}
						<div style={p.sec}>
							<div style={p.label}>Anchors</div>
							<div style={{ display: "flex", gap: 8 }}>
								<div style={{ flex: 1 }}>
									<div style={p.sm}>Source</div>
									<select
										value={edge?.sourceAnchor ?? "bottom"}
										onChange={(e) =>
											cmd("connectorSourceAnchor", e.target.value)
										}
										style={p.sel}
									>
										<option value="top">Top</option>
										<option value="right">Right</option>
										<option value="bottom">Bottom</option>
										<option value="left">Left</option>
									</select>
								</div>
								<div style={{ flex: 1 }}>
									<div style={p.sm}>Target</div>
									<select
										value={edge?.targetAnchor ?? "top"}
										onChange={(e) =>
											cmd("connectorTargetAnchor", e.target.value)
										}
										style={p.sel}
									>
										<option value="top">Top</option>
										<option value="right">Right</option>
										<option value="bottom">Bottom</option>
										<option value="left">Left</option>
									</select>
								</div>
							</div>
						</div>

						<button
							type="button"
							onClick={() => cmd("resetConnectorFormat")}
							style={p.resetBtn}
						>
							Reset to Default
						</button>
					</>
				) : (
					<div style={p.emptyState}>
						<p>Select a connector to format</p>
					</div>
				)}
			</div>
		</div>
	);
});

const p: Record<string, React.CSSProperties> = {
	panel: {
		position: "absolute",
		right: 48,
		top: 0,
		width: 260,
		height: "100%",
		background: "#fff",
		borderLeft: "1px solid #e0e0e0",
		display: "flex",
		flexDirection: "column",
		overflow: "hidden",
		fontFamily: "'Aptos','Calibri','Segoe UI',Roboto,sans-serif",
		fontSize: 12,
		zIndex: 100,
	},
	header: {
		padding: "10px 14px",
		borderBottom: "1px solid #e0e0e0",
		fontWeight: 600,
		fontSize: 13,
		background: "#f8f9fa",
	},
	body: { flex: 1, overflowY: "auto", padding: "10px 14px" },
	sec: { marginBottom: 14 },
	label: {
		fontWeight: 600,
		fontSize: 11,
		color: "#666",
		textTransform: "uppercase",
		marginBottom: 6,
	},
	sm: { display: "block", fontSize: 10, color: "#888", marginBottom: 1 },
	sel: {
		width: "100%",
		padding: "4px 8px",
		border: "1px solid #ccc",
		borderRadius: 3,
		fontSize: 12,
		boxSizing: "border-box",
	},
	clr: {
		width: 30,
		height: 26,
		padding: 0,
		border: "1px solid #ccc",
		borderRadius: 3,
		cursor: "pointer",
	},
	resetBtn: {
		width: "100%",
		padding: "6px 12px",
		border: "1px solid #ccc",
		borderRadius: 3,
		background: "#fff",
		cursor: "pointer",
		fontSize: 11,
		color: "#666",
	},
	emptyState: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		height: "100%",
		color: "#888",
		fontSize: 12,
		textAlign: "center",
	},
};
