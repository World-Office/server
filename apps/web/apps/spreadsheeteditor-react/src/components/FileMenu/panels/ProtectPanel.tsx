import { useEffect, useState } from "react";
import { spreadsheetStore } from "../../../stores/SpreadsheetStore";

/**
 * File → Protect Document — restrict editing + password protection.
 * Calls /api/documents/{id}/protect (same endpoint as the document editor).
 * F-146: sheet protection model lives in wo-sheet (SheetProtection,
 * EditRange, per-user exemptions); this panel is the UX surface.
 */
export function ProtectPanel({ visible }: { visible: boolean }) {
	const [restrict, setRestrict] = useState(false);
	const [newPw, setNewPw] = useState("");
	const [curPw, setCurPw] = useState("");
	const [clearPw, setClearPw] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!visible) return;
		setStatus(null);
		setError(null);
		spreadsheetStore.refreshProtectionState().then(() => {
			setRestrict(spreadsheetStore.protectionState.restrict_editing);
			setNewPw("");
			setCurPw("");
			setClearPw(false);
			setError(spreadsheetStore.protectionError);
		});
	}, [visible]);

	const pwOn = spreadsheetStore.protectionState.password_set;

	async function handleApply(): Promise<void> {
		setBusy(true);
		setError(null);
		const result = await spreadsheetStore.applyProtection({
			restrict_editing: restrict,
			password: !clearPw && newPw ? newPw : null,
			clear_password: clearPw,
			current_password: curPw || null,
		});
		setBusy(false);
		if (!result.ok) {
			setError(result.error || "protection failed");
			return;
		}
		setStatus(
			spreadsheetStore.protectionState.restrict_editing
				? "Protection enabled"
				: "Protection removed",
		);
		setNewPw("");
		setCurPw("");
		setClearPw(false);
	}

	function handleClose(): void {
		spreadsheetStore.setActiveFileMenuPanel(null);
		spreadsheetStore.setFileMenuOpen(false);
	}

	return (
		<div
			className="se-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="se-file-menu-header">Protect Workbook</div>
			<div className="se-file-menu-body">
				<p className="se-file-menu-instruction">
					{pwOn
						? "Password protected. Enter current password to change."
						: "Restrict editing and optionally set a password."}
				</p>
				<label className="se-file-menu-check">
					<input
						type="checkbox"
						checked={restrict}
						onChange={(e) => setRestrict(e.target.checked)}
					/>
					<span>Restrict editing (read only)</span>
				</label>
				<div className="dialog-field">
					<label htmlFor="protect-new-password">New password</label>
					<input
						id="protect-new-password"
						type="password"
						autoComplete="new-password"
						value={newPw}
						onChange={(e) => setNewPw(e.target.value)}
						disabled={clearPw}
					/>
				</div>
				{pwOn && (
					<div className="dialog-field">
						<label htmlFor="protect-current-password">Current password</label>
						<input
							id="protect-current-password"
							type="password"
							autoComplete="current-password"
							value={curPw}
							onChange={(e) => setCurPw(e.target.value)}
						/>
					</div>
				)}
				{pwOn && (
					<label className="se-file-menu-check">
						<input
							type="checkbox"
							checked={clearPw}
							onChange={(e) => {
								setClearPw(e.target.checked);
								if (e.target.checked) setNewPw("");
							}}
						/>
						<span>Remove password</span>
					</label>
				)}
			</div>
			<div className="se-file-menu-footer">
				<button
					type="button"
					className="se-file-menu-primary-btn"
					disabled={busy}
					onClick={handleApply}
				>
					{busy ? "Applying…" : "Apply"}
				</button>
				<button type="button" onClick={handleClose}>
					Close
				</button>
			</div>
			{error && (
				<p className="se-file-menu-error" role="alert">
					{error}
				</p>
			)}
			{status && !error && <p className="se-file-menu-status">{status}</p>}
		</div>
	);
}
