import { useState } from "react"
import { saveFile } from "../../../bridge/file-operations"
import { buildFormDocx, convertFromHtml, downloadBlob } from "../../../lib/conversion"
import { documentStore } from "../../../stores/DocumentStore"

interface FormatOption {
  id: string
  label: string
  extension: string
  description: string
  /** Real file extension when the format id is a virtual alias ("form"). */
  fileType?: string
  /** Accessible label for screen readers / tests. */
  ariaLabel?: string
}

const EXPORT_FORMATS: FormatOption[] = [
  { id: "docx", label: "DOCX", extension: ".docx", description: "Word Document" },
  {
    id: "form",
    label: "Form",
    extension: ".docx",
    fileType: "docx",
    description: "Fillable Form (DOCX with content controls)",
    ariaLabel: "Save as Form",
  },
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

  // Source of truth for export: the live canvas document (via
  // buildDocumentBlob → canvasSerializer.serialize_document), NOT the
  // load-time richTextHtml snapshot — canvas edits never touch richTextHtml
  // (same class of bug as the production "save drops typed edits" incident
  // fixed in buildDocumentBlob). Only formats the canvas cannot produce
  // (pdf/txt/… via html conversion) fall back to the snapshot.
  // ponytail: non-docx formats still convert from the load-time HTML; make
  // them canvas-truth when wasm gains docx→html export.
  async function exportSource(format: FormatOption): Promise<Blob> {
    if (format.id === "docx") {
      return await documentStore.buildDocumentBlob()
    }
    if (format.id === "form") {
      // Save Form (.docxf-equivalent): the canvas OOXML writer flattens
      // form controls to plain text, so the HTML snapshot — which carries
      // the data-content-control spans — is the only source that can be
      // mapped to Word content controls (see buildFormDocx).
      if (!documentStore.richTextHtml) {
        throw new Error("No document content to export")
      }
      return buildFormDocx(documentStore.richTextHtml)
    }
    if (!documentStore.richTextHtml) {
      throw new Error("No document content to export")
    }
    return await convertFromHtml(documentStore.richTextHtml, format.id)
  }

  async function handleExport(format: FormatOption): Promise<void> {
    if (!documentStore.richTextHtml) {
      setError("No document content to export")
      return
    }

    if (documentStore.isDesktop) {
      const defaultName = documentStore.fileName
        ? documentStore.fileName.replace(/\.[^.]+$/, format.extension)
        : `Untitled${format.extension}`
      const isBinary = ["docx", "form", "odt", "epub", "fb2"].includes(format.id)
      setConverting(format.id)
      setError(null)
      try {
        const blob = await exportSource(format)
        let content: string
        if (isBinary) {
          const bytes = new Uint8Array(await blob.arrayBuffer())
          content = btoa(String.fromCharCode(...bytes))
        } else {
          content = await blob.text()
        }
        const result = await saveFile(content, {
          defaultPath: defaultName,
          filters: [{ name: format.description, extensions: [format.fileType ?? format.id] }],
          binary: isBinary,
        })
        if (result) {
          documentStore.setFilePath(result.path)
          documentStore.markSaved()
          documentStore.setActiveFileMenuPanel(null)
          documentStore.setFileMenuOpen(false)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed")
      } finally {
        setConverting(null)
      }
      return
    }

    setConverting(format.id)
    setError(null)

    try {
      const blob = await exportSource(format)
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
            aria-label={format.ariaLabel ?? format.description}
            disabled={converting === format.id}
            onClick={() => handleExport(format)}
          >
            {converting === format.id ? "Exporting…" : format.label}
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
