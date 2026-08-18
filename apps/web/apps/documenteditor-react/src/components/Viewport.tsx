import { CollaboratorCursors } from "@world-office/collaboration-react"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { collaborationStore } from "../lib/collaboration"
import type { PageLayoutSettings, RichTextCommand } from "../lib/rte-command"
import { documentStore } from "../stores/DocumentStore"
import { ChartPanel } from "./ChartPanel"
import { CommentsPanel } from "./CommentsPanel"
import { CrossReferencePanel } from "./CrossReferencePanel"
import { DocumentHolder } from "./DocumentHolder"
import { FileMenu } from "./FileMenu/FileMenu"
import { FindReplacePanel } from "./FindReplacePanel"
import { FormPanel } from "./FormPanel"
import { HeaderFooterEditor } from "./HeaderFooter"
import { ImagePanel } from "./ImagePanel"
import { LeftMenu } from "./LeftMenu/LeftMenu"
import { MailMergePanel } from "./MailMergePanel"
import { OfflineBadge } from "./OfflineBadge"
import { PluginsPanel } from "./PluginsPanel"
import { AiAssistantPanel } from "./RightMenu/AiAssistantPanel"
import { RightMenu } from "./RightMenu/RightMenu"
import { TrackChangesPanel } from "./RightMenu/TrackChangesPanel"
import { ShapePanel } from "./ShapePanel"
import { SignaturePanel } from "./SignaturePanel"
import { StatusBar } from "./StatusBar/StatusBar"
import { StylesPanel } from "./StylesPanel"
import { TablePanel } from "./TablePanel"
import { TextArtPanel } from "./TextArtPanel"
import { ThemePanel } from "./ThemePanel"
import type { MonacoCommand } from "./Toolbar/MonacoCommand"
import { Toolbar } from "./Toolbar/Toolbar"

interface ViewportProps {
  toolbarVisible: boolean
  statusbarVisible: boolean
  leftMenuVisible: boolean
  rightMenuVisible: boolean
  isCompactToolbar: boolean
  embedded: boolean
  onMonacoCommand: (command: MonacoCommand) => void
  onRichTextCommand: (command: RichTextCommand, value?: string) => void
}

const PAGE_SIZE_CSS: Record<string, { width: string; height: string }> = {
  A4: { width: "210mm", height: "297mm" }, /* φ ratio: 297/210 ≈ 1.414 (√2) */
  A3: { width: "297mm", height: "420mm" },
  Letter: { width: "215.9mm", height: "279.4mm" },
  Legal: { width: "215.9mm", height: "355.6mm" },
}

/* Golden ratio margins - Fibonacci-based: 21, 34, 55 */
const MARGIN_CSS: Record<string, string> = {
  normal: "25.4mm", /* Existing standard, close to Fibonacci 21+34=55 but in mm */
  narrow: "21mm",    /* Fibonacci: 21 */
  wide: "34mm",      /* Fibonacci: 34 */
}

export function Viewport({
  toolbarVisible,
  statusbarVisible,
  leftMenuVisible,
  rightMenuVisible,
  isCompactToolbar,
  embedded,
  onMonacoCommand,
  onRichTextCommand,
}: ViewportProps): ReactNode {
  const [pageLayout, setPageLayout] = useState<PageLayoutSettings>({
    orientation: "portrait",
    pageSize: "A4",
    margins: "normal",
  })
  const [columns, setColumns] = useState(1)

  useEffect(() => {
    const handleLayout = (e: Event) => {
      const detail = (e as CustomEvent<PageLayoutSettings>).detail
      setPageLayout((prev) => ({ ...prev, ...detail }))
    }
    const handleColumns = (e: Event) => {
      setColumns((e as CustomEvent<{ count: number }>).detail.count)
    }
    window.addEventListener("world-office:page-layout", handleLayout)
    window.addEventListener("world-office:columns", handleColumns)
    return () => {
      window.removeEventListener("world-office:page-layout", handleLayout)
      window.removeEventListener("world-office:columns", handleColumns)
    }
  }, [])

  const toolbarHeight = isCompactToolbar
    ? "var(--wo-de-toolbar-height-compact, 34px)"
    : "var(--wo-de-toolbar-height, 55px)"

  const pageSize = pageLayout.pageSize ?? "A4"
  const dims = PAGE_SIZE_CSS[pageSize] ?? PAGE_SIZE_CSS.A4
  /* Golden ratio margins - Fibonacci sequence */
  const margin = MARGIN_CSS[pageLayout.margins ?? "normal"] ?? MARGIN_CSS.normal
  const pageWidth = pageLayout.orientation === "landscape" ? dims.height : dims.width
  const pageHeight = pageLayout.orientation === "landscape" ? dims.width : dims.height
  /* Column gap follows Fibonacci: 21 */
  const columnGap = columns > 1 ? "21mm" : "0"

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
            <Toolbar onMonacoCommand={onMonacoCommand} onRichTextCommand={onRichTextCommand} />
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
            <div
              style={{
                width: pageWidth,
                minWidth: pageWidth,
                minHeight: pageHeight,
                background: "#fff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                paddingLeft: margin,
                paddingRight: margin,
                paddingTop: margin,
                paddingBottom: margin,
                columnCount: columns,
                columnGap: columnGap, /* Golden ratio: 21mm when columns > 1 */
                position: "relative",
              }}
            >
              {documentStore.headerFooterMode === "header" || documentStore.headerHtml ? (
                <HeaderFooterEditor region="header" />
              ) : null}
              <DocumentHolder embedded={embedded} />
              {documentStore.headerFooterMode === "footer" || documentStore.footerHtml ? (
                <HeaderFooterEditor region="footer" />
              ) : null}
              <CollaboratorCursors
                cursors={collaborationStore.remoteCursors}
                userColors={new Map(collaborationStore.users.map((u) => [u.id, u.color]))}
                userNames={new Map(collaborationStore.users.map((u) => [u.id, u.name]))}
              />
              <FindReplacePanel
                visible={documentStore.showFindPanel}
                onClose={() => documentStore.setShowFindPanel(false)}
                onCommand={(cmd, value) => onRichTextCommand(cmd as RichTextCommand, value)}
              />
            </div>
          </div>

          {rightMenuVisible && (
            <div
              className="de-viewport-right-menu"
              style={{
                width: "var(--wo-de-rightmenu-width, 40px)",
                display: "flex",
                position: "relative",
              }}
            >
              <RightMenu />
              <AiAssistantPanel visible={documentStore.activeRightPanel === "ai-assistant"} />
              <CommentsPanel visible={documentStore.activeRightPanel === "comments"} />
              <TrackChangesPanel visible={documentStore.activeRightPanel === "review"} />
              <StylesPanel
                visible={documentStore.activeRightPanel === "paragraph"}
                onCommand={onRichTextCommand}
              />
              <CrossReferencePanel
                visible={documentStore.activeRightPanel === "crossreference"}
                onInsertCrossReference={(targetId, format, display) => {
                  onRichTextCommand("insertCrossReference", `${targetId}|${format}|${display}`)
                }}
              />
              <ThemePanel visible={documentStore.activeRightPanel === "theme"} />
              <MailMergePanel
                visible={documentStore.activeRightPanel === "mailmerge"}
                onInsertMergeField={(field) => {
                  onRichTextCommand("insertMergeField", field)
                }}
                onMergeComplete={(mergedHtml) => {
                  // Set merged content into the document
                  onRichTextCommand("loadHtml", mergedHtml)
                  documentStore.setActiveRightPanel(null)
                }}
              />
              <ImagePanel visible={documentStore.activeRightPanel === "image"} />
              <TablePanel visible={documentStore.activeRightPanel === "table"} />
              <FormPanel visible={documentStore.activeRightPanel === "form"} />
              <ShapePanel visible={documentStore.activeRightPanel === "shape"} />
              <ChartPanel visible={documentStore.activeRightPanel === "chart"} />
              <TextArtPanel visible={documentStore.activeRightPanel === "textart"} />
              <SignaturePanel visible={documentStore.activeRightPanel === "signature"} />
              <PluginsPanel visible={documentStore.activeRightPanel === "plugins"} />
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
