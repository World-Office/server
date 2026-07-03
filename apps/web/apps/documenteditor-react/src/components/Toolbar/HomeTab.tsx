import { observer } from "mobx-react-lite"
import type { MonacoCommand } from "./MonacoCommand"
import type { RichTextCommand } from "../../lib/rte-command"

interface HomeTabProps {
  onMonacoCommand: (command: MonacoCommand) => void
  onRichTextCommand: (command: RichTextCommand) => void
}

const ObservedHomeTab = observer(function ObservedHomeTab({ onMonacoCommand, onRichTextCommand }: HomeTabProps) {
  return (
    <section className="de-hometab-panel" data-tab="home" role="tabpanel" aria-labelledby="home">
      {/* Clipboard */}
      <div className="de-hometab-group">
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onMonacoCommand("cut")}
            title="Cut"
          >
            Cut
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onMonacoCommand("copy")}
            title="Copy"
          >
            Copy
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onMonacoCommand("paste")}
            title="Paste"
          >
            Paste
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => {}}
            title="Format Painter"
          >
            Format Painter
          </button>
        </div>
      </div>

      <div className="de-hometab-separator" />

      {/* Font */}
      <div className="de-hometab-group">
        <div className="de-hometab-elset">
          <button type="button" className="de-hometab-btn" onClick={() => onRichTextCommand("bold")} title="Bold">
            B
          </button>
          <button type="button" className="de-hometab-btn" onClick={() => onRichTextCommand("italic")} title="Italic">
            I
          </button>
          <button type="button" className="de-hometab-btn" onClick={() => onRichTextCommand("underline")} title="Underline">
            U
          </button>
          <button type="button" className="de-hometab-btn" onClick={() => onRichTextCommand("strike")} title="Strikethrough">
            S
          </button>
        </div>
        <div className="de-hometab-elset">
          <button type="button" className="de-hometab-btn" title="Increase Font Size">
            A+
          </button>
          <button type="button" className="de-hometab-btn" title="Decrease Font Size">
            A-
          </button>
        </div>
        <div className="de-hometab-elset">
          <button type="button" className="de-hometab-btn" title="Text Color">
            A
          </button>
          <button type="button" className="de-hometab-btn" title="Text Highlight Color">
            Ab
          </button>
        </div>
      </div>

      <div className="de-hometab-separator" />

      {/* Paragraph */}
      <div className="de-hometab-group">
        <div className="de-hometab-elset">
          <button type="button" className="de-hometab-btn" onClick={() => onRichTextCommand("bulletList")} title="Bullets">
            Bullets
          </button>
          <button type="button" className="de-hometab-btn" onClick={() => onRichTextCommand("orderedList")} title="Numbering">
            Numbering
          </button>
        </div>
        <div className="de-hometab-elset">
          <button type="button" className="de-hometab-btn" onClick={() => onRichTextCommand("alignLeft")} title="Align Left">
            Align Left
          </button>
          <button type="button" className="de-hometab-btn" onClick={() => onRichTextCommand("alignCenter")} title="Align Center">
            Align Center
          </button>
          <button type="button" className="de-hometab-btn" onClick={() => onRichTextCommand("alignRight")} title="Align Right">
            Align Right
          </button>
        </div>
        <div className="de-hometab-elset">
          <button type="button" className="de-hometab-btn" title="Decrease Indent">
            Decrease Indent
          </button>
          <button type="button" className="de-hometab-btn" title="Increase Indent">
            Increase Indent
          </button>
        </div>
        <div className="de-hometab-elset">
          <button type="button" className="de-hometab-btn" title="Line Spacing">
            Line Spacing
          </button>
        </div>
      </div>

      <div className="de-hometab-separator" />

      {/* Styles */}
      <div className="de-hometab-group">
        <div className="de-hometab-elset">
          <span className="de-hometab-label">Styles</span>
        </div>
        <div className="de-hometab-elset">
          <button type="button" className="de-hometab-btn" title="Normal">
            Normal
          </button>
          <button type="button" className="de-hometab-btn" title="No Spacing">
            No Spacing
          </button>
        </div>
        <div className="de-hometab-elset">
          <button type="button" className="de-hometab-btn" onClick={() => onRichTextCommand("heading1")} title="Heading 1">
            Heading 1
          </button>
          <button type="button" className="de-hometab-btn" onClick={() => onRichTextCommand("heading2")} title="Heading 2">
            Heading 2
          </button>
        </div>
      </div>

      <div className="de-hometab-separator" />

      {/* Editing */}
      <div className="de-hometab-group">
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onMonacoCommand("find")}
            title="Find"
          >
            Find
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onMonacoCommand("replace")}
            title="Replace"
          >
            Replace
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedHomeTab as HomeTab }
