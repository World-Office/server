export function HelpPanel({ visible }: { visible: boolean }) {
	return (
		<div
			className="visio-file-menu-content-box"
			style={{
				display: visible ? "block" : "none",
				padding: 0,
				overflowY: "hidden",
			}}
		>
			<div className="visio-file-menu-header">Help</div>
			<div className="visio-file-menu-help-content">
				<p>
					Visit the World Office documentation for detailed guides and
					tutorials.
				</p>
			</div>
		</div>
	);
}
