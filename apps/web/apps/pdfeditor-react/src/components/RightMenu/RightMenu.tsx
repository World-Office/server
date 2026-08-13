import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { pdfStore } from "../../stores/PdfStore"
import type { RightMenuPanel } from "../../types/pdf"
import { AnnotationPanel } from "./AnnotationPanel"
import { ChartPanel } from "./ChartPanel"
import { FormPanel } from "./FormPanel"
import { ImagePanel } from "./ImagePanel"
import { ParagraphPanel } from "./ParagraphPanel"
import { RightMenuButton } from "./RightMenuButton"
import { ShapePanel } from "./ShapePanel"
import { TablePanel } from "./TablePanel"
import { TextArtPanel } from "./TextArtPanel"

const BUTTONS: Array<{ action: RightMenuPanel; title: string; icon: string }> = [
  { action: "paragraph", title: "Paragraph", icon: "Type" },
  { action: "image", title: "Image", icon: "Image" },
  { action: "shape", title: "Shape", icon: "Shapes" },
  { action: "table", title: "Table", icon: "Table2" },
  { action: "chart", title: "Chart", icon: "BarChart3" },
  { action: "textart", title: "TextArt", icon: "Text" },
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
      <div className="pdf-right-panel-side">
        <ParagraphPanel visible={pdfStore.activeRightPanel === "paragraph"} />
        <ImagePanel visible={pdfStore.activeRightPanel === "image"} />
        <ShapePanel visible={pdfStore.activeRightPanel === "shape"} />
        <TablePanel visible={pdfStore.activeRightPanel === "table"} />
        <ChartPanel visible={pdfStore.activeRightPanel === "chart"} />
        <TextArtPanel visible={pdfStore.activeRightPanel === "textart"} />
        <FormPanel visible={pdfStore.activeRightPanel === "form"} />
        <AnnotationPanel visible={pdfStore.activeRightPanel === "annotations"} />
      </div>
    </div>
  )
}

export const RightMenu = observer(RightMenuInner)
