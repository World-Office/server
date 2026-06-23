export function ProtectPanel({ visible }: { visible: boolean }) {
	return (
		<div
			className="se-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="se-file-menu-header">Protect Workbook</div>
			<div className="se-file-menu-formats">
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					Protect Sheet
				</button>
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					Protect Workbook
				</button>
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					Protect Structure
				</button>
			</div>
		</div>
	);
}
