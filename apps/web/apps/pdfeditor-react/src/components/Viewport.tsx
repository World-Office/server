import type { ReactNode } from "react"
import { pdfStore } from "../stores/PdfStore"
import { DocumentHolder } from "./DocumentHolder"
import { FileMenu } from "./FileMenu/FileMenu"
import { LeftMenu } from "./LeftMenu/LeftMenu"
import { RightMenu } from "./RightMenu/RightMenu"
import { StatusBar } from "./StatusBar/StatusBar"
import type { MonacoCommand } from "./Toolbar/MonacoCommand"
import { Toolbar } from "./Toolbar/Toolbar"

interface ViewportProps {
  toolbarVisible: boolean
  statusbarVisible: boolean
  leftMenuVisible: boolean
  rightMenuVisible: boolean
  isCompactToolbar: boolean
  onMonacoCommand: (command: MonacoCommand) => void
}

export function Viewport({
  toolbarVisible,
  statusbarVisible,
  leftMenuVisible,
  rightMenuVisible,
  isCompactToolbar,
  onMonacoCommand,
}: ViewportProps): ReactNode {
  const toolbarHeight = isCompactToolbar
    ? "var(--wo-pdf-toolbar-height-compact, 34px)"
    : "var(--wo-pdf-toolbar-height, 40px)"

  return (
    <div className="pdf-viewport">
      {/* File menu panel — full-screen overlay */}
      <section
        className="pdf-file-menu-panel"
        style={{ display: pdfStore.isFileMenuOpen ? "block" : "none" }}
      >
        <FileMenu />
      </section>

      {/* Vertical layout: toolbar → body → statusbar */}
      <div className="pdf-viewport-vbox">
        {/* Toolbar row */}
        {toolbarVisible && (
          <div className="pdf-viewport-toolbar" style={{ height: toolbarHeight }} role="toolbar">
            <Toolbar onMonacoCommand={onMonacoCommand} />
          </div>
        )}

        {/* Body row: left-menu | about-panel | editor | right-menu */}
        <div className="pdf-viewport-body">
          {leftMenuVisible && (
            <div
              className="pdf-viewport-left-menu"
              style={{ width: "var(--wo-pdf-leftmenu-width, 40px)" }}
            >
              <LeftMenu />
            </div>
          )}

          {/* About panel (overlay when about button is toggled) */}
          <div
            className="pdf-about-menu-panel"
            style={{ display: pdfStore.activeLeftPanel === "about" ? "block" : "none" }}
          />

          {/* Editor container */}
          <div className="pdf-viewport-editor">
            <DocumentHolder />
          </div>

          {rightMenuVisible && (
            <div
              className="pdf-viewport-right-menu"
              style={{ width: "var(--wo-pdf-rightmenu-width, 40px)" }}
            >
              <RightMenu />
            </div>
          )}
        </div>

        {/* Statusbar row */}
        {statusbarVisible && (
          <div className="pdf-viewport-statusbar">
            <StatusBar />
          </div>
        )}
      </div>
    </div>
  )
}
