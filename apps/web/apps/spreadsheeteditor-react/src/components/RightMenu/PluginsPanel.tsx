/** Plugins panel for spreadsheet editor. */
import { type JSX, useState } from "react";
interface Props {
	visible: boolean;
}
const PLUGINS = [
	{
		id: "spellcheck",
		name: "Spell Checker",
		desc: "Real-time spell checking",
		enabled: true,
	},
	{
		id: "autocalc",
		name: "Auto Calculate",
		desc: "Auto-recalculate formulas",
		enabled: true,
	},
	{
		id: "audit",
		name: "Formula Audit",
		desc: "Trace precedents and dependents",
		enabled: false,
	},
	{
		id: "solver",
		name: "Solver Add-in",
		desc: "What-if analysis tool",
		enabled: false,
	},
];
export function PluginsPanel({ visible }: Props): JSX.Element | null {
	const [plugins, setPlugins] = useState(PLUGINS);
	if (!visible) return null;
	function toggle(id: string) {
		setPlugins((prev) =>
			prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
		);
		window.dispatchEvent(
			new CustomEvent("wo-command", {
				detail: { command: "togglePlugin", value: id },
			}),
		);
	}
	return (
		<div className="se-properties-panel" style={p.panel}>
			<div style={p.header}>Plugins</div>
			<div style={p.body}>
				<p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
					Enable or disable spreadsheet plugins.
				</p>
				<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					{plugins.map((pl) => (
						<div
							key={pl.id}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								padding: "8px 10px",
								border: "1px solid #eee",
								borderRadius: 4,
								background: pl.enabled ? "#fafafa" : "#fff",
							}}
						>
							<div style={{ flex: 1 }}>
								<div
									style={{
										fontWeight: 600,
										fontSize: 12,
										color: "#333",
										marginBottom: 2,
									}}
								>
									{pl.name}
								</div>
								<div style={{ fontSize: 11, color: "#888" }}>{pl.desc}</div>
							</div>
							<label
								style={{
									position: "relative",
									display: "inline-block",
									width: 36,
									height: 20,
									cursor: "pointer",
								}}
							>
								<input
									type="checkbox"
									checked={pl.enabled}
									onChange={() => toggle(pl.id)}
									style={{
										opacity: 0,
										width: 0,
										height: 0,
										position: "absolute",
									}}
								/>
								<span
									style={{
										position: "absolute",
										inset: 0,
										background: pl.enabled ? "#2b579a" : "#ccc",
										borderRadius: 20,
										transition: "background 0.2s",
									}}
								>
									<span
										style={{
											position: "absolute",
											top: 2,
											left: pl.enabled ? 18 : 2,
											width: 16,
											height: 16,
											background: "#fff",
											borderRadius: "50%",
											transition: "left 0.2s",
										}}
									/>
								</span>
							</label>
						</div>
					))}
				</div>
				<button
					type="button"
					onClick={() =>
						window.dispatchEvent(
							new CustomEvent("wo-command", {
								detail: { command: "openPluginStore" },
							}),
						)
					}
					style={{
						width: "100%",
						padding: "8px 16px",
						border: "1px dashed #ccc",
						borderRadius: 4,
						background: "#fafafa",
						cursor: "pointer",
						fontSize: 12,
						color: "#2b579a",
						marginTop: 12,
					}}
				>
					+ Browse Plugin Store
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
};
