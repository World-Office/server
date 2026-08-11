/** Properties panel for Visio editor. */
import type { JSX } from "react";
interface Props {
	visible: boolean;
}
export function PropertiesPanel({ visible }: Props): JSX.Element | null {
	if (!visible) return null;
	function cmd(c: string, v?: string) {
		window.dispatchEvent(
			new CustomEvent("wo-command", { detail: { command: c, value: v } }),
		);
	}
	return (
		<div className="vi-properties-panel" style={p.panel}>
			<div style={p.header}>Properties</div>
			<div style={p.body}>
				<div style={p.sec}>
					<div style={p.label}>Name</div>
					<input
						type="text"
						defaultValue="Shape"
						onChange={(e) => cmd("shapeName", e.target.value)}
						style={p.inp}
					/>
				</div>
				<div style={p.sec}>
					<div style={p.label}>ID</div>
					<div style={{ fontSize: 12, color: "#555", padding: "4px 0" }}>
						Shape_1
					</div>
				</div>
				<div style={p.sec}>
					<div style={p.label}>Layer</div>
					<select
						onChange={(e) => cmd("shapeLayer", e.target.value)}
						style={p.sel}
					>
						<option value="default">Default</option>
						<option value="background">Background</option>
						<option value="foreground">Foreground</option>
					</select>
				</div>
				<div style={p.sec}>
					<div style={p.label}>Connections</div>
					<div style={{ fontSize: 11, color: "#555" }}>Connected to: None</div>
					<div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
						Connectors: 0
					</div>
				</div>
			</div>
		</div>
	);
}
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
	inp: {
		width: "100%",
		padding: "3px 6px",
		border: "1px solid #ccc",
		borderRadius: 3,
		fontSize: 11,
		boxSizing: "border-box",
	},
	sel: {
		width: "100%",
		padding: "3px 6px",
		border: "1px solid #ccc",
		borderRadius: 3,
		fontSize: 11,
		boxSizing: "border-box",
	},
};
