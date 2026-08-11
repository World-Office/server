/** Signature settings panel for spreadsheet editor. */
import { type JSX, useState } from "react";
interface Props {
	visible: boolean;
}
export function SignatureSettingsPanel({ visible }: Props): JSX.Element | null {
	const [signed, setSigned] = useState(false);
	if (!visible) return null;
	function cmd(c: string, v?: string) {
		window.dispatchEvent(
			new CustomEvent("wo-command", { detail: { command: c, value: v } }),
		);
	}
	return (
		<div className="se-properties-panel" style={p.panel}>
			<div style={p.header}>Signature Settings</div>
			<div style={p.body}>
				{!signed ? (
					<>
						<p
							style={{
								fontSize: 12,
								color: "#555",
								marginBottom: 16,
								lineHeight: 1.5,
							}}
						>
							Add a digital signature to certify this spreadsheet.
						</p>
						<button
							type="button"
							onClick={() => {
								setSigned(true);
								cmd("addSignature");
							}}
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
								marginBottom: 12,
							}}
						>
							Add Signature
						</button>
						<div style={p.sec}>
							<div style={p.label}>Sign as</div>
							<input
								type="text"
								defaultValue="User Name"
								onChange={(e) => cmd("signatureName", e.target.value)}
								style={p.inp}
							/>
						</div>
						<div style={p.sec}>
							<div style={p.label}>Purpose</div>
							<select
								defaultValue="approval"
								onChange={(e) => cmd("signaturePurpose", e.target.value)}
								style={p.sel}
							>
								<option value="approval">Approval</option>
								<option value="review">Review</option>
								<option value="execution">Execution</option>
							</select>
						</div>
						<label style={p.chk}>
							<input
								type="checkbox"
								onChange={(e) =>
									cmd("signatureTimestamp", e.target.checked ? "true" : "false")
								}
							/>
							Include timestamp
						</label>
					</>
				) : (
					<div
						style={{
							padding: 12,
							background: "#f0f7f0",
							borderRadius: 4,
							border: "1px solid #b7e1b7",
						}}
					>
						<div
							style={{
								fontWeight: 600,
								fontSize: 13,
								color: "#2e7d32",
								marginBottom: 4,
							}}
						>
							✓ Signed
						</div>
						<div style={{ fontSize: 11, color: "#666" }}>
							Signed by User Name
						</div>
						<button
							type="button"
							onClick={() => cmd("removeSignature")}
							style={{
								marginTop: 8,
								padding: "4px 12px",
								border: "1px solid #ccc",
								borderRadius: 3,
								background: "#fff",
								cursor: "pointer",
								fontSize: 11,
								color: "#c62828",
							}}
						>
							Remove
						</button>
					</div>
				)}
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
