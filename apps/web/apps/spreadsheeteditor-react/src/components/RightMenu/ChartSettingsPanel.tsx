/** Chart settings panel for spreadsheet editor. */
import { type JSX, useState } from "react";
interface Props {
	visible: boolean;
}
const TYPES = [
	{ id: "bar", label: "Bar", icon: "▇" },
	{ id: "line", label: "Line", icon: "━" },
	{ id: "pie", label: "Pie", icon: "●" },
	{ id: "area", label: "Area", icon: "▲" },
	{ id: "column", label: "Column", icon: "▌" },
	{ id: "scatter", label: "Scatter", icon: "✕" },
];
export function ChartSettingsPanel({ visible }: Props): JSX.Element | null {
	const [ct, setCt] = useState("bar");
	if (!visible) return null;
	function cmd(c: string, v?: string) {
		window.dispatchEvent(
			new CustomEvent("wo-command", { detail: { command: c, value: v } }),
		);
	}
	return (
		<div className="se-properties-panel" style={p.panel}>
			<div style={p.header}>Chart Settings</div>
			<div style={p.body}>
				<div style={p.sec}>
					<div style={p.label}>Type</div>
					<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
						{TYPES.map((t) => (
							<button
								key={t.id}
								type="button"
								onClick={() => {
									setCt(t.id);
									cmd("chartType", t.id);
								}}
								style={{
									flex: "0 0 auto",
									padding: "6px 10px",
									border: ct === t.id ? "1px solid #2b579a" : "1px solid #ddd",
									borderRadius: 4,
									background: ct === t.id ? "#e8f0fe" : "#fff",
									cursor: "pointer",
									fontSize: 11,
									color: "#333",
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: 2,
									minWidth: 48,
								}}
							>
								<span style={{ fontSize: 18 }}>{t.icon}</span>
								<span>{t.label}</span>
							</button>
						))}
					</div>
				</div>
				<div style={p.sec}>
					<div style={p.label}>Options</div>
					<label style={p.chk}>
						<input
							type="checkbox"
							defaultChecked
							onChange={(e) =>
								cmd("chartShowLegend", e.target.checked ? "true" : "false")
							}
						/>
						Show legend
					</label>
					<label style={p.chk}>
						<input
							type="checkbox"
							onChange={(e) =>
								cmd("chartShowDataLabels", e.target.checked ? "true" : "false")
							}
						/>
						Show data labels
					</label>
				</div>
				<button
					type="button"
					onClick={() => cmd("editChartData")}
					style={{
						width: "100%",
						padding: "8px 16px",
						border: "none",
						borderRadius: 4,
						background: "#2b579a",
						color: "#fff",
						cursor: "pointer",
						fontSize: 13,
						fontWeight: 600,
					}}
				>
					Edit Data
				</button>
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
