/**
 * Styles Panel — paragraph and character style management.
 *
 * Provides a list of predefined styles that can be applied to the
 * current selection. Each style entry shows its label and can apply
 * a sequence of TipTap commands.
 */

import { type CSSProperties, useEffect, useState } from "react"
import {
  LIST_NUMBERING_FORMATS,
  type ListNumberingFormatId,
  type RichTextCommand,
} from "../lib/rte-command"
import {
  applyUserStyle,
  getUserStyles,
  renameUserStyle,
  subscribeUserStyles,
  type UserStyle,
} from "../lib/word-commands"

export interface StyleDefinition {
  id: string
  label: string
  description: string
  preview: Partial<{
    fontFamily: string
    fontSize: string
    fontWeight: string
    fontStyle: string
    color: string
    borderLeft: string
    background: string
  }>
  apply(dispatch: (cmd: RichTextCommand, value?: string) => void): void
}

const STYLES: StyleDefinition[] = [
  {
    id: "normal",
    label: "Normal",
    description: "Default paragraph style",
    preview: { fontFamily: "Aptos", fontSize: "11pt" },
    apply(dispatch) {
      dispatch("normal")
      dispatch("fontSize", "11pt")
      dispatch("fontFamily", "Aptos")
      dispatch("lineSpacing", "1.15")
    },
  },
  {
    id: "title",
    label: "Title",
    description: "Document title",
    preview: { fontFamily: "Aptos", fontSize: "26pt", fontWeight: "700" },
    apply(dispatch) {
      dispatch("heading1")
      dispatch("fontSize", "26pt")
      dispatch("fontFamily", "Aptos")
      dispatch("alignCenter")
    },
  },
  {
    id: "subtitle",
    label: "Subtitle",
    description: "Document subtitle",
    preview: { fontFamily: "Aptos", fontSize: "14pt", color: "#5f5f5f" },
    apply(dispatch) {
      dispatch("heading2")
      dispatch("fontSize", "14pt")
      dispatch("fontFamily", "Aptos")
      dispatch("alignCenter")
    },
  },
  {
    id: "heading1",
    label: "Heading 1",
    description: "Top-level heading",
    preview: { fontFamily: "Aptos", fontSize: "20pt", fontWeight: "700" },
    apply(dispatch) {
      dispatch("heading1")
      dispatch("fontSize", "20pt")
      dispatch("fontFamily", "Aptos")
      dispatch("lineSpacing", "1.5")
    },
  },
  {
    id: "heading2",
    label: "Heading 2",
    description: "Section heading",
    preview: { fontFamily: "Aptos", fontSize: "16pt", fontWeight: "600" },
    apply(dispatch) {
      dispatch("heading2")
      dispatch("fontSize", "16pt")
      dispatch("fontFamily", "Aptos")
    },
  },
  {
    id: "heading3",
    label: "Heading 3",
    description: "Sub-section heading",
    preview: { fontFamily: "Aptos", fontSize: "14pt", fontWeight: "600" },
    apply(dispatch) {
      dispatch("heading3")
      dispatch("fontSize", "14pt")
      dispatch("fontFamily", "Aptos")
    },
  },
  {
    id: "quote",
    label: "Quote",
    description: "Block quotation",
    preview: {
      fontFamily: "Georgia",
      fontSize: "12pt",
      fontStyle: "italic",
      borderLeft: "3px solid #2ecc71",
      color: "#555",
    },
    apply(dispatch) {
      dispatch("blockquote")
      dispatch("fontFamily", "Georgia")
      dispatch("fontSize", "12pt")
      dispatch("lineSpacing", "1.5")
    },
  },
  {
    id: "code",
    label: "Code Block",
    description: "Monospaced code block",
    preview: { fontFamily: "'Courier New', monospace", fontSize: "10pt", background: "#f5f5f5" },
    apply(dispatch) {
      dispatch("codeBlock")
      dispatch("fontFamily", "Courier New")
    },
  },
]

interface StylesPanelProps {
  visible: boolean
  onCommand: (command: RichTextCommand, value?: string) => void
}

/**
 * Preview CSS derived from a captured formatting snapshot (WASM
 * applyFormatting keys — fontSize is half-points, like the engine).
 */
function snapshotPreviewCss(formatting: Record<string, unknown>): CSSProperties {
  const css: CSSProperties = {}
  if (formatting.bold) css.fontWeight = "700"
  if (formatting.italic) css.fontStyle = "italic"
  if (formatting.underline) css.textDecoration = "underline"
  if (typeof formatting.fontName === "string") css.fontFamily = formatting.fontName
  if (typeof formatting.fontSize === "number") css.fontSize = `${formatting.fontSize / 2}pt`
  if (typeof formatting.textColor === "string") css.color = formatting.textColor
  return css
}

export function StylesPanel({ visible, onCommand }: StylesPanelProps) {
  // User-named styles (OO dialogs/Style Title — "formatting as style").
  // The registry lives in word-commands.ts; this mirror re-renders on every
  // registry change. Hooks run before the visibility early-return on
  // purpose (React requires them unconditionally).
  const [savedStyles, setSavedStyles] = useState<readonly UserStyle[]>(() => [...getUserStyles()])
  const [nameDraft, setNameDraft] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")

  useEffect(() => subscribeUserStyles(() => setSavedStyles([...getUserStyles()])), [])

  if (!visible) return null

  function handleApply(style: StyleDefinition) {
    style.apply(onCommand)
  }

  /**
   * OO "Formatting as style": capture the current selection's formatting
   * under the typed name (blank → next default "Style N"). Routed through
   * the word-command bridge — the same path the OO ctx-menu row takes.
   */
  function handleSaveStyle() {
    window.dispatchEvent(
      new CustomEvent("wo-command", {
        detail: { command: "formattingAsStyle", value: nameDraft.trim() || undefined },
      }),
    )
    setNameDraft("")
  }

  function handleBeginRename(style: UserStyle) {
    setRenamingId(style.id)
    setRenameDraft(style.name)
  }

  function handleCommitRename() {
    if (renamingId !== null) renameUserStyle(renamingId, renameDraft)
    setRenamingId(null)
  }

  function handleCancelRename() {
    setRenamingId(null)
  }

  return (
    <div
      className="de-styles-panel"
      style={{
        position: "absolute",
        right: 48,
        top: 0,
        width: 220,
        height: "100%",
        background: "#fff",
        borderLeft: "1px solid #e0e0e0",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Aptos', 'Calibri', 'Segoe UI', Roboto, sans-serif",
        fontSize: 13,
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e0e0e0",
          fontWeight: 600,
          fontSize: 14,
          background: "#f8f9fa",
        }}
      >
        Styles
      </div>

      {/* Style list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => handleApply(style)}
            title={style.description}
            style={{
              display: "block",
              width: "100%",
              padding: "10px 16px",
              border: "none",
              borderBottom: "1px solid #f0f0f0",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: style.preview.fontFamily ?? "inherit",
              fontSize: style.preview.fontSize ?? "13px",
              fontWeight: (style.preview.fontWeight as unknown as number) ?? 400,
              fontStyle: style.preview.fontStyle ?? "normal",
              color: style.preview.color ?? "#333",
              borderLeft: style.preview.borderLeft ?? "none",
              backgroundClip: "padding-box",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f0f7ff"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
            }}
          >
            {style.label}
          </button>
        ))}
      </div>
      {/* User-named styles — OO dialogs/Style Title ("formatting as
          style"): capture the current selection's formatting under a name
          entered inline here (no window.prompt); entries are renamable in
          place. In-memory registry — persistence is a follow-up. */}
      <div
        style={{
          borderTop: "1px solid #e0e0e0",
          padding: "10px 16px 12px",
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: "#444" }}>
          Saved styles
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <input
            aria-label="Style name"
            placeholder="Style name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveStyle()
            }}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "4px 8px",
              border: "1px solid #d0d0d0",
              borderRadius: 4,
              fontSize: 12,
              fontFamily: "inherit",
              color: "#333",
            }}
          />
          <button
            type="button"
            title="Capture the current selection formatting as a named style"
            onClick={handleSaveStyle}
            style={listButtonStyle}
          >
            Save as style
          </button>
        </div>
        {savedStyles.length === 0 ? (
          <div style={{ fontSize: 11, color: "#888" }}>
            No saved styles yet — format text, then save it under a name.
          </div>
        ) : (
          savedStyles.map((style) =>
            renamingId === style.id ? (
              <div key={style.id} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                <input
                  aria-label={`Rename ${style.name}`}
                  value={renameDraft}
                  autoFocus
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCommitRename()
                    if (e.key === "Escape") handleCancelRename()
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "4px 8px",
                    border: "1px solid #2ecc71",
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: "inherit",
                    color: "#333",
                  }}
                />
                <button
                  type="button"
                  title="Save the new style name"
                  onClick={handleCommitRename}
                  style={listButtonStyle}
                >
                  OK
                </button>
                <button
                  type="button"
                  title="Cancel renaming"
                  onClick={handleCancelRename}
                  style={listButtonStyle}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div key={style.id} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                <button
                  type="button"
                  title={`Apply the "${style.name}" style to the selection`}
                  onClick={() => applyUserStyle(style.id)}
                  style={{
                    ...listButtonStyle,
                    flex: 1,
                    textAlign: "left",
                    ...snapshotPreviewCss(style.formatting),
                  }}
                >
                  {style.name}
                </button>
                <button
                  type="button"
                  title={`Rename "${style.name}"`}
                  onClick={() => handleBeginRename(style)}
                  style={listButtonStyle}
                >
                  Rename
                </button>
              </div>
            ),
          )
        )}
      </div>
      {/* List Styles picker — OO "List Settings" (numbering format +
          per-level indent) and "List Types" (gallery pick), mapped onto
          listNumberingStyle / listIndent rich-text commands. */}
      <div
        style={{
          borderTop: "1px solid #e0e0e0",
          padding: "10px 16px 12px",
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: "#444" }}>
          List Styles
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {LIST_TYPE_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              title={action.title}
              onClick={() => onCommand(action.command, action.value)}
              style={listButtonStyle}
            >
              {action.label}
            </button>
          ))}
        </div>
        <div style={{ fontWeight: 600, fontSize: 12, margin: "6px 0", color: "#444" }}>
          Numbering format
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {NUMBERING_FORMAT_ORDER.map((id) => {
            const format = LIST_NUMBERING_FORMATS[id]
            return (
              <button
                key={id}
                type="button"
                title={format.label}
                onClick={() => onCommand("listNumberingStyle", id)}
                style={listButtonStyle}
              >
                {format.example}
              </button>
            )
          })}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            title="Nest the current list item one level deeper"
            onClick={() => onCommand("listIndent", "down")}
            style={{ ...listButtonStyle, flex: 1 }}
          >
            Increase Indent
          </button>
          <button
            type="button"
            title="Move the current list item one level out"
            onClick={() => onCommand("listIndent", "up")}
            style={{ ...listButtonStyle, flex: 1 }}
          >
            Decrease Indent
          </button>
        </div>
      </div>
    </div>
  )
}

const listButtonStyle: CSSProperties = {
  padding: "4px 8px",
  border: "1px solid #d0d0d0",
  borderRadius: 4,
  background: "#fff",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "inherit",
  color: "#333",
}

interface ListTypeAction {
  id: string
  label: string
  title: string
  command: RichTextCommand
  value?: string
}

/** List Types gallery entries (OO list-kind picks). */
const LIST_TYPE_ACTIONS: ListTypeAction[] = [
  { id: "bullet", label: "Bulleted", title: "Bulleted list", command: "bulletList" },
  { id: "decimal", label: "Numbered", title: "Numbered list (1. 2. 3.)", command: "listNumberingStyle", value: "decimal" },
  { id: "task", label: "Task", title: "Task list", command: "taskList" },
]

/** Numbering-format picker order (OO List Settings formats). */
const NUMBERING_FORMAT_ORDER: ListNumberingFormatId[] = [
  "decimal",
  "lowerAlpha",
  "upperAlpha",
  "lowerRoman",
  "upperRoman",
]

export { STYLES }
