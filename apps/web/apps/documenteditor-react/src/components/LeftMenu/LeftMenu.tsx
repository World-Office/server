import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { documentStore } from "../../stores/DocumentStore"
import type { LeftMenuAction } from "../../types/document"
import { CommentsPanel } from "./CommentsPanel"
import { ContentLinkPanel } from "./ContentLinkPanel"
import { LeftMenuButton } from "./LeftMenuButton"

const BUTTONS: Array<{ action: LeftMenuAction; title: string; icon: string }> = [
  { action: "search", title: "Search", icon: "🔍" },
  { action: "comments", title: "Comments", icon: "💬" },
  { action: "contentlinks", title: "Content Links", icon: "🔗" },
  { action: "chat", title: "Chat", icon: "💬" },
  { action: "navigation", title: "Navigation", icon: "☰" },
  { action: "thumbnails", title: "Thumbnails", icon: "📄" },
  { action: "support", title: "Support", icon: "❓" },
  { action: "about", title: "About", icon: "ℹ" },
]

function LeftMenuInner(): JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="de-left-menu" role="menubar" aria-orientation="vertical" aria-label="Left menu">
      <div className="de-left-menu-btns">
        {BUTTONS.map(({ action, title, icon }) => (
          <LeftMenuButton
            key={action}
            action={action}
            title={t(title)}
            icon={icon}
            active={documentStore.activeLeftPanel === action}
            onClick={() => documentStore.toggleLeftPanel(action)}
          />
        ))}
      </div>
      <div className="de-left-panel-side">
        <ContentLinkPanel
          style={{ display: documentStore.activeLeftPanel === "contentlinks" ? "flex" : "none" }}
        />
        <CommentsPanel
          style={{ display: documentStore.activeLeftPanel === "comments" ? "flex" : "none" }}
        />
        <div
          className="de-left-panel-chat"
          style={{ display: documentStore.activeLeftPanel === "chat" ? "block" : "none" }}
        />
      </div>
    </div>
  )
}

export const LeftMenu = observer(LeftMenuInner)
