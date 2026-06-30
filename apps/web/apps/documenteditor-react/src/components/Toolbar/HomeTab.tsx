import { observer } from "mobx-react-lite"
import type { MonacoCommand } from "./MonacoCommand"

interface HomeTabProps {
  onMonacoCommand: (command: MonacoCommand) => void
}

const ObservedHomeTab = observer(function ObservedHomeTab({ onMonacoCommand }: HomeTabProps) {
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
          <button type="button" className="de-hometab-btn" title="Bold">
            B
          </button>
          <button type="button" className="de-hometab-btn" title="Italic">
            I
          </button>
          <button type="button" className="de-hometab-btn" title="Underline">
            U
          </button>
          <button type="button" className="de-hometab-btn" title="Strikethrough">
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
          <button type="button" className="de-hometab-btn" title="Bullets">
            Bullets
          </button>
          <button type="button" className="de-hometab-btn" title="Numbering">
            Numbering
          </button>
        </div>
        <div className="de-hometab-elset">
          <button type="button" className="de-hometab-btn" title="Align Left">
            Align Left
          </button>
          <button type="button" className="de-hometab-btn" title="Align Center">
            Align Center
          </button>
          <button type="button" className="de-hometab-btn" title="Align Right">
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
          <button type="button" className="de-hometab-btn" title="Heading 1">
            Heading 1
          </button>
          <button type="button" className="de-hometab-btn" title="Heading 2">
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
