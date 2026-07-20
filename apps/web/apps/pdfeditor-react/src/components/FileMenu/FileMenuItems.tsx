import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { pdfStore } from "../../stores/PdfStore"
import type { FileMenuAction } from "../../types/pdf"

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
  { action: "new", caption: "New...", hasPanel: true },
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
  const { t } = useTranslation()
  const activePanel = pdfStore.activeFileMenuPanel

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
    <ul className="pdf-file-menu-items">
      <div
        className="pdf-file-menu-item"
        role="menuitem"
        tabIndex={0}
        onClick={handleBack}
        onKeyDown={(e) => handleKeyDown(e, handleBack)}
      >
        <span className="pdf-file-menu-item-icon">←</span>
        <span className="pdf-file-menu-item-caption">{t("Back")}</span>
      </div>
      <li className="pdf-file-menu-divider" />
      {MENU_ITEMS.map((item) => (
        <div
          key={item.action}
          className={`pdf-file-menu-item${activePanel === item.action ? " active" : ""}`}
          role="menuitem"
          tabIndex={0}
          onClick={() => onMenuClick(item.action, item.hasPanel)}
          onKeyDown={(e) => handleKeyDown(e, () => onMenuClick(item.action, item.hasPanel))}
        >
          <span className="pdf-file-menu-item-caption">{t(item.caption)}</span>
        </div>
      ))}
    </ul>
  )
}
