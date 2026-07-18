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
  SpellCheck,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  TextQuote,
  Underline,
  Undo2,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { RichTextCommand } from "../../lib/rte-command"
import { useSpellcheck } from "../../lib/spellcheck-context"
import type { MonacoCommand } from "./MonacoCommand"

interface HomeTabProps {
  onMonacoCommand: (command: MonacoCommand) => void
  onRichTextCommand: (command: RichTextCommand, value?: string) => void
}

const HIGHLIGHT_PRESETS = [
  { color: "#ffff00", label: "Yellow" },
  { color: "#ffcc00", label: "Gold" },
  { color: "#ff8800", label: "Orange" },
  { color: "#ff6666", label: "Pink" },
  { color: "#ff0000", label: "Red" },
  { color: "#00ff00", label: "Green" },
  { color: "#00ccff", label: "Cyan" },
  { color: "#3399ff", label: "Blue" },
  { color: "#9966ff", label: "Purple" },
  { color: "#999999", label: "Gray" },
]

const LINE_SPACING_OPTIONS = [
  { value: "1", label: "1.0" },
  { value: "1.15", label: "1.15" },
  { value: "1.5", label: "1.5" },
  { value: "2", label: "2.0" },
  { value: "2.5", label: "2.5" },
  { value: "3", label: "3.0" },
]

const STYLE_OPTIONS: Array<{ command: RichTextCommand; label: string }> = [
  { command: "normal", label: "Normal" },
  { command: "heading1", label: "Heading 1" },
  { command: "heading2", label: "Heading 2" },
  { command: "heading3", label: "Heading 3" },
  { command: "heading4", label: "Heading 4" },
  { command: "heading5", label: "Heading 5" },
  { command: "heading6", label: "Heading 6" },
  { command: "blockquote", label: "Quote" },
  { command: "codeBlock", label: "Code" },
]

const ObservedHomeTab = observer(function ObservedHomeTab({
  onMonacoCommand,
  onRichTextCommand,
}: HomeTabProps) {
  const sc = useSpellcheck()
  const { t } = useTranslation()
  const [highlightOpen, setHighlightOpen] = useState(false)
  const [lineSpacingOpen, setLineSpacingOpen] = useState(false)
  const [styleGalleryOpen, setStyleGalleryOpen] = useState(false)

  return (
    <section className="de-hometab-panel" data-tab="home" role="tabpanel" aria-labelledby="home">
      {/* Clipboard */}
      <div className="de-hometab-group">
        <span className="de-hometab-label">{t("Clipboard")}</span>
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
          {/* Highlight color dropdown */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="de-hometab-btn"
              onClick={() => setHighlightOpen(!highlightOpen)}
              onBlur={() => setTimeout(() => setHighlightOpen(false), 200)}
              title="Highlight Color"
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#000",
                  background: "#ffff00",
                  borderRadius: 3,
                }}
              >
                A
              </span>
              <span>HL</span>
            </button>
            {highlightOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  zIndex: 1000,
                  background: "#fff",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  padding: 8,
                  width: 180,
                  display: "grid",
                  gridTemplateColumns: "repeat(5, 1fr)",
                  gap: 4,
                }}
              >
                {HIGHLIGHT_PRESETS.map((preset) => (
                  <button
                    key={preset.color}
                    type="button"
                    title={preset.label}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onRichTextCommand("highlight", preset.color)
                      setHighlightOpen(false)
                    }}
                    style={{
                      width: 30,
                      height: 30,
                      background: preset.color,
                      border: "1px solid #ddd",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  />
                ))}
                <button
                  type="button"
                  title="No Color"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onRichTextCommand("highlight", "transparent")
                    setHighlightOpen(false)
                  }}
                  style={{
                    width: 30,
                    height: 30,
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    color: "#c00",
                    gridColumn: "span 1",
                  }}
                >
                  /
                </button>
              </div>
            )}
          </div>
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
          {/* Line spacing dropdown */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="de-hometab-btn"
              onClick={() => setLineSpacingOpen(!lineSpacingOpen)}
              onBlur={() => setTimeout(() => setLineSpacingOpen(false), 200)}
              title="Line Spacing"
            >
              <span style={{ fontSize: 11, fontWeight: 700 }}>L/S</span>
              <span style={{ fontSize: 9 }}>▼</span>
            </button>
            {lineSpacingOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  zIndex: 1000,
                  background: "#fff",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  padding: 4,
                  minWidth: 120,
                }}
              >
                {LINE_SPACING_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onRichTextCommand("lineSpacing", opt.value)
                      setLineSpacingOpen(false)
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 12px",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontSize: 13,
                      borderRadius: 4,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f0f0f0"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "none"
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Styles */}
      <div className="de-hometab-group">
        <span className="de-hometab-label">Styles</span>
        {/* Style gallery dropdown */}
        <div className="de-hometab-elset" style={{ position: "relative" }}>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => setStyleGalleryOpen(!styleGalleryOpen)}
            onBlur={() => setTimeout(() => setStyleGalleryOpen(false), 200)}
            title="Style Gallery"
            style={{ minWidth: 80 }}
          >
            <span>Normal</span>
            <span style={{ fontSize: 9, marginLeft: 4 }}>▼</span>
          </button>
          {styleGalleryOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                zIndex: 1000,
                background: "#fff",
                border: "1px solid #ccc",
                borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                padding: 4,
                minWidth: 140,
              }}
            >
              {STYLE_OPTIONS.map((style) => (
                <button
                  key={style.label}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onRichTextCommand(style.command)
                    setStyleGalleryOpen(false)
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 12px",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    borderRadius: 4,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f0f0f0"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "none"
                  }}
                >
                  {style.label}
                </button>
              ))}
            </div>
          )}
        </div>
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
          {/* Text direction buttons */}
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("setTextDirection", "ltr")}
            title="Left to Right"
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>LTR</span>
          </button>
          <button
            type="button"
            className="de-hometab-btn"
            onClick={() => onRichTextCommand("setTextDirection", "rtl")}
            title="Right to Left"
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>RTL</span>
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

      {/* Spellcheck */}
      <div className="de-hometab-group">
        <span className="de-hometab-label">Spellcheck</span>
        <div className="de-hometab-elset">
          <button
            type="button"
            className={`de-hometab-btn${sc.enabled ? " active" : ""}`}
            onClick={sc.toggleEnabled}
            title={sc.enabled ? "Disable spellcheck" : "Enable spellcheck"}
          >
            <SpellCheck size={18} />
            <span>{sc.enabled ? "On" : "Off"}</span>
          </button>
        </div>
        {sc.loading && (
          <div className="de-hometab-elset">
            <span style={{ fontSize: 12, color: "#888", padding: "0 8px" }}>
              Loading dictionaries...
            </span>
          </div>
        )}
        {sc.availableLanguages.length > 0 && (
          <div className="de-hometab-elset">
            <select
              value={sc.language}
              onChange={(e) => sc.switchLanguage(e.target.value)}
              style={{
                padding: "2px 4px",
                fontSize: 12,
                border: "1px solid #ccc",
                borderRadius: 3,
              }}
            >
              {sc.availableLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </section>
  )
})

export { ObservedHomeTab as HomeTab }
