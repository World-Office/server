import type { CSSProperties } from "react"
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
    </div>
  )
}
