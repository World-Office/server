/**
 * AboutPanel — content for the left-menu "About" overlay (PDF editor).
 *
 * Fills the `.pdf-about-menu-panel` overlay Viewport toggles next to the left
 * rail — it used to be an empty div, so the About button painted a blank pane
 * over the document.
 */
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { pdfStore } from "../../stores/PdfStore"

function AboutPanelInner(): JSX.Element {
  const document = pdfStore.document

  return (
    <div className="pdf-about-panel" data-panel="about">
      <div className="pdf-left-panel-header">
        <span>About</span>
        <button
          type="button"
          className="pdf-left-panel-btn"
          onClick={() => pdfStore.setActiveLeftPanel(null)}
          data-action="about-close"
        >
          Close
        </button>
      </div>
      <div className="pdf-left-panel-body">
        <div className="pdf-about-title">World Office PDF</div>
        <div className="pdf-left-panel-muted">React edition — pdf.js viewer engine</div>
        <dl className="pdf-support-facts">
          <dt>Document</dt>
          <dd>{document?.title ?? "Untitled"}</dd>
          <dt>File type</dt>
          <dd>{document?.fileType ?? "pdf"}</dd>
          <dt>Pages</dt>
          <dd>{pdfStore.pageCount || "—"}</dd>
          <dt>Mode</dt>
          <dd>{pdfStore.isEditMode ? "Editing" : "View only"}</dd>
          <dt>Annotations</dt>
          <dd>{pdfStore.annotations.length}</dd>
          <dt>Comments</dt>
          <dd>{pdfStore.commentCount}</dd>
        </dl>
        <div className="pdf-left-panel-muted pdf-left-panel-footnote">
          Licensed under AGPL-3.0-or-later.
        </div>
      </div>
    </div>
  )
}

export const AboutPanel = observer(AboutPanelInner)
