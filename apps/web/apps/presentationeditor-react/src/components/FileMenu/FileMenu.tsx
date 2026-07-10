import type { CSSProperties } from "react"
import { presentationStore } from "../../stores/PresentationStore"
import { FileMenuItems } from "./FileMenuItems"
import { CreateNewPanel } from "./panels/CreateNewPanel"
import { DocumentInfoPanel } from "./panels/DocumentInfoPanel"
import { HelpPanel } from "./panels/HelpPanel"
import { PrintPreviewPanel } from "./panels/PrintPreviewPanel"
import { ProtectPanel } from "./panels/ProtectPanel"
import { RecentFilesPanel } from "./panels/RecentFilesPanel"
import { RightsPanel } from "./panels/RightsPanel"
import { SaveAsPanel } from "./panels/SaveAsPanel"
import { SaveCopyPanel } from "./panels/SaveCopyPanel"
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
  const activePanel = presentationStore.activeFileMenuPanel

  function handleMenuClick(action: string, hasPanel: boolean): void {
    if (hasPanel) {
      const newPanel = presentationStore.activeFileMenuPanel === action ? null : action
      presentationStore.setActiveFileMenuPanel(newPanel)
    } else {
      presentationStore.setFileMenuOpen(false)
    }
  }

  function handleBack(): void {
    presentationStore.setActiveFileMenuPanel(null)
    presentationStore.setFileMenuOpen(false)
  }

  return (
    <div className="prese-file-menu">
      <div className="prese-file-menu-list" role="menubar" aria-label="File menu">
        <FileMenuItems onMenuClick={handleMenuClick} onBack={handleBack} />
      </div>
      <div style={panelContainerStyle}>
        <div className="prese-file-menu-panel-box" style={contentBoxBaseStyle}>
          <SaveAsPanel visible={activePanel === "saveas"} />
          <SaveCopyPanel visible={activePanel === "save-copy"} />
          <RecentFilesPanel visible={activePanel === "recent"} />
          <CreateNewPanel visible={activePanel === "create-new"} />
          <DocumentInfoPanel visible={activePanel === "info"} />
          <RightsPanel visible={activePanel === "rights"} />
          <SettingsPanel visible={activePanel === "opts"} />
          <HelpPanel visible={activePanel === "help"} />
          <ProtectPanel visible={activePanel === "protect"} />
          <PrintPreviewPanel visible={activePanel === "printpreview"} />
        </div>
      </div>
    </div>
  )
}
