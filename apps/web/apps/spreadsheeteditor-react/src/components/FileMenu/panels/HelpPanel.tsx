export function HelpPanel({ visible }: { visible: boolean }) {
	return (
		<div
			className="se-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="se-file-menu-header">Help</div>
			<div className="se-file-menu-help-content">
				<p>
					Visit World Office documentation for detailed guides and tutorials.
				</p>
			</div>
		</div>
	);
}
