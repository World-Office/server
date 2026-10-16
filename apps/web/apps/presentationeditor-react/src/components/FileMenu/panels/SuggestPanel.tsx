import type { JSX } from "react";

/**
 * File → Suggest Feature — the entry used to just close the menu; it now opens
 * a real surface (the sheet editor's twin panel) offering the feedback /
 * bug-report / support entry points.
 */
export function SuggestPanel({ visible }: { visible: boolean }): JSX.Element {
	return (
		<div
			className="prese-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="prese-file-menu-header">Suggest a Feature</div>
			<div className="prese-file-menu-body">
				<p className="prese-file-menu-instruction">
					Tell us what the presentation editor should do next.
				</p>
			</div>
			<div className="prese-file-menu-formats">
				<button
					type="button"
					className="prese-file-menu-format-btn"
					onClick={() => {}}
				>
					Submit Feedback
				</button>
				<button
					type="button"
					className="prese-file-menu-format-btn"
					onClick={() => {}}
				>
					Report a Bug
				</button>
				<button
					type="button"
					className="prese-file-menu-format-btn"
					onClick={() => {}}
				>
					Contact Support
				</button>
			</div>
		</div>
	);
}
