import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { documentStore } from "../../stores/DocumentStore"
import type { RightMenuPanel } from "../../types/document"
import { RightMenuButton } from "./RightMenuButton"

const BUTTONS: Array<{ action: RightMenuPanel; title: string; icon: string }> = [
  { action: "ai-assistant", title: "AI Assistant", icon: "Smile" },
  { action: "comments", title: "Comments", icon: "MessageSquare" },
  { action: "review", title: "Review", icon: "CheckCircle" },
  { action: "paragraph", title: "Paragraph", icon: "Type" },
  { action: "table", title: "Table", icon: "Table2" },
  { action: "image", title: "Image", icon: "Image" },
  { action: "shape", title: "Shape", icon: "Shapes" },
  { action: "chart", title: "Chart", icon: "LineChart" },
  { action: "textart", title: "TextArt", icon: "Type" },
  { action: "mailmerge", title: "MailMerge", icon: "Mail" },
  { action: "signature", title: "Signature", icon: "Edit3" },
  { action: "form", title: "Form", icon: "CheckSquare" },
  { action: "plugins", title: "Plugins", icon: "Settings" },
  { action: "crossreference", title: "Cross-Ref", icon: "Link" },
  { action: "theme", title: "Theme", icon: "Palette" },
]

function RightMenuInner(): JSX.Element {
  const { t } = useTranslation()

  return (
    <div
      className="de-right-menu"
      role="menubar"
      aria-orientation="vertical"
      aria-label="Right menu"
    >
      <div className="de-right-menu-btns">
        {BUTTONS.map(({ action, title, icon }) => (
          <RightMenuButton
            key={action}
            action={action}
            title={t(title)}
            icon={icon}
            active={documentStore.activeRightPanel === action}
            onClick={() => documentStore.toggleRightPanel(action)}
          />
        ))}
      </div>
      <div className="de-right-panel-side" />
    </div>
  )
}

export const RightMenu = observer(RightMenuInner)
