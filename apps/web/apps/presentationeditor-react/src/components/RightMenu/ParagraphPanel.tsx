/** Paragraph settings panel for presentation editor. */
import type { JSX } from "react";
interface Props {
	visible: boolean;
}
export function ParagraphPanel({ visible }: Props): JSX.Element | null {
	if (!visible) return null;
	function cmd(c: string, v?: string) {
		window.dispatchEvent(
			new CustomEvent("wo-command", { detail: { command: c, value: v } }),
		);
	}
	return (
		<div className="prese-properties-panel" style={p.panel}>
			<div style={p.header}>Paragraph</div>
			<div style={p.body}>
				<div style={p.sec}>
					<div style={p.label}>Alignment</div>
					<div style={{ display: "flex", gap: 4 }}>
						{[
							["left", "Left", "⬅"],
							["center", "Center", "⬡"],
							["right", "Right", "➡"],
							["justify", "Justify", "⇔"],
						].map(([id, label, icon]) => (
							<button
								key={id}
								type="button"
								onClick={() => cmd("paraAlign", id)}
								style={{
									flex: 1,
									padding: "6px 8px",
									border: "1px solid #ddd",
									borderRadius: 3,
									background: "#fff",
									cursor: "pointer",
									fontSize: 11,
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: 2,
								}}
							>
								<span>{icon}</span>
								<span>{label}</span>
							</button>
						))}
					</div>
				</div>
				<div style={p.sec}>
					<div style={p.label}>Spacing</div>
					<div style={{ display: "flex", gap: 8 }}>
						<div style={{ flex: 1 }}>
							<label style={p.sm}>
								Before
								<input
									type="number"
									defaultValue={0}
									min={0}
									onChange={(e) => cmd("paraSpaceBefore", e.target.value)}
									style={p.inp}
								/>
							</label>
						</div>
						<div style={{ flex: 1 }}>
							<label style={p.sm}>
								After
								<input
									type="number"
									defaultValue={0}
									min={0}
									onChange={(e) => cmd("paraSpaceAfter", e.target.value)}
									style={p.inp}
								/>
							</label>
						</div>
					</div>
					<label style={p.sm}>
						Line spacing
						<select
							onChange={(e) => cmd("paraLineSpacing", e.target.value)}
							style={p.sel}
						>
							<option value="1">Single</option>
							<option value="1.15">1.15</option>
							<option value="1.5">1.5</option>
							<option value="2">Double</option>
						</select>
					</label>
				</div>
				<div style={p.sec}>
					<label style={p.chk}>
						<input
							type="checkbox"
							onChange={(e) =>
								cmd("paraBullets", e.target.checked ? "true" : "false")
							}
						/>
						Bullets
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
	sm: { display: "block", fontSize: 11, color: "#888", marginBottom: 2 },
	inp: {
		width: "100%",
		padding: "4px 8px",
		border: "1px solid #ccc",
		borderRadius: 3,
		fontSize: 12,
		boxSizing: "border-box",
		marginTop: 2,
	},
	sel: {
		width: "100%",
		padding: "4px 8px",
		border: "1px solid #ccc",
		borderRadius: 3,
		fontSize: 12,
		boxSizing: "border-box",
		marginTop: 2,
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
