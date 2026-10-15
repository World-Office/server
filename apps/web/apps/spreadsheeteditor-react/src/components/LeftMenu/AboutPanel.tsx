/**
 * AboutPanel — content for the left-menu "About" overlay.
 *
 * Fills the `.se-about-menu-panel` overlay Viewport toggles next to the
 * left rail (it used to be an empty div: the About button painted a blank
 * pane over the sheet).
 */
import { observer } from "mobx-react-lite";
import { type JSX } from "react";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";

export function AboutPanelInner(): JSX.Element {
	const document = spreadsheetStore.document;

	return (
		<div className="se-about-panel" data-panel="about">
			<div className="se-left-panel-header">
				<span>About</span>
				<button
					type="button"
					className="se-left-panel-btn"
					onClick={() => spreadsheetStore.setActiveLeftPanel(null)}
					data-action="about-close"
				>
					Close
				</button>
			</div>
			<div className="se-left-panel-body">
				<div className="se-about-title">World Office Spreadsheet</div>
				<div className="se-left-panel-muted">
					React edition — Univer sheet engine
				</div>
				<dl className="se-support-facts">
					<dt>Document</dt>
					<dd>{document?.title ?? "Untitled"}</dd>
					<dt>File type</dt>
					<dd>{document?.fileType ?? "xlsx"}</dd>
					<dt>Mode</dt>
					<dd>{spreadsheetStore.isEditMode ? "Editing" : "View only"}</dd>
					<dt>Language</dt>
					<dd>{spreadsheetStore.languageCode}</dd>
					<dt>Sheets</dt>
					<dd>{spreadsheetStore.sheets.length || 1}</dd>
				</dl>
				<div className="se-left-panel-muted se-left-panel-footnote">
					Licensed under AGPL-3.0-or-later.
				</div>
			</div>
		</div>
	);
}

export const AboutPanel = observer(AboutPanelInner);
