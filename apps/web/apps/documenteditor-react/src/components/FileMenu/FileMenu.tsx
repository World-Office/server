import { makeStyles, tokens } from "@fluentui/react-components"
import { type EmailConfig, type ExportFormat, ExportWizard } from "@world-office/editor-common"
import { useCallback } from "react"
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

const useStyles = makeStyles({
  root: {
    display: "flex",
    width: "100%",
    height: "100%",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    width: "260px",
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    overflowY: "auto",
    userSelect: "none",
  },
  panelContainer: {
    width: "100%",
    paddingLeft: "260px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  panelBox: {
    height: "100%",
    padding: "0 20px",
    position: "relative",
    overflow: "hidden",
    display: "none",
  },
})

const DOCUMENT_FORMATS: ExportFormat[] = [
  {
    id: "docx",
    label: "DOCX",
    description: "Word Document",
    extension: ".docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    id: "odt",
    label: "ODT",
    description: "OpenDocument Text",
    extension: ".odt",
    mimeType: "application/vnd.oasis.opendocument.text",
  },
  {
    id: "pdf",
    label: "PDF",
    description: "Portable Document Format",
    extension: ".pdf",
    mimeType: "application/pdf",
  },
  {
    id: "rtf",
    label: "RTF",
    description: "Rich Text Format",
    extension: ".rtf",
    mimeType: "application/rtf",
  },
  { id: "txt", label: "TXT", description: "Plain Text", extension: ".txt", mimeType: "text/plain" },
  { id: "html", label: "HTML", description: "Web Page", extension: ".html", mimeType: "text/html" },
  {
    id: "epub",
    label: "EPUB",
    description: "Electronic Book",
    extension: ".epub",
    mimeType: "application/epub+zip",
  },
  {
    id: "fb2",
    label: "FB2",
    description: "FictionBook",
    extension: ".fb2",
    mimeType: "application/x-fictionbook+xml",
  },
]

export function FileMenu() {
  const styles = useStyles()
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

  const emailConfig: EmailConfig = {
    endpoint: "/api/send-email-attachment",
    async produceAttachment(formatId: string) {
      if (!documentStore.richTextHtml) return null
      const blob = await convertFromHtml(documentStore.richTextHtml, formatId)
      const ext = DOCUMENT_FORMATS.find((f) => f.id === formatId)?.extension ?? `.${formatId}`
      const fileName = documentStore.fileName
        ? documentStore.fileName.replace(/\.[^.]+$/, ext)
        : `Document${ext}`
      const mimeType =
        DOCUMENT_FORMATS.find((f) => f.id === formatId)?.mimeType ?? "application/octet-stream"
      return { blob, fileName, mimeType }
    },
    defaultSubject: "Document: {{fileName}}",
  }

  return (
    <div className={styles.root}>
      <div className={styles.sidebar} role="menubar" aria-label="File menu">
        <FileMenuItems onMenuClick={handleMenuClick} onBack={handleBack} />
      </div>
      <div className={styles.panelContainer}>
        <div className={styles.panelBox}>
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
          emailConfig={emailConfig}
          onClose={() => documentStore.setActiveFileMenuPanel(null)}
        />
      )}
    </div>
  )
}
