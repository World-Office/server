export function DocumentRightsPanel({ visible }: { visible: boolean }) {
	return (
		<div
			className="se-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="se-file-menu-header">Access Rights</div>
			<div className="se-file-menu-formats">
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					Owner
				</button>
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					Group
				</button>
			</div>
		</div>
	);
}
