import { CollaborationStatus } from "@world-office/collaboration-react"
import { observer } from "mobx-react-lite"
import { collaborationStore } from "../../lib/collaboration"
import type { RichTextCommand } from "../../lib/rte-command"
import { documentStore } from "../../stores/DocumentStore"
import { FileTab } from "./FileTab"
import { FormsTab } from "./FormsTab"
import { HeaderFooterTab } from "./HeaderFooterTab"
import { HomeTab } from "./HomeTab"
import { InsertTab } from "./InsertTab"
import { LayoutTab } from "./LayoutTab"
import type { MonacoCommand } from "./MonacoCommand"
import { ReferencesTab } from "./ReferencesTab"
import { ViewTab } from "./ViewTab"

interface ToolbarProps {
  onMonacoCommand: (command: MonacoCommand) => void
  onRichTextCommand: (command: RichTextCommand) => void
}

const ObservedToolbar = observer(function ObservedToolbar({
  onMonacoCommand,
  onRichTextCommand,
}: ToolbarProps) {
  const isEditMode = documentStore.isEditMode
  const connectionStatus = collaborationStore.connectionStatus
  const userCount = collaborationStore.users.length

  return (
    <div className="de-toolbar">
      <div className="de-toolbar-tabs">
        <div className="de-toolbar-extra-left" />
        <FileTab />
        <HomeTab onMonacoCommand={onMonacoCommand} onRichTextCommand={onRichTextCommand} />
        {isEditMode && <InsertTab onRichTextCommand={onRichTextCommand} />}
        {isEditMode && <LayoutTab onRichTextCommand={onRichTextCommand} />}
        <ReferencesTab />
        <ViewTab onMonacoCommand={onMonacoCommand} onRichTextCommand={onRichTextCommand} />
        {isEditMode && <FormsTab />}
        {isEditMode && <HeaderFooterTab />}
        <div className="de-toolbar-extra-right">
          <CollaborationStatus state={connectionStatus} userCount={userCount} />
        </div>
      </div>
      <section className="de-toolbar-controls" role="tabpanel">
        <section className="de-toolbar-static" />
        <section className="de-toolbar-panels" />
      </section>
    </div>
  )
})

export { ObservedToolbar as Toolbar }
