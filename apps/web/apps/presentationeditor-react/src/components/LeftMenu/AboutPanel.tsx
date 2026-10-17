/**
 * AboutPanel — content for the left-menu "About" overlay (slide editor).
 *
 * Fills the `.prese-about-menu-panel` overlay Viewport toggles next to the
 * left rail — it used to be an empty div, so the About button painted a
 * blank pane over the slide.
 */
import { observer } from "mobx-react-lite";
import { type JSX } from "react";
import { presentationStore } from "../../stores/PresentationStore";

function AboutPanelInner(): JSX.Element {
	const document = presentationStore.document;

	return (
		<div className="prese-about-panel" data-panel="about">
			<div className="prese-left-panel-header">
				<span>About</span>
				<button
					type="button"
					className="prese-left-panel-btn"
					onClick={() => presentationStore.setActiveLeftPanel(null)}
					data-action="about-close"
				>
					Close
				</button>
			</div>
			<div className="prese-left-panel-body">
				<div className="prese-about-title">World Office Presentation</div>
				<div className="prese-left-panel-muted">
					React edition — slide canvas engine
				</div>
				<dl className="prese-support-facts">
					<dt>Document</dt>
					<dd>{document?.title ?? "Untitled"}</dd>
					<dt>File type</dt>
					<dd>{document?.fileType ?? "pptx"}</dd>
					<dt>Mode</dt>
					<dd>{presentationStore.isEditMode ? "Editing" : "View only"}</dd>
					<dt>Language</dt>
					<dd>{presentationStore.languageCode}</dd>
					<dt>Slides</dt>
					<dd>{presentationStore.slides.length}</dd>
				</dl>
				<div className="prese-left-panel-muted prese-left-panel-footnote">
					Licensed under AGPL-3.0-or-later.
				</div>
			</div>
		</div>
	);
}

export const AboutPanel = observer(AboutPanelInner);
