import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ClipboardPaste,
  Code2,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Palette,
  Redo2,
  RemoveFormatting,
  Replace,
  Scissors,
  Search,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  TextQuote,
  Underline,
  Undo2,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import type { RichTextCommand } from "../../lib/rte-command"
import type { MonacoCommand } from "./MonacoCommand"

interface HomeTabProps {
  onMonacoCommand: (command: MonacoCommand) => void
  onRichTextCommand: (command: RichTextCommand, value?: string) => void
}

const ObservedHomeTab = observer(function ObservedHomeTab({
  onMonacoCommand,
  onRichTextCommand,
}: HomeTabProps) {
  return (
    <section className="de-hometab-panel" data-tab="home" role="tabpanel" aria-labelledby="home">
      {/* Clipboard */}
      <div className="de-hometab-group">
        <span className="de-hometab-label">Clipboard</span>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onMonacoCommand("cut")}
            title="Cut"
          >
            <Scissors size={18} />
            <span>Cut</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onMonacoCommand("copy")}
            title="Copy"
          >
            <Copy size={18} />
            <span>Copy</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onMonacoCommand("paste")}
            title="Paste"
          >
            <ClipboardPaste size={18} />
            <span>Paste</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("undo")}
            title="Undo"
          >
            <Undo2 size={18} />
            <span>Undo</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("redo")}
            title="Redo"
          >
            <Redo2 size={18} />
            <span>Redo</span>
          </button>
        </div>
      </div>

      {/* Font */}
      <div className="de-hometab-group">
        <span className="de-hometab-label">Font</span>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("bold")}
            title="Bold (Ctrl+B)"
          >
            <Bold size={18} />
            <span>Bold</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("italic")}
            title="Italic (Ctrl+I)"
          >
            <Italic size={18} />
            <span>Italic</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("underline")}
            title="Underline (Ctrl+U)"
          >
            <Underline size={18} />
            <span>Underline</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("strike")}
            title="Strikethrough"
          >
            <Strikethrough size={18} />
            <span>Strike</span>
          </button>
        </div>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("subscript")}
            title="Subscript"
          >
            <Subscript size={18} />
            <span>Sub</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("superscript")}
            title="Superscript"
          >
            <Superscript size={18} />
            <span>Super</span>
          </button>
        </div>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("textColor")}
            title="Text Color"
          >
            <Palette size={18} />
            <span>Color</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("clearFormatting")}
            title="Clear Formatting"
          >
            <RemoveFormatting size={18} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Font Family & Size */}
      <div className="de-hometab-group">
        <span className="de-hometab-label">Font</span>
        <div className="de-hometab-elset">
          <select
            className="de-hometab-select"
            onChange={(e) => {
              const val = e.target.value
              if (val) {
                onRichTextCommand("fontFamily", val)
              }
            }}
            title="Font Family"
            style={{ maxWidth: 110 }}
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
                onRichTextCommand("fontSize", val)
              }
            }}
            title="Font Size"
            style={{ maxWidth: 55 }}
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
        <span className="de-hometab-label">Size</span>
      </div>

      {/* Paragraph */}
      <div className="de-hometab-group">
        <span className="de-hometab-label">Paragraph</span>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("bulletList")}
            title="Bullet List"
          >
            <List size={18} />
            <span>Bullets</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("orderedList")}
            title="Numbered List"
          >
            <ListOrdered size={18} />
            <span>Numbering</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("taskList")}
            title="Task List"
          >
            <ListChecks size={18} />
            <span>Tasks</span>
          </button>
        </div>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("alignLeft")}
            title="Align Left"
          >
            <AlignLeft size={18} />
            <span>Left</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("alignCenter")}
            title="Align Center"
          >
            <AlignCenter size={18} />
            <span>Center</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("alignRight")}
            title="Align Right"
          >
            <AlignRight size={18} />
            <span>Right</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("alignJustify")}
            title="Justify"
          >
            <AlignJustify size={18} />
            <span>Justify</span>
          </button>
        </div>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("outdent")}
            title="Decrease Indent"
          >
            <IndentDecrease size={18} />
            <span>Outdent</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("indent")}
            title="Increase Indent"
          >
            <IndentIncrease size={18} />
            <span>Indent</span>
          </button>
        </div>
      </div>

      {/* Styles */}
      <div className="de-hometab-group">
        <span className="de-hometab-label">Styles</span>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("heading1")}
            title="Heading 1"
          >
            <Heading1 size={18} />
            <span>H1</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("heading2")}
            title="Heading 2"
          >
            <Heading2 size={18} />
            <span>H2</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("heading3")}
            title="Heading 3"
          >
            <Heading3 size={18} />
            <span>H3</span>
          </button>
        </div>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("blockquote")}
            title="Blockquote"
          >
            <TextQuote size={18} />
            <span>Quote</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("codeBlock")}
            title="Code Block"
          >
            <Code2 size={18} />
            <span>Code</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="de-hometab-group">
        <span className="de-hometab-label">Table</span>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("insertTable")}
            title="Insert Table"
          >
            <Table2 size={18} />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* Editing */}
      <div className="de-hometab-group">
        <span className="de-hometab-label">Editing</span>
        <div className="de-hometab-elset">
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onMonacoCommand("find")}
            title="Find"
          >
            <Search size={18} />
            <span>Find</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onMonacoCommand("replace")}
            title="Replace"
          >
            <Replace size={18} />
            <span>Replace</span>
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedHomeTab as HomeTab }
