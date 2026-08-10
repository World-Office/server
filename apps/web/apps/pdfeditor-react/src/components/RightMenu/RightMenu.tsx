import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { pdfStore } from "../../stores/PdfStore"
import type { RightMenuPanel } from "../../types/pdf"
import { RightMenuButton } from "./RightMenuButton"

const BUTTONS: Array<{ action: RightMenuPanel; title: string; icon: string }> = [
  { action: "paragraph", title: "Paragraph", icon: "Type" },
  { action: "image", title: "Image", icon: "Image" },
  { action: "shape", title: "Shape", icon: "Shapes" },
  { action: "table", title: "Table", icon: "Table2" },
  { action: "chart", title: "Chart", icon: "BarChart3" },
  { action: "textart", title: "TextArt", icon: "Type" },
  { action: "form", title: "Form", icon: "CheckSquare" },
  { action: "annotations", title: "Annotations", icon: "MessageSquare" },
]

function RightMenuInner(): JSX.Element {
  const { t } = useTranslation()
  return (
    <div
      className="pdf-right-menu"
      role="menubar"
      aria-orientation="vertical"
      aria-label="Right menu"
    >
      <div className="pdf-right-menu-btns">
        {BUTTONS.map(({ action, title, icon }) => (
          <RightMenuButton
            key={action}
            action={action}
            title={t(title)}
            icon={icon}
            active={pdfStore.activeRightPanel === action}
            onClick={() => pdfStore.toggleRightPanel(action)}
          />
        ))}
      </div>
      <div className="pdf-right-panel-side" />
    </div>
  )
}

export const RightMenu = observer(RightMenuInner)
