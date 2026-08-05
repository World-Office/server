/**
 * Styles Panel — paragraph and character style management.
 *
 * Provides a list of predefined styles that can be applied to the
 * current selection. Each style entry shows its label and can apply
 * a sequence of TipTap commands.
 */

import type { RichTextCommand } from "../lib/rte-command"

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

export function StylesPanel({ visible, onCommand }: StylesPanelProps) {
  if (!visible) return null

  function handleApply(style: StyleDefinition) {
    style.apply(onCommand)
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
    </div>
  )
}

export { STYLES }
