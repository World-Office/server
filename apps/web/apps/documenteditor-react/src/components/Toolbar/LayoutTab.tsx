import { observer } from "mobx-react-lite"
import type { RichTextCommand } from "../../lib/rte-command"

interface LayoutTabProps {
  onRichTextCommand: (command: RichTextCommand) => void
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
        <div className="de-layouttab-elset">
          <span className="de-layouttab-label">Page Setup</span>
        </div>
        <div className="de-layouttab-elset">
          <button type="button" className="de-layouttab-btn" title="Margins">
            Margins
          </button>
          <button type="button" className="de-layouttab-btn" title="Orientation">
            Orientation
          </button>
          <button type="button" className="de-layouttab-btn" title="Size">
            Size
          </button>
          <button type="button" className="de-layouttab-btn" title="Columns">
            Columns
          </button>
        </div>
      </div>

      <div className="de-layouttab-separator" />

      {/* Page Background */}
      <div className="de-layouttab-group">
        <div className="de-layouttab-elset">
          <span className="de-layouttab-label">Page Background</span>
        </div>
        <div className="de-layouttab-elset">
          <button type="button" className="de-layouttab-btn" title="Watermark">
            Watermark
          </button>
          <button type="button" className="de-layouttab-btn" title="Page Color">
            Page Color
          </button>
          <button type="button" className="de-layouttab-btn" title="Page Borders">
            Page Borders
          </button>
        </div>
      </div>

      <div className="de-layouttab-separator" />

      {/* Paragraph */}
      <div className="de-layouttab-group">
        <div className="de-layouttab-elset">
          <span className="de-layouttab-label">Paragraph</span>
        </div>
        <div className="de-layouttab-elset">
          <button
            type="button"
            className="de-layouttab-btn"
            onClick={() => onRichTextCommand("indent")}
            title="Indent"
          >
            Indent
          </button>
          <button
            type="button"
            className="de-layouttab-btn"
            onClick={() => onRichTextCommand("lineSpacing")}
            title="Line Spacing"
          >
            Line Spacing
          </button>
          <button
            type="button"
            className="de-layouttab-btn"
            onClick={() => onRichTextCommand("paragraphSpacingBefore")}
            title="Space Before Paragraph"
          >
            Space Before
          </button>
          <button
            type="button"
            className="de-layouttab-btn"
            onClick={() => onRichTextCommand("paragraphSpacingAfter")}
            title="Space After Paragraph"
          >
            Space After
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedLayoutTab as LayoutTab }
