export function CreateNewPanel({ visible }: { visible: boolean }) {
	return (
		<div
			className="se-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="se-file-menu-header">Create New</div>
			<div className="se-file-menu-formats">
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					Blank Workbook
				</button>
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					Spreadsheet
				</button>
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					Form Template
				</button>
			</div>
		</div>
	);
}
