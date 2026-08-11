/**
 * CellSettingsPanel — right menu panel for cell formatting in spreadsheet editor.
 * Controls for number format, alignment, font, borders, and fill.
 */
import { type JSX, useState } from "react";

interface CellSettingsPanelProps {
	visible: boolean;
}

const NUMBER_FORMATS = [
	{ id: "general", label: "General" },
	{ id: "number", label: "Number" },
	{ id: "currency", label: "Currency" },
	{ id: "accounting", label: "Accounting" },
	{ id: "date", label: "Date" },
	{ id: "time", label: "Time" },
	{ id: "percentage", label: "Percentage" },
	{ id: "fraction", label: "Fraction" },
	{ id: "scientific", label: "Scientific" },
	{ id: "text", label: "Text" },
];

export function CellSettingsPanel({
	visible,
}: CellSettingsPanelProps): JSX.Element | null {
	const [numFmt, setNumFmt] = useState("general");

	if (!visible) return null;

	function cmd(command: string, value?: string) {
		window.dispatchEvent(
			new CustomEvent("wo-command", { detail: { command, value } }),
		);
	}

	return (
		<div className="se-properties-panel" style={panelStyle}>
			<div style={headerStyle}>Cell Settings</div>
			<div style={bodyStyle}>
				<div style={{ marginBottom: 16 }}>
					<div style={sectionLabel}>Number Format</div>
					<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
						{NUMBER_FORMATS.map((nf) => (
							<button
								key={nf.id}
								type="button"
								onClick={() => {
									setNumFmt(nf.id);
									cmd("cellNumberFormat", nf.id);
								}}
								style={{
									padding: "3px 8px",
									border:
										numFmt === nf.id ? "1px solid #2b579a" : "1px solid #ddd",
									borderRadius: 3,
									background: numFmt === nf.id ? "#e8f0fe" : "#fff",
									cursor: "pointer",
									fontSize: 10,
									color: "#333",
								}}
							>
								{nf.label}
							</button>
						))}
					</div>
				</div>
				<div style={{ marginBottom: 16 }}>
					<div style={sectionLabel}>Decimal Places</div>
					<input
						type="number"
						defaultValue={2}
						min={0}
						max={10}
						onChange={(e) => cmd("cellDecimalPlaces", e.target.value)}
						style={fullInputStyle}
					/>
				</div>
				<div style={{ marginBottom: 16 }}>
					<div style={sectionLabel}>Horizontal Alignment</div>
					<div style={{ display: "flex", gap: 4 }}>
						{[
							["left", "Left", "⬅"],
							["center", "Center", "⬡"],
							["right", "Right", "➡"],
						].map(([id, label, icon]) => (
							<button
								key={id}
								type="button"
								onClick={() => cmd("cellHAlign", id)}
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
				<div style={{ marginBottom: 16 }}>
					<div style={sectionLabel}>Vertical Alignment</div>
					<div style={{ display: "flex", gap: 4 }}>
						{[
							["top", "Top", "↥"],
							["middle", "Middle", "↕"],
							["bottom", "Bottom", "↧"],
						].map(([id, label, icon]) => (
							<button
								key={id}
								type="button"
								onClick={() => cmd("cellVAlign", id)}
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
				<div style={{ marginBottom: 16 }}>
					<label style={checkStyle}>
						<input
							type="checkbox"
							onChange={(e) =>
								cmd("cellWrapText", e.target.checked ? "true" : "false")
							}
						/>
						Wrap text
					</label>
					<label style={checkStyle}>
						<input
							type="checkbox"
							onChange={(e) =>
								cmd("cellMerge", e.target.checked ? "true" : "false")
							}
						/>
						Merge cells
					</label>
				</div>
			</div>
		</div>
	);
}

const panelStyle: React.CSSProperties = {
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
};
const headerStyle: React.CSSProperties = {
	padding: "12px 16px",
	borderBottom: "1px solid #e0e0e0",
	fontWeight: 600,
	fontSize: 14,
	background: "#f8f9fa",
};
const bodyStyle: React.CSSProperties = {
	flex: 1,
	overflowY: "auto",
	padding: "12px 16px",
};
const sectionLabel: React.CSSProperties = {
	fontWeight: 600,
	fontSize: 12,
	color: "#666",
	textTransform: "uppercase",
	marginBottom: 8,
};
const fullInputStyle: React.CSSProperties = {
	width: "100%",
	padding: "4px 8px",
	border: "1px solid #ccc",
	borderRadius: 3,
	fontSize: 12,
	boxSizing: "border-box",
};
const checkStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 6,
	fontSize: 12,
	color: "#555",
	cursor: "pointer",
	marginBottom: 4,
};
