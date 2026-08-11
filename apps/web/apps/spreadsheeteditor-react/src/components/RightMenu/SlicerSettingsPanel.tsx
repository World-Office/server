/** Slicer settings panel for spreadsheet editor. */
import type { JSX } from "react";
interface Props {
	visible: boolean;
}
export function SlicerSettingsPanel({ visible }: Props): JSX.Element | null {
	if (!visible) return null;
	function cmd(c: string, v?: string) {
		window.dispatchEvent(
			new CustomEvent("wo-command", { detail: { command: c, value: v } }),
		);
	}
	return (
		<div className="se-properties-panel" style={p.panel}>
			<div style={p.header}>Slicer Settings</div>
			<div style={p.body}>
				<div style={p.sec}>
					<div style={p.label}>Columns</div>
					<input
						type="number"
						defaultValue={1}
						min={1}
						max={8}
						onChange={(e) => cmd("slicerColumns", e.target.value)}
						style={p.inp}
					/>
				</div>
				<div style={p.sec}>
					<div style={p.label}>Button Style</div>
					<select
						onChange={(e) => cmd("slicerStyle", e.target.value)}
						style={p.sel}
					>
						<option value="light1">Light 1</option>
						<option value="light2">Light 2</option>
						<option value="dark1">Dark 1</option>
						<option value="dark2">Dark 2</option>
					</select>
				</div>
				<div style={p.sec}>
					<div style={p.label}>Sort Order</div>
					<select
						onChange={(e) => cmd("slicerSort", e.target.value)}
						style={p.sel}
					>
						<option value="ascending">Ascending</option>
						<option value="descending">Descending</option>
					</select>
				</div>
				<div style={p.sec}>
					<label style={p.chk}>
						<input
							type="checkbox"
							defaultChecked
							onChange={(e) =>
								cmd("slicerMultiSelect", e.target.checked ? "true" : "false")
							}
						/>
						Allow multi-select
					</label>
					<label style={p.chk}>
						<input
							type="checkbox"
							onChange={(e) =>
								cmd("slicerShowHeader", e.target.checked ? "true" : "false")
							}
						/>
						Show header
					</label>
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
	inp: {
		width: "100%",
		padding: "4px 8px",
		border: "1px solid #ccc",
		borderRadius: 3,
		fontSize: 12,
		boxSizing: "border-box",
	},
	sel: {
		width: "100%",
		padding: "4px 8px",
		border: "1px solid #ccc",
		borderRadius: 3,
		fontSize: 12,
		boxSizing: "border-box",
	},
	chk: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		fontSize: 12,
		color: "#555",
		cursor: "pointer",
		marginBottom: 4,
	},
};
