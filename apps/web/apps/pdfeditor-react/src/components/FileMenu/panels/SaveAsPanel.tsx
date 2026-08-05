import { pdfStore } from "../../../stores/PdfStore"

export function SaveAsPanel({ visible }: { visible: boolean }) {
  async function handleExport(format: string): Promise<void> {
    if (format === "PDF") {
      void pdfStore.exportAsDownload()
      pdfStore.setFileMenuOpen(false)
      pdfStore.setActiveFileMenuPanel(null)
      return
    }

    if (format === "PNG") {
      await pdfStore.exportAsImage("png")
      pdfStore.setFileMenuOpen(false)
      pdfStore.setActiveFileMenuPanel(null)
      return
    }

    if (format === "JPG") {
      await pdfStore.exportAsImage("jpg")
      pdfStore.setFileMenuOpen(false)
      pdfStore.setActiveFileMenuPanel(null)
      return
    }

    alert(`Export to ${format} is not yet supported`)
  }

  function handleClose(): void {
    pdfStore.setActiveFileMenuPanel(null)
    pdfStore.setFileMenuOpen(false)
  }

  return (
    <div
      className="pdf-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="pdf-file-menu-header">Download as</div>
      <div className="pdf-file-menu-body">
        <p className="de-file-menu-instruction">Select a format to export the PDF.</p>
      </div>
      <div className="pdf-file-menu-saveas-formats">
        {["PDF"].map((format) => (
          <button
            key={format}
            type="button"
            className="pdf-file-menu-format-btn"
            onClick={() => handleExport(format)}
          >
            <div className="pdf-file-menu-format-icon">
              <span>{format}</span>
            </div>
          </button>
        ))}
        {["PNG", "JPG"].map((format) => (
          <button
            key={format}
            type="button"
            className="pdf-file-menu-format-btn"
            onClick={() => handleExport(format)}
          >
            <div className="pdf-file-menu-format-icon">
              <span>{format}</span>
            </div>
          </button>
        ))}
        {["PDF/A", "XPS", "DjVu"].map((format) => (
          <button
            key={format}
            type="button"
            className="pdf-file-menu-format-btn"
            disabled
            style={{ opacity: 0.5 }}
            onClick={() => {}}
          >
            <div className="pdf-file-menu-format-icon">
              <span>{format}</span>
            </div>
          </button>
        ))}
      </div>
      <div className="pdf-file-menu-footer">
        <button type="button" onClick={handleClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
