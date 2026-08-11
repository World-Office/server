/** TextArt settings panel for presentation editor. */
import { type JSX, useState } from "react";
interface Props {
	visible: boolean;
}
const TRANSFORMS = [
	"None",
	"Arch Up",
	"Arch Down",
	"Circle",
	"Button",
	"Wave 1",
	"Wave 2",
];
export function TextArtPanel({ visible }: Props): JSX.Element | null {
	const [tx, setTx] = useState("None");
	if (!visible) return null;
	function cmd(c: string, v?: string) {
		window.dispatchEvent(
			new CustomEvent("wo-command", { detail: { command: c, value: v } }),
		);
	}
	return (
		<div className="prese-properties-panel" style={p.panel}>
			<div style={p.header}>WordArt</div>
			<div style={p.body}>
				<div style={p.sec}>
					<div style={p.label}>Fill</div>
					<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
						<input
							type="color"
							defaultValue="#2b579a"
							onChange={(e) => cmd("textartFill", e.target.value)}
							style={p.clr}
						/>
						<select
							onChange={(e) => cmd("textartFillType", e.target.value)}
							style={{
								flex: 1,
								padding: "4px 8px",
								border: "1px solid #ccc",
								borderRadius: 3,
								fontSize: 12,
							}}
						>
							<option value="solid">Solid</option>
							<option value="gradient">Gradient</option>
						</select>
					</div>
				</div>
				<div style={p.sec}>
					<div style={p.label}>Transform</div>
					<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
						{TRANSFORMS.map((t) => (
							<button
								key={t}
								type="button"
								onClick={() => {
									setTx(t);
									cmd("textartTransform", t.toLowerCase().replace(/ /g, "-"));
								}}
								style={{
									padding: "4px 8px",
									border: tx === t ? "1px solid #2b579a" : "1px solid #ddd",
									borderRadius: 3,
									background: tx === t ? "#e8f0fe" : "#fff",
									cursor: "pointer",
									fontSize: 11,
									color: "#333",
								}}
							>
								{t}
							</button>
						))}
					</div>
				</div>
				<div style={p.sec}>
					<label style={p.chk}>
						<input
							type="checkbox"
							onChange={(e) =>
								cmd("textartShadow", e.target.checked ? "true" : "false")
							}
						/>
						Shadow
					</label>
					<label style={p.chk}>
						<input
							type="checkbox"
							onChange={(e) =>
								cmd("textartGlow", e.target.checked ? "true" : "false")
							}
						/>
						Glow
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
	clr: {
		width: 32,
		height: 28,
		padding: 0,
		border: "1px solid #ccc",
		borderRadius: 3,
		cursor: "pointer",
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
