/**
 * SupportPanel — left-menu "Support" toggle target (PDF editor).
 *
 * Self-contained help surface: in-editor help + settings (the File menu's
 * Help/Settings panes), the document facts support needs (title, page count,
 * mode, modified state) and an external support page when the deployment
 * configured one (customization.feedback.url).
 */
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { pdfStore } from "../../stores/PdfStore"

/** Open a File-menu panel, closing the left rail first. */
function openFileMenuPanel(panel: string): void {
  pdfStore.setActiveLeftPanel(null)
  pdfStore.setFileMenuOpen(true)
  pdfStore.setActiveFileMenuPanel(panel)
}

function SupportPanelInner({ active }: { active: boolean }): JSX.Element {
  const feedbackUrl = pdfStore.mode?.customization.feedback?.url ?? null
  const document = pdfStore.document

  return (
    <div
      className="pdf-left-panel pdf-support-panel"
      style={{ display: active ? "flex" : "none" }}
      data-panel="support"
    >
      <div className="pdf-left-panel-header">
        <span>Support</span>
      </div>
      <div className="pdf-left-panel-body">
        <div className="pdf-support-section">
          <div className="pdf-support-section-title">Get help</div>
          <button
            type="button"
            className="pdf-left-panel-btn pdf-support-btn"
            onClick={() => openFileMenuPanel("help")}
            data-action="support-help"
          >
            Help &amp; How-tos
          </button>
          {feedbackUrl && (
            <a
              className="pdf-left-panel-btn pdf-support-btn"
              href={feedbackUrl}
              target="_blank"
              rel="noreferrer noopener"
              data-action="support-external"
            >
              Open support page ↗
            </a>
          )}
        </div>

        <div className="pdf-support-section">
          <div className="pdf-support-section-title">Document</div>
          <button
            type="button"
            className="pdf-left-panel-btn pdf-support-btn"
            onClick={() => openFileMenuPanel("info")}
            data-action="support-info"
          >
            Document Info
          </button>
          <button
            type="button"
            className="pdf-left-panel-btn pdf-support-btn"
            onClick={() => openFileMenuPanel("opts")}
            data-action="support-settings"
          >
            Advanced Settings
          </button>
          <button
            type="button"
            className="pdf-left-panel-btn pdf-support-btn"
            onClick={() => openFileMenuPanel("rename")}
            data-action="support-rename"
          >
            Rename…
          </button>
        </div>

        <div className="pdf-support-section">
          <div className="pdf-support-section-title">About this document</div>
          <dl className="pdf-support-facts">
            <dt>Name</dt>
            <dd>{document?.title ?? "Untitled"}</dd>
            <dt>File type</dt>
            <dd>{document?.fileType ?? "pdf"}</dd>
            <dt>Pages</dt>
            <dd>{pdfStore.pageCount || "—"}</dd>
            <dt>Mode</dt>
            <dd>{pdfStore.isEditMode ? "Editing" : "View only"}</dd>
            <dt>Annotations</dt>
            <dd>{pdfStore.annotations.length}</dd>
            <dt>Unsaved changes</dt>
            <dd>{pdfStore.isModified ? "Yes" : "No"}</dd>
          </dl>
        </div>

        <div className="pdf-support-section">
          <div className="pdf-support-section-title">Save your work</div>
          <button
            type="button"
            className="pdf-left-panel-btn pdf-support-btn"
            onClick={() => {
              pdfStore.setActiveLeftPanel(null)
              void pdfStore.saveToWopi()
            }}
            data-action="support-save"
          >
            Save now
          </button>
          <button
            type="button"
            className="pdf-left-panel-btn pdf-support-btn"
            onClick={() => {
              pdfStore.setActiveLeftPanel(null)
              void pdfStore.exportAsDownload()
            }}
            data-action="support-download"
          >
            Download a copy
          </button>
        </div>

        <div className="pdf-left-panel-muted pdf-left-panel-footnote">
          World Office PDF (React) — support entries live in this editor, so they
          work offline too.
        </div>
      </div>
    </div>
  )
}

export const SupportPanel = observer(SupportPanelInner)
