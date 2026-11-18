/**
 * FormPanel — right menu panel for form control properties.
 *
 * Provides controls for content control types (plain text, checkbox,
 * dropdown, date picker). Dispatches wo-command events to the editor.
 *
 * PGP-4 — post-insert editing: when a placed form control is selected in
 * the document, the panel shows a contextual "Edit Form Control" section
 * pre-filled with the node's current attributes (dropdown option list,
 * control title/tag, placeholder, checkbox state, date value/format) and
 * a Save button that writes them back via chain.updateAttributes. No
 * window.prompt anywhere on this path.
 *
 * PGP-9 — filling status: a "Filling status" section reports how many of
 * the placed controls are filled (totals + per-control list), recomputed
 * on every editor transaction while the panel is open.
 */

import type { Editor } from "@tiptap/core"
import { type JSX, useEffect, useState } from "react"

import {
  type SelectedFormControl,
  FORM_CONTROL_LABELS,
  dropdownOptionsToLines,
  getSelectedFormControl,
  linesToDropdownOptions,
  updateFormControl,
} from "../lib/content-controls"
import {
  type FormFillStatus,
  EMPTY_FORM_FILL_STATUS,
  formatFormFillSummary,
  getFormFillStatus,
} from "../lib/form-status"
import { getActiveRichTextEditor } from "../lib/rte-command"

interface FormPanelProps {
  visible: boolean
  /** Editor to edit placed controls in; defaults to the active rich-text editor. */
  editor?: Editor | null
}

type ControlType = "plain-text" | "checkbox" | "dropdown" | "date-picker"

const CONTROL_TYPES: Array<{ id: ControlType; label: string; icon: string; description: string }> =
  [
    {
      id: "plain-text",
      label: "Plain Text",
      icon: "Aa",
      description: "A simple text field for user input",
    },
    {
      id: "checkbox",
      label: "Checkbox",
      icon: "☑",
      description: "A checkable option",
    },
    {
      id: "dropdown",
      label: "Dropdown",
      icon: "☰",
      description: "A list of predefined options",
    },
    {
      id: "date-picker",
      label: "Date Picker",
      icon: "📅",
      description: "A date selection control",
    },
  ]

/** Draft values for the contextual control editor. */
interface ControlDraft {
  title: string
  options: string
  placeholder: string
  value: string
  format: string
  checked: boolean
}

const EMPTY_DRAFT: ControlDraft = {
  title: "",
  options: "",
  placeholder: "",
  value: "",
  format: "YYYY-MM-DD",
  checked: false,
}

const SECTION_HEADER_STYLE = {
  fontWeight: 600,
  fontSize: 12,
  color: "#666",
  textTransform: "uppercase",
  marginBottom: 8,
} as const

const INPUT_STYLE = {
  width: "100%",
  padding: "4px 8px",
  border: "1px solid #ccc",
  borderRadius: 3,
  fontSize: 12,
  boxSizing: "border-box",
} as const

const TEXTAREA_STYLE = {
  ...INPUT_STYLE,
  resize: "vertical",
  fontFamily: "monospace",
} as const

const CHECK_LABEL_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "#555",
  cursor: "pointer",
} as const

function draftFromControl(control: SelectedFormControl): ControlDraft {
  return {
    title: String(control.attrs.title ?? ""),
    options: dropdownOptionsToLines(String(control.attrs.options ?? "")),
    placeholder: String(control.attrs.placeholder ?? ""),
    value: String(control.attrs.value ?? ""),
    format: String(control.attrs.format ?? "") || "YYYY-MM-DD",
    checked: control.attrs.checked === true,
  }
}

export function FormPanel({ visible, editor: editorProp }: FormPanelProps): JSX.Element | null {
  const [selectedType, setSelectedType] = useState<ControlType>("plain-text")
  const [placeholder, setPlaceholder] = useState("")
  const [dropdownOptions, setDropdownOptions] = useState("Option 1\nOption 2\nOption 3")
  const [isRequired, setIsRequired] = useState(false)
  const [isLocked, setIsLocked] = useState(false)

  const editor = editorProp ?? getActiveRichTextEditor()
  const [editingControl, setEditingControl] = useState<SelectedFormControl | null>(null)
  const [draft, setDraft] = useState<ControlDraft>(EMPTY_DRAFT)
  // PGP-9 — fill status of every placed control (kept in sync below).
  const [fillStatus, setFillStatus] = useState<FormFillStatus>(EMPTY_FORM_FILL_STATUS)

  // Track the form control under the editor selection while the panel is open,
  // plus the document-wide fill status (recomputed per editor transaction; the
  // scan is O(#controls), so no timer debounce is needed for real-time updates).
  useEffect(() => {
    if (!visible) return
    const syncFromEditor = () => {
      setEditingControl(editor ? getSelectedFormControl(editor) : null)
      setFillStatus(editor ? getFormFillStatus(editor) : EMPTY_FORM_FILL_STATUS)
    }
    syncFromEditor()
    if (!editor) return
    editor.on("selectionUpdate", syncFromEditor)
    editor.on("transaction", syncFromEditor)
    return () => {
      editor.off("selectionUpdate", syncFromEditor)
      editor.off("transaction", syncFromEditor)
    }
  }, [editor, visible])

  // (Re)load the draft from the selected control's current attributes. The
  // control object is recreated on every editor transaction, so the draft
  // also refreshes right after a save or an external attribute change.
  useEffect(() => {
    if (editingControl) setDraft(draftFromControl(editingControl))
  }, [editingControl])

  if (!visible) return null

  /** Persist the draft back onto the placed control node. */
  function handleSaveControl() {
    if (!editor || !editingControl) return
    const attrs: Record<string, unknown> = { title: draft.title.trim() }
    if (editingControl.kind === "dropdown") {
      attrs.options = linesToDropdownOptions(draft.options)
    } else if (editingControl.kind === "plain-text") {
      attrs.placeholder = draft.placeholder
    } else if (editingControl.kind === "checkbox") {
      attrs.checked = draft.checked
    } else if (editingControl.kind === "date-picker") {
      attrs.value = draft.value.trim()
      attrs.format = draft.format.trim() || "YYYY-MM-DD"
    }
    if (updateFormControl(editor, editingControl, attrs)) {
      setEditingControl(getSelectedFormControl(editor)) // re-sync the draft
    }
  }

  function handleInsert() {
    switch (selectedType) {
      case "plain-text":
        window.dispatchEvent(
          new CustomEvent("wo-command", {
            detail: { command: "insertPlainTextControl" },
          }),
        )
        break
      case "checkbox":
        window.dispatchEvent(
          new CustomEvent("wo-command", {
            detail: { command: "insertCheckboxControl" },
          }),
        )
        break
      case "dropdown":
        window.dispatchEvent(
          new CustomEvent("wo-command", {
            detail: { command: "insertDropdownControl", value: dropdownOptions },
          }),
        )
        break
      case "date-picker":
        window.dispatchEvent(
          new CustomEvent("wo-command", {
            detail: { command: "insertDatePickerControl" },
          }),
        )
        break
    }
  }

  return (
    <div
      className="de-properties-panel"
      style={{
        position: "absolute",
        right: 48,
        top: 0,
        width: 260,
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
        Form Controls
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {/* PGP-9 — document-wide fill status: totals + per-control list */}
        <div
          className="de-prop-section"
          data-testid="form-fill-status"
          style={{ marginBottom: 16 }}
        >
          <div style={SECTION_HEADER_STYLE}>Filling status</div>
          <div
            data-testid="form-fill-summary"
            style={{ fontSize: 12, color: "#333", marginBottom: 6 }}
          >
            {formatFormFillSummary(fillStatus)}
          </div>
          {fillStatus.entries.length > 0 && (
            <ul
              data-testid="form-fill-list"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {fillStatus.entries.map((entry, index) => (
                <li
                  key={`${entry.pos}-${index}`}
                  data-testid="form-fill-entry"
                  className={entry.filled ? "de-form-fill-filled" : "de-form-fill-empty"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#444",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 14,
                      textAlign: "center",
                      color: entry.filled ? "#1e8e3e" : "#999",
                    }}
                  >
                    {entry.filled ? "✓" : "○"}
                  </span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {entry.label}
                  </span>
                  <span style={{ color: entry.filled ? "#1e8e3e" : "#b0600a" }}>
                    {entry.filled ? "Filled" : "Empty"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* PGP-4 — contextual editor for the selected placed control */}
        {editingControl && (
          <div
            className="de-prop-section"
            data-testid="form-control-settings"
            style={{
              marginBottom: 16,
              padding: 10,
              border: "1px solid #c5d3ea",
              borderRadius: 4,
              background: "#f4f8ff",
            }}
          >
            <div style={{ ...SECTION_HEADER_STYLE, color: "#2b579a" }}>
              Edit Form Control — {FORM_CONTROL_LABELS[editingControl.kind]}
            </div>

            <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Title / Tag</div>
            <input
              type="text"
              aria-label="Control title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Control title (tag)"
              style={{ ...INPUT_STYLE, marginBottom: 10 }}
            />

            {editingControl.kind === "dropdown" && (
              <>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>
                  Dropdown options
                </div>
                <textarea
                  aria-label="Dropdown options"
                  value={draft.options}
                  onChange={(e) => setDraft({ ...draft, options: e.target.value })}
                  placeholder="One option per line"
                  rows={5}
                  style={{ ...TEXTAREA_STYLE, marginBottom: 10 }}
                />
              </>
            )}

            {editingControl.kind === "plain-text" && (
              <>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Placeholder</div>
                <input
                  type="text"
                  aria-label="Placeholder"
                  value={draft.placeholder}
                  onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })}
                  placeholder="Enter placeholder text…"
                  style={{ ...INPUT_STYLE, marginBottom: 10 }}
                />
              </>
            )}

            {editingControl.kind === "checkbox" && (
              <label style={{ ...CHECK_LABEL_STYLE, marginBottom: 10 }}>
                <input
                  type="checkbox"
                  aria-label="Checked"
                  checked={draft.checked}
                  onChange={(e) => setDraft({ ...draft, checked: e.target.checked })}
                />
                Checked
              </label>
            )}

            {editingControl.kind === "date-picker" && (
              <>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Date value</div>
                <input
                  type="text"
                  aria-label="Date value"
                  value={draft.value}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  placeholder="YYYY-MM-DD"
                  style={{ ...INPUT_STYLE, marginBottom: 10 }}
                />
                <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Date format</div>
                <input
                  type="text"
                  aria-label="Date format"
                  value={draft.format}
                  onChange={(e) => setDraft({ ...draft, format: e.target.value })}
                  placeholder="YYYY-MM-DD"
                  style={{ ...INPUT_STYLE, marginBottom: 10 }}
                />
              </>
            )}

            <button
              type="button"
              aria-label="Save control settings"
              onClick={handleSaveControl}
              style={{
                width: "100%",
                padding: "6px 12px",
                border: "none",
                borderRadius: 4,
                background: "#2b579a",
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Save changes
            </button>
          </div>
        )}

        {!editingControl && (
          <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>
            Tip: select a control in the document to edit its options here.
          </div>
        )}

        {/* Control Type Selection */}
        <div className="de-prop-section" style={{ marginBottom: 16 }}>
          <div style={SECTION_HEADER_STYLE}>Control Type</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {CONTROL_TYPES.map((ct) => (
              <button
                key={ct.id}
                type="button"
                onClick={() => setSelectedType(ct.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  border: selectedType === ct.id ? "1px solid #2b579a" : "1px solid #ddd",
                  borderRadius: 4,
                  background: selectedType === ct.id ? "#e8f0fe" : "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "#333",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{ct.icon}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{ct.label}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{ct.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Placeholder (for text controls) */}
        {selectedType === "plain-text" && (
          <div className="de-prop-section" style={{ marginBottom: 16 }}>
            <div style={SECTION_HEADER_STYLE}>Placeholder</div>
            <input
              type="text"
              aria-label="New control placeholder"
              value={placeholder}
              onChange={(e) => setPlaceholder(e.target.value)}
              placeholder="Enter placeholder text…"
              style={INPUT_STYLE}
            />
          </div>
        )}

        {/* Dropdown Options */}
        {selectedType === "dropdown" && (
          <div className="de-prop-section" style={{ marginBottom: 16 }}>
            <div style={SECTION_HEADER_STYLE}>Options</div>
            <textarea
              aria-label="New dropdown options"
              value={dropdownOptions}
              onChange={(e) => setDropdownOptions(e.target.value)}
              placeholder="One option per line"
              rows={5}
              style={TEXTAREA_STYLE}
            />
          </div>
        )}

        {/* Date Picker Default */}
        {selectedType === "date-picker" && (
          <div className="de-prop-section" style={{ marginBottom: 16 }}>
            <div style={SECTION_HEADER_STYLE}>Default Date</div>
            <input
              type="date"
              aria-label="New control default date"
              style={INPUT_STYLE}
            />
          </div>
        )}

        {/* Options */}
        <div className="de-prop-section" style={{ marginBottom: 16 }}>
          <div style={SECTION_HEADER_STYLE}>Options</div>
          <label style={{ ...CHECK_LABEL_STYLE, marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            Required
          </label>
          <label style={CHECK_LABEL_STYLE}>
            <input
              type="checkbox"
              checked={isLocked}
              onChange={(e) => setIsLocked(e.target.checked)}
            />
            Locked (read-only)
          </label>
        </div>

        {/* Insert Button */}
        <button
          type="button"
          onClick={handleInsert}
          style={{
            width: "100%",
            padding: "8px 16px",
            border: "none",
            borderRadius: 4,
            background: "#2b579a",
            color: "#fff",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Insert Control
        </button>
      </div>
    </div>
  )
}
