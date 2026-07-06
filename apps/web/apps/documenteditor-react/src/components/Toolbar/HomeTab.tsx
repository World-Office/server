import { observer } from "mobx-react-lite"
import type { RichTextCommand } from "../../lib/rte-command"
import type { MonacoCommand } from "./MonacoCommand"

interface HomeTabProps {
  onMonacoCommand: (command: MonacoCommand) => void
  onRichTextCommand: (command: RichTextCommand) => void
}

const ObservedHomeTab = observer(function ObservedHomeTab({
  onMonacoCommand,
  onRichTextCommand,
}: HomeTabProps) {
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
            onClick={() => onRichTextCommand("undo")}
            title="Undo"
          >
            Undo
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("redo")}
            title="Redo"
          >
            Redo
          </button>
        </div>
      </div>

      <div className="de-hometab-separator" />

      {/* Font */}
      <div className="de-hometab-group">
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("bold")}
            title="Bold"
          >
            B
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("italic")}
            title="Italic"
          >
            I
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("underline")}
            title="Underline"
          >
            U
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("strike")}
            title="Strikethrough"
          >
            S
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("subscript")}
            title="Subscript"
          >
            x₂
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("superscript")}
            title="Superscript"
          >
            x²
          </button>
        </div>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("fontSize")}
            title="Font Size"
          >
            A+
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("fontSize")}
            title="Font Size"
          >
            A-
          </button>
        </div>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("textColor")}
            title="Text Color"
          >
            A
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("highlight")}
            title="Text Highlight Color"
          >
            Ab
          </button>
        </div>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("blockquote")}
            title="Blockquote"
          >
            Quote
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("codeBlock")}
            title="Code Block"
          >
            Code
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("clearFormatting")}
            title="Clear Formatting"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="de-hometab-separator" />

      {/* Font Family & Size */}
      <div className="de-hometab-group">
        <div className="de-hometab-elset">
          <span className="de-hometab-label">Font</span>
        </div>
        <div className="de-hometab-elset">
          <select
            className="de-hometab-select"
            onChange={(e) => {
              const val = e.target.value
              if (val) {
                onRichTextCommand("fontFamily")
              }
            }}
            title="Font Family"
            style={{ maxWidth: 120 }}
          >
            <option value="">Font</option>
            <option value="Aptos">Aptos</option>
            <option value="Calibri">Calibri</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
          </select>
          <select
            className="de-hometab-select"
            onChange={(e) => {
              const val = e.target.value
              if (val) {
                onRichTextCommand("fontSize")
              }
            }}
            title="Font Size"
            style={{ maxWidth: 60 }}
          >
            <option value="">Size</option>
            <option value="8pt">8</option>
            <option value="9pt">9</option>
            <option value="10pt">10</option>
            <option value="11pt">11</option>
            <option value="12pt">12</option>
            <option value="14pt">14</option>
            <option value="16pt">16</option>
            <option value="18pt">18</option>
            <option value="20pt">20</option>
            <option value="24pt">24</option>
            <option value="28pt">28</option>
            <option value="36pt">36</option>
            <option value="48pt">48</option>
            <option value="72pt">72</option>
          </select>
        </div>
      </div>

      <div className="de-hometab-separator" />

      {/* Paragraph */}
      <div className="de-hometab-group">
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("bulletList")}
            title="Bullets"
          >
            Bullets
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("orderedList")}
            title="Numbering"
          >
            Numbering
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("taskList")}
            title="Task List"
          >
            Tasks
          </button>
        </div>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("alignLeft")}
            title="Align Left"
          >
            Align Left
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("alignCenter")}
            title="Align Center"
          >
            Align Center
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("alignRight")}
            title="Align Right"
          >
            Align Right
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("alignJustify")}
            title="Justify"
          >
            Justify
          </button>
        </div>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("outdent")}
            title="Decrease Indent"
          >
            Decrease Indent
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("indent")}
            title="Increase Indent"
          >
            Increase Indent
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
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("heading1")}
            title="Heading 1"
          >
            Heading 1
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("heading2")}
            title="Heading 2"
          >
            Heading 2
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("heading3")}
            title="Heading 3"
          >
            Heading 3
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
