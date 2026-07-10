import type { JSX } from "react"

export function PrintPreviewPanel({ visible }: { visible: boolean }): JSX.Element {
  return (
    <div
      className="prese-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="prese-file-menu-header">Print Preview</div>
      <div className="prese-file-menu-body">
        <div className="prese-print-preview-container">
          <p className="prese-print-preview-instruction">
            Print preview of current slide or all slides.
          </p>
        </div>
        <div className="prese-print-preview-footer">
          <button type="button" onClick={() => {}}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
