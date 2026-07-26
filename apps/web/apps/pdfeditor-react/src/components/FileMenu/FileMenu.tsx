import { type ExportFormat, ExportWizard } from "@world-office/editor-common"
import { useCallback } from "react"
import type { CSSProperties } from "react"
import { pdfStore } from "../../stores/PdfStore"
import { FileMenuItems } from "./FileMenuItems"
import { CreateNewPanel } from "./panels/CreateNewPanel"
import { DocumentInfoPanel } from "./panels/DocumentInfoPanel"
import { HelpPanel } from "./panels/HelpPanel"
import { SaveAsPanel } from "./panels/SaveAsPanel"
import { SettingsPanel } from "./panels/SettingsPanel"

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

export function FileMenu() {
  const activePanel = pdfStore.activeFileMenuPanel

  function handleMenuClick(action: string, hasPanel: boolean): void {
    if (hasPanel) {
      const newPanel = pdfStore.activeFileMenuPanel === action ? null : action
      pdfStore.setActiveFileMenuPanel(newPanel)
    }
  }

  function handleBack(): void {
    pdfStore.setActiveFileMenuPanel(null)
    pdfStore.setFileMenuOpen(false)
  }

  const PDF_FORMATS: ExportFormat[] = [
    { id: "pdf", label: "PDF", description: "Portable Document Format", extension: ".pdf" },
  ]

  const handleExport = useCallback(async (_format: ExportFormat): Promise<boolean> => {
    try {
      await pdfStore.exportAsDownload()
      return true
    } catch {
      return false
    }
  }, [])

  return (
    <div className="pdf-file-menu">
      <div className="pdf-file-menu-list" role="menubar" aria-label="File menu">
        <FileMenuItems onMenuClick={handleMenuClick} onBack={handleBack} />
      </div>
      <div style={panelContainerStyle}>
        <div className="pdf-file-menu-panel-box" style={contentBoxBaseStyle}>
          <CreateNewPanel visible={activePanel === "new"} />
          <SaveAsPanel visible={activePanel === "saveas"} />
          <SettingsPanel visible={activePanel === "opts"} />
          <DocumentInfoPanel visible={activePanel === "info"} />
          <HelpPanel visible={activePanel === "help"} />
          <PrintPreviewPanel visible={activePanel === "printpreview"} />
        </div>
      </div>

      {activePanel === "export" && (
        <ExportWizard
          visible
          groups={[{ heading: "PDF", formats: PDF_FORMATS }]}
          onExport={handleExport}
          onClose={() => pdfStore.setActiveFileMenuPanel(null)}
        />
      )}
    </div>
  )
}

function PrintPreviewPanel({ visible }: { visible: boolean }) {
  return (
    <div
      className="pdf-file-menu-content-box"
      style={{ ...contentBoxBaseStyle, display: visible ? "block" : "none", padding: 0 }}
    >
      <div className="pdf-file-menu-header">Print Preview</div>
    </div>
  )
}
