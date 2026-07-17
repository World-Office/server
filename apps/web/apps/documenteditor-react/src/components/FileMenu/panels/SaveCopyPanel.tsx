import { documentStore } from "../../../stores/DocumentStore"

export function SaveCopyPanel({ visible }: { visible: boolean }) {
  function handleClose(): void {
    documentStore.setActiveFileMenuPanel(null)
    documentStore.setFileMenuOpen(false)
  }

  function handleSaveCopy(): void {
    documentStore.exportAsDownload()
    handleClose()
  }

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="de-file-menu-header">Save Copy as</div>
      <div className="de-file-menu-body">
        <p className="de-file-menu-instruction">
          Download a copy of <strong>{documentStore.fileName}</strong> to your device.
        </p>
      </div>
      <div className="de-file-menu-footer">
        <button type="button" onClick={handleSaveCopy}>
          Download Copy
        </button>
        <button type="button" onClick={handleClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
