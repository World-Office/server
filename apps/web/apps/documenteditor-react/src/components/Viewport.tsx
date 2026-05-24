import type { ReactNode } from "react"
import { documentStore } from "../stores/DocumentStore"
import { DocumentHolder } from "./DocumentHolder"
import { FileMenu } from "./FileMenu/FileMenu"
import { LeftMenu } from "./LeftMenu/LeftMenu"
import { OfflineBadge } from "./OfflineBadge"
import { RightMenu } from "./RightMenu/RightMenu"
import { StatusBar } from "./StatusBar/StatusBar"
import { Toolbar } from "./Toolbar/Toolbar"

interface ViewportProps {
  toolbarVisible: boolean
  statusbarVisible: boolean
  leftMenuVisible: boolean
  rightMenuVisible: boolean
  isCompactToolbar: boolean
}

export function Viewport({
  toolbarVisible,
  statusbarVisible,
  leftMenuVisible,
  rightMenuVisible,
  isCompactToolbar,
}: ViewportProps): ReactNode {
  const toolbarHeight = isCompactToolbar
    ? "var(--wo-de-toolbar-height-compact, 34px)"
    : "var(--wo-de-toolbar-height, 40px)"

  return (
    <div className="de-viewport">
      <OfflineBadge />
      {/* File menu panel — full-screen overlay */}
      <section
        className="de-file-menu-panel"
        style={{ display: documentStore.isFileMenuOpen ? "block" : "none" }}
      >
        <FileMenu />
      </section>

      {/* Vertical layout: toolbar → body → statusbar */}
      <div className="de-viewport-vbox">
        {/* Toolbar row */}
        {toolbarVisible && (
          <div className="de-viewport-toolbar" style={{ height: toolbarHeight }} role="toolbar">
            <Toolbar />
          </div>
        )}

        {/* Body row: left-menu | about-panel | editor | right-menu */}
        <div className="de-viewport-body">
          {leftMenuVisible && (
            <div
              className="de-viewport-left-menu"
              style={{ width: "var(--wo-de-leftmenu-width, 40px)" }}
            >
              <LeftMenu />
            </div>
          )}

          {/* About panel (overlay when about button is toggled) */}
          <div
            className="de-about-menu-panel"
            style={{ display: documentStore.activeLeftPanel === "about" ? "block" : "none" }}
          />

          {/* Editor container */}
          <div className="de-viewport-editor">
            <DocumentHolder />
          </div>

          {rightMenuVisible && (
            <div
              className="de-viewport-right-menu"
              style={{ width: "var(--wo-de-rightmenu-width, 40px)" }}
            >
              <RightMenu />
            </div>
          )}
        </div>

        {/* Statusbar row */}
        {statusbarVisible && (
          <div className="de-viewport-statusbar">
            <StatusBar />
          </div>
        )}
      </div>
    </div>
  )
}
