import { documentStore } from "../../../stores/DocumentStore"

export function PrintPreviewPanel({ visible }: { visible: boolean }) {
  function handlePrint(): void {
    window.print()
    documentStore.setActiveFileMenuPanel(null)
    documentStore.setFileMenuOpen(false)
  }

  function handleClose(): void {
    documentStore.setActiveFileMenuPanel(null)
    documentStore.setFileMenuOpen(false)
  }

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="de-file-menu-header">Print Preview</div>
      <div className="de-file-menu-body">
        <div className="de-print-preview-container">
          <p className="de-print-preview-instruction">
            Click Print to open the system print dialog. The current document will be sent to your
            printer.
          </p>
        </div>
        <div className="de-print-preview-footer">
          <button type="button" onClick={handlePrint}>
            Print
          </button>
          <button type="button" onClick={handleClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
