import { Ribbon, pdfRibbonSpec } from "@world-office/editor-common"
import type { RibbonCommandDispatch, RibbonContext } from "@world-office/editor-common"
import { detectWopiParams } from "@world-office/wopi-client"
import { observer } from "mobx-react-lite"
import { translateRibbonControlCommand } from "../../lib/pdf-commands"
import { pdfStore } from "../../stores/PdfStore"
import { FileTab } from "./FileTab"
import type { MonacoCommand } from "./MonacoCommand"

interface ToolbarProps {
  onMonacoCommand: (command: MonacoCommand) => void
}

const ObservedToolbar = observer(function ObservedToolbar({ onMonacoCommand }: ToolbarProps) {
  const wopi = detectWopiParams()

  const context: RibbonContext = {
    isEditMode: pdfStore.isEditMode,
    isModified: pdfStore.isModified ?? false,
    isSaving: pdfStore.isSaving ?? false,
    canEdit: true,
    activeTab: pdfStore.activeTab ?? "",
    isWopi: !!wopi,
    connectionStatus: "connected",
    userCount: 0,
    fileName: pdfStore.document?.title ?? "",
  }

  const dispatchCommand = (cmd: string, value?: string): void => {
    switch (cmd) {
      case "goToFirstPage":
        pdfStore.setCurrentPage(0)
        break
      case "goToPrevPage":
        pdfStore.setCurrentPage(Math.max(0, pdfStore.currentPage - 1))
        break
      case "goToNextPage":
        pdfStore.setCurrentPage(Math.min(pdfStore.pageCount - 1, pdfStore.currentPage + 1))
        break
      case "goToLastPage":
        pdfStore.setCurrentPage(pdfStore.pageCount - 1)
        break
      case "toggleEditMode":
        pdfStore.setEditMode(!pdfStore.isEditMode)
        break
      case "toggleSelect":
      case "toggleHand":
        pdfStore.setCurrentTool(pdfStore.currentTool === "select" ? "hand" : "select")
        break
      case "toggleFitToPage":
        pdfStore.setFitToPage(!pdfStore.fitToPage)
        break
      case "toggleFitToWidth":
        pdfStore.setFitToWidth(!pdfStore.fitToWidth)
        break
      case "save":
        window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: "save" } }))
        break
      default: {
        // Select controls fire onCommand with their CONTROL id after their
        // own onChange — translate to the real command; checkbox control ids
        // (show-*) translate to null because their onChange already handled
        // the click, so the redundant dispatch is skipped.
        const translated = translateRibbonControlCommand(cmd, value)
        if (translated) {
          window.dispatchEvent(
            new CustomEvent("wo-command", {
              detail: { command: translated.command, value: translated.value },
            }),
          )
        } else if (!cmd.startsWith("show-")) {
          window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: cmd, value } }))
        }
      }
    }
  }

  const dispatch: RibbonCommandDispatch = {
    // Text editing flows through onCommand → the store router below; keeping
    // this a no-op avoids dispatching every click twice (toggles would cancel
    // themselves out).
    onRichTextCommand: () => {},
    onMonacoCommand: (cmd: string) => onMonacoCommand(cmd as MonacoCommand),
    onCommand: (cmd: string, value?: string) => dispatchCommand(cmd, value),
  }

  return (
    <Ribbon spec={pdfRibbonSpec} context={context} dispatch={dispatch} beforeTabs={<FileTab />} />
  )
})

export { ObservedToolbar as Toolbar }
