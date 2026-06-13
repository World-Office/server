import { saveFile } from "../../../bridge/file-operations"
import { documentStore } from "../../../stores/DocumentStore"

export function SaveAsPanel({ visible }: { visible: boolean }) {
  async function handleSaveAs(format: string): Promise<void> {
    if (!documentStore.isDesktop) return
    const defaultName = documentStore.filePath
      ? documentStore.filePath.replace(/\.[^.]+$/, `.${format.toLowerCase()}`)
      : `Untitled.${format.toLowerCase()}`
    const content = ""
    const isBinary = ["docx", "odt", "doc", "pdf", "epub", "fb2", "rtf"].includes(
      format.toLowerCase(),
    )
    const result = await saveFile(content, {
      defaultPath: defaultName,
      filters: [{ name: `${format} Document`, extensions: [format.toLowerCase()] }],
      binary: isBinary,
    })
    if (result) {
      documentStore.setFilePath(result.path)
      documentStore.markSaved()
      documentStore.setActiveFileMenuPanel(null)
      documentStore.setFileMenuOpen(false)
    }
  }

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="de-file-menu-header">
        {documentStore.isDesktop ? "Save as" : "Download as"}
      </div>
      <div className="de-file-menu-formats">
        {[
          "DOCX",
          "PDF",
          "ODT",
          "DOTX",
          "DOCM",
          "PDFA",
          "OTT",
          "MD",
          "RTF",
          "TXT",
          "FB2",
          "EPUB",
          "HTML",
          "JPG",
          "PNG",
        ].map((format) => (
          <button
            key={format}
            type="button"
            className="de-file-menu-format-btn"
            onClick={() => handleSaveAs(format)}
          >
            {format}
          </button>
        ))}
      </div>
    </div>
  )
}
