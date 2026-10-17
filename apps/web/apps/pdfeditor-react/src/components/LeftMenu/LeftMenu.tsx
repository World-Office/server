import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { pdfStore } from "../../stores/PdfStore"
import type { LeftMenuAction } from "../../types/pdf"
import { ChatPanel } from "./ChatPanel"
import { CommentsPanel } from "./CommentsPanel"
import { LeftMenuButton } from "./LeftMenuButton"
import { NavigationPanel } from "./NavigationPanel"
import { SearchPanel } from "./SearchPanel"
import { SupportPanel } from "./SupportPanel"
import { ThumbnailPanel } from "./ThumbnailPanel"

const BUTTONS: Array<{ action: LeftMenuAction; title: string; icon: string }> = [
  { action: "search", title: "Search", icon: "Search" },
  { action: "comments", title: "Comments", icon: "MessageSquare" },
  { action: "chat", title: "Chat", icon: "MessageSquare" },
  { action: "navigation", title: "Navigation", icon: "FileText" },
  { action: "thumbnails", title: "Thumbnails", icon: "Image" },
  { action: "support", title: "Support", icon: "HelpCircle" },
  { action: "about", title: "About", icon: "File" },
]

function LeftMenuInner(): JSX.Element {
  const { t } = useTranslation()
  const activePanel = pdfStore.activeLeftPanel

  return (
    <div
      className="pdf-left-menu"
      data-panel-open={activePanel !== null && activePanel !== "about" ? "true" : undefined}
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
            active={activePanel === action}
            onClick={() => pdfStore.toggleLeftPanel(action)}
          />
        ))}
      </div>
      {/* Side panels — every rail toggle maps to a real panel here. The
          components stay mounted (display-toggled) so search results,
          comments, chat history and the outline survive a collapse; About is
          an overlay over the editor (see Viewport), not a side panel. */}
      <div className="pdf-left-panel-side">
        <SearchPanel active={activePanel === "search"} />
        <CommentsPanel active={activePanel === "comments"} />
        <ChatPanel active={activePanel === "chat"} />
        <NavigationPanel active={activePanel === "navigation"} />
        {activePanel === "thumbnails" && <ThumbnailPanel />}
        <SupportPanel active={activePanel === "support"} />
      </div>
    </div>
  )
}

export const LeftMenu = observer(LeftMenuInner)
