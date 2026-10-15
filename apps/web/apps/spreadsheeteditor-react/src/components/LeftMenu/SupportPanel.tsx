/**
 * SupportPanel — left-menu "Support" toggle target.
 *
 * Self-contained help surface: in-editor help + feature suggestions (the
 * File menu's Help/Suggest panes), the document facts support needs
 * (title, mode, language, modified state), and an external support page
 * when the deployment configured one (customization.feedback.url).
 */
import { observer } from "mobx-react-lite";
import { type JSX } from "react";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";

/** Open a File-menu panel, closing the left rail first. */
function openFileMenuPanel(panel: string): void {
	spreadsheetStore.setActiveLeftPanel(null);
	spreadsheetStore.setFileMenuOpen(true);
	spreadsheetStore.setActiveFileMenuPanel(panel);
}

interface SupportPanelProps {
	active: boolean;
}

function SupportPanelInner({ active }: SupportPanelProps): JSX.Element {
	const feedbackUrl =
		spreadsheetStore.mode?.customization.feedback?.url ?? null;
	const document = spreadsheetStore.document;

	return (
		<div
			className="se-left-panel se-support-panel"
			style={{ display: active ? "flex" : "none" }}
			data-panel="support"
		>
			<div className="se-left-panel-header">
				<span>Support</span>
			</div>
			<div className="se-left-panel-body">
				<div className="se-support-section">
					<div className="se-support-section-title">Get help</div>
					<button
						type="button"
						className="se-left-panel-btn se-support-btn"
						onClick={() => openFileMenuPanel("help")}
						data-action="support-help"
					>
						Help &amp; How-tos
					</button>
					<button
						type="button"
						className="se-left-panel-btn se-support-btn"
						onClick={() => openFileMenuPanel("suggest")}
						data-action="support-suggest"
					>
						Suggest a Feature
					</button>
					{feedbackUrl && (
						<a
							className="se-left-panel-btn se-support-btn"
							href={feedbackUrl}
							target="_blank"
							rel="noreferrer noopener"
							data-action="support-external"
						>
							Open support page ↗
						</a>
					)}
				</div>

				<div className="se-support-section">
					<div className="se-support-section-title">About this document</div>
					<dl className="se-support-facts">
						<dt>Name</dt>
						<dd>{document?.title ?? "Untitled"}</dd>
						<dt>Mode</dt>
						<dd>{spreadsheetStore.isEditMode ? "Editing" : "View only"}</dd>
						<dt>Language</dt>
						<dd>{spreadsheetStore.languageCode}</dd>
						<dt>Unsaved changes</dt>
						<dd>{spreadsheetStore.isModified ? "Yes" : "No"}</dd>
					</dl>
				</div>

				<div className="se-support-section">
					<div className="se-support-section-title">Save your work</div>
					<button
						type="button"
						className="se-left-panel-btn se-support-btn"
						onClick={() => {
							spreadsheetStore.setActiveLeftPanel(null);
							void spreadsheetStore.saveToWopi();
						}}
						data-action="support-save"
					>
						Save now
					</button>
				</div>

				<div className="se-left-panel-muted se-left-panel-footnote">
					World Office Spreadsheet (React) — support entries live in this
					editor, so they work offline too.
				</div>
			</div>
		</div>
	);
}

export const SupportPanel = observer(SupportPanelInner);
