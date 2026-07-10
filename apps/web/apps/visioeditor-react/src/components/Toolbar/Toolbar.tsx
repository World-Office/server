import { FileTab } from "./FileTab"
import type { MonacoCommand } from "./MonacoCommand"
import { ViewTab } from "./ViewTab"

interface ToolbarProps {
  isEdit: boolean
  onMonacoCommand: (command: MonacoCommand) => void
}

export function Toolbar({ isEdit, onMonacoCommand }: ToolbarProps) {
  return (
    <div className="visio-toolbar">
      <div className="visio-toolbar-tabs">
        <div className="visio-toolbar-extra-left" />
        <FileTab />
        {isEdit && <ViewTab onMonacoCommand={onMonacoCommand} />}
        <div className="visio-toolbar-extra-right" />
      </div>
      <section className="visio-toolbar-controls" role="tabpanel">
        <section className="visio-toolbar-static" />
        <section className="visio-toolbar-panels" />
      </section>
    </div>
  )
}
