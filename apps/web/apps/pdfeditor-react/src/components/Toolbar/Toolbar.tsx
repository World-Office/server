import { observer } from "mobx-react-lite"
import { pdfStore } from "../../stores/PdfStore"
import { CommentTab } from "./CommentTab"
import { FileTab } from "./FileTab"
import { FormsTab } from "./FormsTab"
import { HomeTab } from "./HomeTab"
import { InsertTab } from "./InsertTab"
import type { MonacoCommand } from "./MonacoCommand"
import { RedactTab } from "./RedactTab"
import { ViewTab } from "./ViewTab"

interface ToolbarProps {
  onMonacoCommand: (command: MonacoCommand) => void
}

const ObservedToolbar = observer(function ObservedToolbar({ onMonacoCommand }: ToolbarProps) {
  const isEditMode = pdfStore.isEditMode

  return (
    <div className="pdf-toolbar">
      <div className="pdf-toolbar-tabs">
        <div className="pdf-toolbar-extra-left" />
        <FileTab />
        <HomeTab onMonacoCommand={onMonacoCommand} />
        <CommentTab />
        {isEditMode && <InsertTab />}
        {isEditMode && <RedactTab />}
        <FormsTab />
        <ViewTab onMonacoCommand={onMonacoCommand} />
        <div className="pdf-toolbar-extra-right" />
      </div>
      <section className="pdf-toolbar-controls" role="tabpanel">
        <section className="pdf-toolbar-static" />
        <section className="pdf-toolbar-panels" />
      </section>
    </div>
  )
})

export { ObservedToolbar as Toolbar }
