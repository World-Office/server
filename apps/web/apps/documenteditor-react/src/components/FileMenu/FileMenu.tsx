import { type ExportFormat, ExportWizard } from "@world-office/editor-common"
import { useCallback } from "react"
import type { CSSProperties } from "react"
import { convertFromHtml, downloadBlob } from "../../lib/conversion"
import { documentStore } from "../../stores/DocumentStore"
import { FileMenuItems } from "./FileMenuItems"
import { CreateNewPanel } from "./panels/CreateNewPanel"
import { DocumentInfoPanel } from "./panels/DocumentInfoPanel"
import { FileBrowserPanel } from "./panels/FileBrowserPanel"
import { HelpPanel } from "./panels/HelpPanel"
import { PrintPreviewPanel } from "./panels/PrintPreviewPanel"
import { ProtectDocPanel } from "./panels/ProtectDocPanel"
import { RecentFilesPanel } from "./panels/RecentFilesPanel"
import { RightsPanel } from "./panels/RightsPanel"
import { SaveAsPanel } from "./panels/SaveAsPanel"
import { SaveCopyPanel } from "./panels/SaveCopyPanel"
import { SettingsPanel } from "./panels/SettingsPanel"
import { SharePanel } from "./panels/SharePanel"
import { VersionHistoryPanel } from "./panels/VersionHistoryPanel"

const panelContainerStyle: CSSProperties = {
  width: "100%",
  paddingLeft: "260px",
  backgroundColor: "var(--wo-color-bg-primary, #ffffff)",
}

const contentBoxBaseStyle: CSSProperties = {
  height: "100%",
  padding: "0 20px",
  position: "relative",
  overflow: "hidden",
  display: "none",
}

const DOCUMENT_FORMATS: ExportFormat[] = [
  { id: "docx", label: "DOCX", description: "Word Document", extension: ".docx" },
  { id: "odt", label: "ODT", description: "OpenDocument Text", extension: ".odt" },
  { id: "pdf", label: "PDF", description: "Portable Document Format", extension: ".pdf" },
  { id: "rtf", label: "RTF", description: "Rich Text Format", extension: ".rtf" },
  { id: "txt", label: "TXT", description: "Plain Text", extension: ".txt" },
  { id: "html", label: "HTML", description: "Web Page", extension: ".html" },
  { id: "epub", label: "EPUB", description: "Electronic Book", extension: ".epub" },
  { id: "fb2", label: "FB2", description: "FictionBook", extension: ".fb2" },
]

export function FileMenu() {
  const activePanel = documentStore.activeFileMenuPanel

  function handleMenuClick(action: string, hasPanel: boolean): void {
    if (hasPanel) {
      const newPanel = documentStore.activeFileMenuPanel === action ? null : action
      documentStore.setActiveFileMenuPanel(newPanel)
    } else {
      documentStore.setFileMenuOpen(false)
    }
  }

  function handleBack(): void {
    documentStore.setActiveFileMenuPanel(null)
    documentStore.setFileMenuOpen(false)
  }

  const handleExport = useCallback(async (format: ExportFormat): Promise<boolean> => {
    if (!documentStore.richTextHtml) return false
    try {
      const blob = await convertFromHtml(documentStore.richTextHtml, format.id)
      const fileName = documentStore.fileName
        ? documentStore.fileName.replace(/\.[^.]+$/, format.extension)
        : `Untitled${format.extension}`
      downloadBlob(blob, fileName)
      return true
    } catch {
      return false
    }
  }, [])

  return (
    <div className="de-file-menu">
      <div className="de-file-menu-list" role="menubar" aria-label="File menu">
        <FileMenuItems onMenuClick={handleMenuClick} onBack={handleBack} />
      </div>
      <div style={panelContainerStyle}>
        <div className="de-file-menu-panel-box" style={contentBoxBaseStyle}>
          <SaveAsPanel visible={activePanel === "saveas"} />
          <SaveCopyPanel visible={activePanel === "save-copy"} />
          <RecentFilesPanel visible={activePanel === "recent"} />
          <CreateNewPanel visible={activePanel === "create-new"} />
          <FileBrowserPanel visible={activePanel === "browse"} />
          <DocumentInfoPanel visible={activePanel === "info"} />
          <RightsPanel visible={activePanel === "rights"} />
          <SettingsPanel visible={activePanel === "opts"} />
          <HelpPanel visible={activePanel === "help"} />
          <ProtectDocPanel visible={activePanel === "protect"} />
          <PrintPreviewPanel visible={activePanel === "printpreview"} />
          <SharePanel visible={activePanel === "share"} />
          <VersionHistoryPanel visible={activePanel === "history"} />
        </div>
      </div>

      {activePanel === "export" && (
        <ExportWizard
          visible
          groups={[{ heading: "Document", formats: DOCUMENT_FORMATS }]}
          onExport={handleExport}
          onClose={() => documentStore.setActiveFileMenuPanel(null)}
        />
      )}
    </div>
  )
}
