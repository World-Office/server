/** Table settings panel for presentation editor. */
import type { JSX } from "react";
interface Props {
	visible: boolean;
}
export function TablePanel({ visible }: Props): JSX.Element | null {
	if (!visible) return null;
	function cmd(c: string, v?: string) {
		window.dispatchEvent(
			new CustomEvent("wo-command", { detail: { command: c, value: v } }),
		);
	}
	return (
		<div className="prese-properties-panel" style={p.panel}>
			<div style={p.header}>Table</div>
			<div style={p.body}>
				<div style={p.sec}>
					<div style={p.label}>Rows & Columns</div>
					<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => cmd("addRowBefore")}
							style={p.btn}
						>
							Above
						</button>
						<button
							type="button"
							onClick={() => cmd("addRowAfter")}
							style={p.btn}
						>
							Below
						</button>
						<button
							type="button"
							onClick={() => cmd("addColumnBefore")}
							style={p.btn}
						>
							Left
						</button>
						<button
							type="button"
							onClick={() => cmd("addColumnAfter")}
							style={p.btn}
						>
							Right
						</button>
						<button
							type="button"
							onClick={() => cmd("deleteRow")}
							style={p.btn}
						>
							Del Row
						</button>
						<button
							type="button"
							onClick={() => cmd("deleteColumn")}
							style={p.btn}
						>
							Del Col
						</button>
					</div>
				</div>
				<div style={p.sec}>
					<div style={p.label}>Style</div>
					<select
						onChange={(e) => cmd("tableStyle", e.target.value)}
						style={p.sel}
					>
						<option value="light1">Light 1</option>
						<option value="light2">Light 2</option>
						<option value="medium1">Medium 1</option>
						<option value="medium2">Medium 2</option>
						<option value="dark1">Dark 1</option>
					</select>
				</div>
				<div style={p.sec}>
					<div style={p.label}>Shading</div>
					<input
						type="color"
						defaultValue="#fff"
						onChange={(e) => cmd("tableShading", e.target.value)}
						style={p.clr}
					/>
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
		fontSize: 13,
		zIndex: 100,
	},
	header: {
		padding: "12px 16px",
		borderBottom: "1px solid #e0e0e0",
		fontWeight: 600,
		fontSize: 14,
		background: "#f8f9fa",
	},
	body: { flex: 1, overflowY: "auto", padding: "12px 16px" },
	sec: { marginBottom: 16 },
	label: {
		fontWeight: 600,
		fontSize: 12,
		color: "#666",
		textTransform: "uppercase",
		marginBottom: 8,
	},
	sel: {
		width: "100%",
		padding: "4px 8px",
		border: "1px solid #ccc",
		borderRadius: 3,
		fontSize: 12,
		boxSizing: "border-box",
	},
	btn: {
		padding: "4px 8px",
		border: "1px solid #ddd",
		borderRadius: 3,
		background: "#fff",
		cursor: "pointer",
		fontSize: 10,
		color: "#333",
	},
	clr: {
		width: 32,
		height: 28,
		padding: 0,
		border: "1px solid #ccc",
		borderRadius: 3,
		cursor: "pointer",
	},
};
