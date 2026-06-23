export function RecentFilesPanel({ visible }: { visible: boolean }) {
	return (
		<div
			className="se-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="se-file-menu-header">Recent Files</div>
			<div className="se-file-menu-formats">
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					File1.xlsx
				</button>
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					File2.xlsx
				</button>
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					File3.xlsx
				</button>
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					File4.xlsx
				</button>
			</div>
		</div>
	);
}
