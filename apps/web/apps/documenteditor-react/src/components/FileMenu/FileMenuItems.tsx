import { openFile } from "../../bridge/file-operations"
import { documentStore } from "../../stores/DocumentStore"
import type { FileMenuAction } from "../../types/document"

interface FileMenuItemsProps {
  onMenuClick: (action: string, hasPanel: boolean) => void
  onBack: () => void
}

interface MenuItem {
  action: FileMenuAction | "close-editor"
  caption: string
  hasPanel: boolean
}

const MENU_ITEMS: MenuItem[] = [
  { action: "back", caption: "Back", hasPanel: false },
  { action: "saveas", caption: "Download as...", hasPanel: true },
  { action: "save-copy", caption: "Save Copy as...", hasPanel: true },
  { action: "save-desktop", caption: "Save as...", hasPanel: false },
  { action: "print", caption: "Print", hasPanel: false },
  { action: "printpreview", caption: "Print with Preview", hasPanel: true },
  { action: "rename", caption: "Rename...", hasPanel: false },
  { action: "info", caption: "Document Info...", hasPanel: true },
  { action: "rights", caption: "Access Rights...", hasPanel: true },
  { action: "history", caption: "Version History...", hasPanel: true },
  { action: "opts", caption: "Advanced Settings...", hasPanel: true },
  { action: "help", caption: "Help...", hasPanel: true },
  { action: "exit", caption: "Go to Documents", hasPanel: false },
  { action: "close-editor", caption: "Close Editor", hasPanel: false },
  { action: "external-help", caption: "External Help", hasPanel: false },
  { action: "suggest", caption: "Suggest Feature", hasPanel: false },
  { action: "create-new", caption: "Create New", hasPanel: true },
  { action: "open-recent", caption: "Open Recent", hasPanel: false },
  { action: "protect", caption: "Protect Document", hasPanel: true },
]

export function FileMenuItems({ onMenuClick, onBack }: FileMenuItemsProps) {
  const activePanel = documentStore.activeFileMenuPanel

  function handleBack(): void {
    onBack()
  }

  async function handleDesktopAction(action: string): Promise<void> {
    if (!documentStore.isDesktop) {
      onMenuClick(action, false)
      return
    }
    switch (action) {
      case "save-desktop": {
        if (documentStore.filePath) {
          onMenuClick(action, false)
        } else {
          onMenuClick("saveas", true)
        }
        break
      }
      case "open-recent": {
        const result = await openFile()
        if (result) {
          documentStore.setFilePath(result.path)
          documentStore.setDirty(false)
          documentStore.setFileMenuOpen(false)
          documentStore.setActiveFileMenuPanel(null)
        }
        break
      }
      default:
        onMenuClick(action, false)
    }
  }

  return (
    <ul className="de-file-menu-items">
      <div
        className="de-file-menu-item"
        role="menuitem"
        tabIndex={0}
        onClick={handleBack}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleBack()
          }
        }}
      >
        <span className="de-file-menu-item-icon">←</span>
        <span className="de-file-menu-item-caption">Back</span>
      </div>
      <li className="de-file-menu-divider" />
      {MENU_ITEMS.map((item) => (
        <div
          key={item.action}
          className={`de-file-menu-item${activePanel === item.action ? " active" : ""}`}
          role="menuitem"
          tabIndex={0}
          onClick={() => handleDesktopAction(item.action)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              handleDesktopAction(item.action)
            }
          }}
        >
          <span className="de-file-menu-item-caption">{item.caption}</span>
        </div>
      ))}
    </ul>
  )
}
