/** Shape formatting panel for Visio editor. */
import type { JSX } from "react";
interface Props {
	visible: boolean;
}
export function ShapeFormatPanel({ visible }: Props): JSX.Element | null {
	if (!visible) return null;
	function cmd(c: string, v?: string) {
		window.dispatchEvent(
			new CustomEvent("wo-command", { detail: { command: c, value: v } }),
		);
	}
	return (
		<div className="vi-properties-panel" style={p.panel}>
			<div style={p.header}>Shape Format</div>
			<div style={p.body}>
				<div style={p.sec}>
					<div style={p.label}>Fill</div>
					<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
						<input
							type="color"
							defaultValue="#4472C4"
							onChange={(e) => cmd("shapeFill", e.target.value)}
							style={p.clr}
						/>
						<button
							type="button"
							onClick={() => cmd("shapeFill", "transparent")}
							style={p.sm}
						>
							None
						</button>
					</div>
				</div>
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
							defaultValue="#000"
							onChange={(e) => cmd("shapeStroke", e.target.value)}
							style={p.clr}
						/>
						<select
							onChange={(e) => cmd("shapeStrokeWidth", e.target.value)}
							style={{
								flex: 1,
								padding: "4px 8px",
								border: "1px solid #ccc",
								borderRadius: 3,
								fontSize: 12,
							}}
						>
							<option value="1">1pt</option>
							<option value="2" selected>
								2pt
							</option>
							<option value="3">3pt</option>
							<option value="5">5pt</option>
						</select>
					</div>
					<select
						onChange={(e) => cmd("shapeStrokeStyle", e.target.value)}
						style={{
							width: "100%",
							padding: "4px 8px",
							border: "1px solid #ccc",
							borderRadius: 3,
							fontSize: 12,
							boxSizing: "border-box",
						}}
					>
						<option value="solid">Solid</option>
						<option value="dashed">Dashed</option>
						<option value="dotted">Dotted</option>
					</select>
				</div>
				<div style={p.sec}>
					<div style={p.label}>Size & Position</div>
					<div style={{ display: "flex", gap: 8 }}>
						<div style={{ flex: 1 }}>
							<label style={p.sm}>
								W
								<input
									type="number"
									defaultValue={100}
									min={1}
									onChange={(e) => cmd("shapeWidth", e.target.value)}
									style={p.inp}
								/>
							</label>
						</div>
						<div style={{ flex: 1 }}>
							<label style={p.sm}>
								H
								<input
									type="number"
									defaultValue={60}
									min={1}
									onChange={(e) => cmd("shapeHeight", e.target.value)}
									style={p.inp}
								/>
							</label>
						</div>
					</div>
					<div style={{ display: "flex", gap: 8 }}>
						<div style={{ flex: 1 }}>
							<label style={p.sm}>
								X
								<input
									type="number"
									defaultValue={0}
									onChange={(e) => cmd("shapeX", e.target.value)}
									style={p.inp}
								/>
							</label>
						</div>
						<div style={{ flex: 1 }}>
							<label style={p.sm}>
								Y
								<input
									type="number"
									defaultValue={0}
									onChange={(e) => cmd("shapeY", e.target.value)}
									style={p.inp}
								/>
							</label>
						</div>
					</div>
				</div>
				<div style={p.sec}>
					<label style={p.chk}>
						<input
							type="checkbox"
							onChange={(e) =>
								cmd("shapeShadow", e.target.checked ? "true" : "false")
							}
						/>
						Shadow
					</label>
				</div>
				<button
					type="button"
					onClick={() => cmd("resetShapeFormat")}
					style={{
						width: "100%",
						padding: "6px 12px",
						border: "1px solid #ccc",
						borderRadius: 3,
						background: "#fff",
						cursor: "pointer",
						fontSize: 11,
						color: "#666",
					}}
				>
					Reset to Default
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
	inp: {
		width: "100%",
		padding: "3px 6px",
		border: "1px solid #ccc",
		borderRadius: 3,
		fontSize: 11,
		boxSizing: "border-box",
		marginTop: 1,
	},
	clr: {
		width: 30,
		height: 26,
		padding: 0,
		border: "1px solid #ccc",
		borderRadius: 3,
		cursor: "pointer",
	},
	chk: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		fontSize: 11,
		color: "#555",
		cursor: "pointer",
		marginBottom: 4,
	},
};
