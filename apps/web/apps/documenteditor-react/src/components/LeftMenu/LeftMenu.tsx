import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { documentStore } from "../../stores/DocumentStore"
import type { LeftMenuAction } from "../../types/document"
import { CommentsPanel } from "./CommentsPanel"
import { ContentLinkPanel } from "./ContentLinkPanel"
import { LeftMenuButton } from "./LeftMenuButton"

const BUTTONS: Array<{ action: LeftMenuAction; title: string; icon: string }> = [
  { action: "search", title: "Search", icon: "Search" },
  { action: "comments", title: "Comments", icon: "MessageSquare" },
  { action: "contentlinks", title: "Content Links", icon: "Link" },
  { action: "chat", title: "Chat", icon: "Users" },
  { action: "navigation", title: "Navigation", icon: "PanelRight" },
  { action: "thumbnails", title: "Thumbnails", icon: "Grid3x3" },
  { action: "support", title: "Support", icon: "HelpCircle" },
  { action: "about", title: "About", icon: "File" },
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
          active={documentStore.activeLeftPanel === "contentlinks"}
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
