import type { JSX } from "react"
import { visioStore } from "../../../stores/VisioStore"
import type { FileMenuAction } from "../../../types/visio"

interface FileMenuItemsProps {
  onMenuClick: (action: string, hasPanel: boolean) => void
  onBack: () => void
}

interface MenuItem {
  action: FileMenuAction | "close-editor" | "external-help" | "file:open" | "file:exit"
  caption: string
  hasPanel: boolean
}

const MENU_ITEMS: MenuItem[] = [
  { action: "back", caption: "Back", hasPanel: false },
  { action: "saveas", caption: "Download as...", hasPanel: true },
  { action: "save-copy", caption: "Save Copy as...", hasPanel: true },
  { action: "printpreview", caption: "Print", hasPanel: true },
  { action: "rename", caption: "Rename...", hasPanel: false },
  { action: "info", caption: "Document Info...", hasPanel: true },
  { action: "opts", caption: "Advanced Settings...", hasPanel: true },
  { action: "help", caption: "Help...", hasPanel: true },
  { action: "exit", caption: "Go to Documents", hasPanel: false },
]

export function FileMenuItems({ onMenuClick, onBack }: FileMenuItemsProps): JSX.Element {
  const activePanel = visioStore.activeFileMenuPanel

  function handleBack(): void {
    onBack()
  }

  function handleKeyDown(e: React.KeyboardEvent, action: () => void): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      action()
    }
  }

  return (
    <ul className="visio-file-menu-items">
      <div
        className="visio-file-menu-item"
        role="menuitem"
        tabIndex={0}
        onClick={handleBack}
        onKeyDown={(e) => handleKeyDown(e, handleBack)}
      >
        <span className="visio-file-menu-item-icon">←</span>
        <span className="visio-file-menu-item-caption">Back</span>
      </div>
      <li className="visio-file-menu-divider" />
      {MENU_ITEMS.map((item) => (
        <div
          key={item.action}
          className={`visio-file-menu-item${activePanel === item.action ? " active" : ""}`}
          role="menuitem"
          tabIndex={0}
          onClick={() => onMenuClick(item.action, item.hasPanel)}
          onKeyDown={(e) => handleKeyDown(e, () => onMenuClick(item.action, item.hasPanel))}
        >
          <span className="visio-file-menu-item-caption">{item.caption}</span>
        </div>
      ))}
    </ul>
  )
}
