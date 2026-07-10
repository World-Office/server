import type { JSX } from "react";

export function HelpPanel({ visible }: { visible: boolean }): JSX.Element {
	return (
		<div
			className="prese-file-menu-content-box"
			style={{
				display: visible ? "block" : "none",
				padding: 0,
				overflowY: "hidden",
			}}
		>
			<div className="prese-file-menu-header">Help</div>
			<div className="prese-file-menu-help-content">
				<p>
					Visit the World Office documentation for detailed guides and
					tutorials.
				</p>
			</div>
		</div>
	);
}
