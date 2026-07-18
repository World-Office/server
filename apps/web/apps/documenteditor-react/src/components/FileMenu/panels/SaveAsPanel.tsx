import { useState } from "react"
import { saveFile } from "../../../bridge/file-operations"
import { convertFromHtml, downloadBlob } from "../../../lib/conversion"
import { documentStore } from "../../../stores/DocumentStore"

interface FormatOption {
  id: string
  label: string
  extension: string
  description: string
}

const EXPORT_FORMATS: FormatOption[] = [
  { id: "docx", label: "DOCX", extension: ".docx", description: "Word Document" },
  { id: "odt", label: "ODT", extension: ".odt", description: "OpenDocument Text" },
  { id: "rtf", label: "RTF", extension: ".rtf", description: "Rich Text Format" },
  { id: "txt", label: "TXT", extension: ".txt", description: "Plain Text" },
  { id: "html", label: "HTML", extension: ".html", description: "Web Page" },
  { id: "epub", label: "EPUB", extension: ".epub", description: "Electronic Book" },
  { id: "fb2", label: "FB2", extension: ".fb2", description: "FictionBook" },
]

export function SaveAsPanel({ visible }: { visible: boolean }) {
  const [converting, setConverting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleExport(format: FormatOption): Promise<void> {
    if (!documentStore.richTextHtml) {
      setError("No document content to export")
      return
    }

    if (documentStore.isDesktop) {
      const defaultName = documentStore.fileName
        ? documentStore.fileName.replace(/\.[^.]+$/, format.extension)
        : `Untitled${format.extension}`
      const isBinary = ["docx", "odt", "epub", "fb2"].includes(format.id)
      const result = await saveFile("", {
        defaultPath: defaultName,
        filters: [{ name: format.description, extensions: [format.id] }],
        binary: isBinary,
      })
      if (result) {
        documentStore.setFilePath(result.path)
        documentStore.markSaved()
        documentStore.setActiveFileMenuPanel(null)
        documentStore.setFileMenuOpen(false)
      }
      return
    }

    setConverting(format.id)
    setError(null)

    try {
      const blob = await convertFromHtml(documentStore.richTextHtml, format.id)
      const fileName = documentStore.fileName
        ? documentStore.fileName.replace(/\.[^.]+$/, format.extension)
        : `Untitled${format.extension}`
      downloadBlob(blob, fileName)
      documentStore.setActiveFileMenuPanel(null)
      documentStore.setFileMenuOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setConverting(null)
    }
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
      <div className="de-file-menu-header">
        {documentStore.isDesktop ? "Save as" : "Download as"}
      </div>
      <div className="de-file-menu-body">
        <p className="de-file-menu-instruction">Select a format to export the document.</p>
      </div>

      {error && (
        <div className="de-file-menu-body">
          <p
            className="de-file-menu-instruction"
            style={{ color: "var(--wo-color-error, #cc0000)" }}
          >
            {error}
          </p>
        </div>
      )}

      <div className="de-file-menu-formats">
        {EXPORT_FORMATS.map((format) => (
          <button
            key={format.id}
            type="button"
            className="de-file-menu-format-btn"
            disabled={converting === format.id}
            onClick={() => handleExport(format)}
          >
            {converting === format.id ? `Exporting…` : format.label}
          </button>
        ))}
      </div>

      <div className="de-file-menu-footer">
        <button type="button" onClick={handleClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
