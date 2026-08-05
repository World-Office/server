import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { documentStore } from "../../stores/DocumentStore"
import type { RightMenuPanel } from "../../types/document"
import { RightMenuButton } from "./RightMenuButton"

const BUTTONS: Array<{ action: RightMenuPanel; title: string; icon: string }> = [
  { action: "ai-assistant", title: "AI Assistant", icon: "✨" },
  { action: "comments", title: "Comments", icon: "💬" },
  { action: "review", title: "Review", icon: "✓" },
  { action: "paragraph", title: "Paragraph", icon: "¶" },
  { action: "table", title: "Table", icon: "⊞" },
  { action: "image", title: "Image", icon: "🖼" },
  { action: "shape", title: "Shape", icon: "⬡" },
  { action: "chart", title: "Chart", icon: "📊" },
  { action: "textart", title: "TextArt", icon: "Aa" },
  { action: "mailmerge", title: "MailMerge", icon: "✉" },
  { action: "signature", title: "Signature", icon: "🔑" },
  { action: "form", title: "Form", icon: "📋" },
  { action: "plugins", title: "Plugins", icon: "🧩" },
  { action: "crossreference", title: "Cross-Ref", icon: "🔗" },
  { action: "theme", title: "Theme", icon: "🎨" },
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
