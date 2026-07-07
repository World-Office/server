import {
  BringToFront,
  Columns2,
  IndentIncrease,
  PaintBucket,
  PanelRightOpen,
  Rows3,
  SquareSplitVertical,
  TextSelect,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import type { RichTextCommand } from "../../lib/rte-command"

interface LayoutTabProps {
  onRichTextCommand: (command: RichTextCommand, value?: string) => void
}

const ObservedLayoutTab = observer(function ObservedLayoutTab({
  onRichTextCommand,
}: LayoutTabProps) {
  return (
    <section
      className="de-layouttab-panel"
      data-tab="layout"
      role="tabpanel"
      aria-labelledby="layout"
    >
      {/* Page Setup */}
      <div className="de-layouttab-group">
        <span className="de-layouttab-label">Page Setup</span>
        <div className="de-layouttab-elset">
          <button
            type="button"
            className="de-layouttab-btn"
            onClick={() => onRichTextCommand("pageMargins")}
            title="Margins"
          >
            <PanelRightOpen size={18} />
            <span>Margins</span>
          </button>
          <button
            type="button"
            className="de-layouttab-btn"
            onClick={() => onRichTextCommand("pageOrientation")}
            title="Orientation"
          >
            <SquareSplitVertical size={18} />
            <span>Orientation</span>
          </button>
          <button
            type="button"
            className="de-layouttab-btn"
            onClick={() => onRichTextCommand("pageSize")}
            title="Size"
          >
            <Rows3 size={18} />
            <span>Size</span>
          </button>
          <button
            type="button"
            className="de-layouttab-btn"
            onClick={() => onRichTextCommand("columns")}
            title="Columns"
          >
            <Columns2 size={18} />
            <span>Columns</span>
          </button>
        </div>
      </div>

      {/* Page Background */}
      <div className="de-layouttab-group">
        <span className="de-layouttab-label">Background</span>
        <div className="de-layouttab-elset">
          <button type="button" className="de-layouttab-btn" title="Watermark">
            <BringToFront size={18} />
            <span>Watermark</span>
          </button>
          <button type="button" className="de-layouttab-btn" title="Page Color">
            <PaintBucket size={18} />
            <span>Color</span>
          </button>
        </div>
      </div>

      {/* Paragraph */}
      <div className="de-layouttab-group">
        <span className="de-layouttab-label">Paragraph</span>
        <div className="de-layouttab-elset">
          <button
            type="button"
            className="de-layouttab-btn"
            onClick={() => onRichTextCommand("indent")}
            title="Increase Indent"
          >
            <IndentIncrease size={18} />
            <span>Indent</span>
          </button>
          <button
            type="button"
            className="de-layouttab-btn"
            onClick={() => onRichTextCommand("lineSpacing")}
            title="Line Spacing"
          >
            <TextSelect size={18} />
            <span>Spacing</span>
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedLayoutTab as LayoutTab }
