/** Layers panel for Visio editor. */
import type { JSX } from "react";
const LAYERS = [
	{ id: "grid", name: "Grid", visible: true, locked: false },
	{ id: "background", name: "Background", visible: true, locked: false },
	{ id: "shapes", name: "Shapes", visible: true, locked: false },
	{ id: "connectors", name: "Connectors", visible: true, locked: true },
	{ id: "annotations", name: "Annotations", visible: false, locked: false },
];
interface Props {
	visible: boolean;
}
export function LayersPanel({ visible }: Props): JSX.Element | null {
	if (!visible) return null;
	function cmd(c: string, v?: string) {
		window.dispatchEvent(
			new CustomEvent("wo-command", { detail: { command: c, value: v } }),
		);
	}
	return (
		<div className="vi-properties-panel" style={p.panel}>
			<div style={p.header}>Layers</div>
			<div style={p.body}>
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					{LAYERS.map((l) => (
						<div
							key={l.id}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								padding: "6px 8px",
								border: "1px solid #eee",
								borderRadius: 3,
							}}
						>
							<div style={{ flex: 1, fontSize: 12, color: "#333" }}>
								{l.name}
							</div>
							<button
								type="button"
								onClick={() => cmd("toggleLayerVisibility", l.id)}
								style={{
									fontSize: 12,
									cursor: "pointer",
									background: "none",
									border: "none",
									padding: 2,
									color: l.visible ? "#2b579a" : "#ccc",
								}}
								title={l.visible ? "Visible" : "Hidden"}
							>
								👁
							</button>
							<button
								type="button"
								onClick={() => cmd("toggleLayerLock", l.id)}
								style={{
									fontSize: 12,
									cursor: "pointer",
									background: "none",
									border: "none",
									padding: 2,
									color: l.locked ? "#c62828" : "#ccc",
								}}
								title={l.locked ? "Locked" : "Unlocked"}
							>
								🔒
							</button>
						</div>
					))}
				</div>
				<button
					type="button"
					onClick={() => cmd("addLayer")}
					style={{
						width: "100%",
						padding: "6px 12px",
						border: "1px dashed #ccc",
						borderRadius: 3,
						background: "#fafafa",
						cursor: "pointer",
						fontSize: 11,
						color: "#2b579a",
						marginTop: 8,
					}}
				>
					+ New Layer
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
};
