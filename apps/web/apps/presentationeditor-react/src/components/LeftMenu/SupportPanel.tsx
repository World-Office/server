/**
 * SupportPanel — left-menu "Support" toggle target (slide editor).
 *
 * Self-contained help surface: in-editor help + feature suggestions (the
 * File menu's Help/Suggest panes), the document facts support needs (title,
 * mode, language, modified state) and an external support page when the
 * deployment configured one (customization.feedback.url).
 */
import { observer } from "mobx-react-lite";
import { type JSX } from "react";
import { presentationStore } from "../../stores/PresentationStore";

/** Open a File-menu panel, closing the left rail first. */
function openFileMenuPanel(panel: string): void {
	presentationStore.setActiveLeftPanel(null);
	presentationStore.setFileMenuOpen(true);
	presentationStore.setActiveFileMenuPanel(panel);
}

function SupportPanelInner({ active }: { active: boolean }): JSX.Element {
	const feedbackUrl =
		presentationStore.mode?.customization.feedback?.url ?? null;
	const document = presentationStore.document;

	return (
		<div
			className="prese-left-panel prese-support-panel"
			style={{ display: active ? "flex" : "none" }}
			data-panel="support"
		>
			<div className="prese-left-panel-header">
				<span>Support</span>
			</div>
			<div className="prese-left-panel-body">
				<div className="prese-support-section">
					<div className="prese-support-section-title">Get help</div>
					<button
						type="button"
						className="prese-left-panel-btn prese-support-btn"
						onClick={() => openFileMenuPanel("help")}
						data-action="support-help"
					>
						Help &amp; How-tos
					</button>
					<button
						type="button"
						className="prese-left-panel-btn prese-support-btn"
						onClick={() => openFileMenuPanel("suggest")}
						data-action="support-suggest"
					>
						Suggest a Feature
					</button>
					{feedbackUrl && (
						<a
							className="prese-left-panel-btn prese-support-btn"
							href={feedbackUrl}
							target="_blank"
							rel="noreferrer noopener"
							data-action="support-external"
						>
							Open support page ↗
						</a>
					)}
				</div>

				<div className="prese-support-section">
					<div className="prese-support-section-title">Shortcuts</div>
					<button
						type="button"
						className="prese-left-panel-btn prese-support-btn"
						onClick={() => openFileMenuPanel("opts")}
						data-action="support-advanced"
					>
						Advanced Settings
					</button>
					<button
						type="button"
						className="prese-left-panel-btn prese-support-btn"
						onClick={() => openFileMenuPanel("history")}
						data-action="support-history"
					>
						Version History
					</button>
				</div>

				<div className="prese-support-section">
					<div className="prese-support-section-title">About this document</div>
					<dl className="prese-support-facts">
						<dt>Name</dt>
						<dd>{document?.title ?? "Untitled"}</dd>
						<dt>Mode</dt>
						<dd>{presentationStore.isEditMode ? "Editing" : "View only"}</dd>
						<dt>Language</dt>
						<dd>{presentationStore.languageCode}</dd>
						<dt>Slides</dt>
						<dd>{presentationStore.slides.length}</dd>
						<dt>Unsaved changes</dt>
						<dd>{presentationStore.isModified ? "Yes" : "No"}</dd>
					</dl>
				</div>

				<div className="prese-support-section">
					<div className="prese-support-section-title">Save your work</div>
					<button
						type="button"
						className="prese-left-panel-btn prese-support-btn"
						onClick={() => {
							presentationStore.setActiveLeftPanel(null);
							void presentationStore.saveToWopi();
						}}
						data-action="support-save"
					>
						Save now
					</button>
				</div>

				<div className="prese-left-panel-muted prese-left-panel-footnote">
					World Office Presentation (React) — support entries live in this
					editor, so they work offline too.
				</div>
			</div>
		</div>
	);
}

export const SupportPanel = observer(SupportPanelInner);
