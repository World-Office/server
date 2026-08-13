import { CollaborationStatus } from "@world-office/collaboration-react"
import { Ribbon, wordRibbonSpec } from "@world-office/editor-common"
import type { RibbonCommandDispatch, RibbonContext } from "@world-office/editor-common"
import { detectWopiParams } from "@world-office/wopi-client"
import { observer } from "mobx-react-lite"
import { collaborationStore } from "../../lib/collaboration"
import type { RichTextCommand } from "../../lib/rte-command"
import { documentStore } from "../../stores/DocumentStore"
import { FileTab } from "./FileTab"
import type { MonacoCommand } from "./MonacoCommand"

/**
 * Convert kebab-case to camelCase
 * Example: "font-family" -> "fontFamily"
 */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

interface ToolbarProps {
  onMonacoCommand: (command: MonacoCommand) => void
  onRichTextCommand: (command: RichTextCommand, value?: string) => void
}

const ObservedToolbar = observer(function ObservedToolbar({
  onMonacoCommand,
  onRichTextCommand,
}: ToolbarProps) {
  const connectionStatus = collaborationStore.connectionStatus
  const userCount = collaborationStore.users.length
  const wopi = detectWopiParams()

  const context: RibbonContext = {
    isEditMode: documentStore.isEditMode,
    isModified: documentStore.isModified,
    isSaving: documentStore.isSaving,
    canEdit: true,
    activeTab: "",
    isWopi: !!wopi,
    connectionStatus,
    userCount,
    fileName: documentStore.fileName,
    rulerVisible: documentStore.rulerVisible,
    gridlinesVisible: documentStore.gridlinesVisible,
    navigationVisible: documentStore.navigationVisible,
    spellcheckEnabled: documentStore.spellingEnabled,
    differentFirstPage: documentStore.differentFirstPage,
    differentOddEven: documentStore.differentOddEven,
  }

  const dispatch: RibbonCommandDispatch = {
    onMonacoCommand: (cmd: string) => onMonacoCommand(cmd as MonacoCommand),
    onRichTextCommand: (cmd: string, value?: string) =>
      onRichTextCommand(cmd as RichTextCommand, value),
    onCommand: (cmd: string, value?: string) => {
      // Convert kebab-case command IDs to camelCase for compatibility
      const commandName = toCamelCase(cmd)
      
      if (cmd === "save") {
        window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: "save" } }))
      } else if (cmd === "share") {
        window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: "share" } }))
      } else if (cmd === "zoomIn") {
        documentStore.zoomIn()
      } else if (cmd === "zoomOut") {
        documentStore.zoomOut()
      } else if (cmd === "download") {
        window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: "download" } }))
      } else if (cmd === "toggleRuler") {
        documentStore.toggleRuler()
      } else if (cmd === "toggleGridlines") {
        documentStore.toggleGridlines()
      } else if (cmd === "toggleNavigation") {
        documentStore.toggleNavigation()
      } else if (cmd === "removeHeader") {
        documentStore.clearHeader()
        documentStore.headerFooterMode = "none"
      } else if (cmd === "removeFooter") {
        documentStore.clearFooter()
        documentStore.headerFooterMode = "none"
      } else if (cmd === "differentFirstPage") {
        documentStore.setDifferentFirstPage(!documentStore.differentFirstPage)
      } else if (cmd === "differentOddEven") {
        documentStore.setDifferentOddEven(!documentStore.differentOddEven)
      } else {
        // Dispatch via wo-command event for formatting and other commands
        // Convert kebab-case to camelCase for compatibility with existing command names
        window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: commandName, value } }))
      }
    },
  }

  return (
    <Ribbon
      spec={wordRibbonSpec}
      context={context}
      dispatch={dispatch}
      beforeTabs={<FileTab />}
      tabBarExtra={<CollaborationStatus state={connectionStatus} userCount={userCount} />}
    />
  )
})

export { ObservedToolbar as Toolbar }
