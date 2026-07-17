import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { pdfStore } from "../../stores/PdfStore"
import type { LeftMenuAction } from "../../types/pdf"
import { LeftMenuButton } from "./LeftMenuButton"
import { ThumbnailPanel } from "./ThumbnailPanel"

const BUTTONS: Array<{ action: LeftMenuAction; title: string; icon: string }> = [
  { action: "search", title: "Search", icon: "🔍" },
  { action: "comments", title: "Comments", icon: "💬" },
  { action: "chat", title: "Chat", icon: "💬" },
  { action: "navigation", title: "Navigation", icon: "📑" },
  { action: "thumbnails", title: "Thumbnails", icon: "📷" },
  { action: "about", title: "About", icon: "ℹ" },
]

function LeftMenuInner(): JSX.Element {
  const { t } = useTranslation()
  const expanded = pdfStore.activeLeftPanel

  return (
    <div
      className="pdf-left-menu"
      data-expanded={expanded !== null ? "true" : undefined}
      role="menubar"
      aria-orientation="vertical"
      aria-label="Left menu"
    >
      <div className="pdf-left-menu-btns">
        {BUTTONS.map(({ action, title, icon }) => (
          <LeftMenuButton
            key={action}
            action={action}
            title={t(title)}
            icon={icon}
            active={expanded === action}
            onClick={() => pdfStore.toggleLeftPanel(action)}
          />
        ))}
      </div>
      <div className="pdf-left-panel-side">
        <div
          className="pdf-left-panel-chat"
          style={{ display: expanded === "chat" ? "block" : "none" }}
        />
        {expanded === "thumbnails" && <ThumbnailPanel />}
      </div>
    </div>
  )
}

export const LeftMenu = observer(LeftMenuInner)
