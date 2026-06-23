export function SuggestPanel({ visible }: { visible: boolean }) {
	return (
		<div
			className="se-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="se-file-menu-header">Suggest a Feature</div>
			<div className="se-file-menu-formats">
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					Submit Feedback
				</button>
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					Report a Bug
				</button>
				<button
					type="button"
					className="se-file-menu-format-btn"
					onClick={() => {}}
				>
					Contact Support
				</button>
			</div>
		</div>
	);
}
