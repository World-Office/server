/**
 * FormPanel — right menu panel for form control properties.
 *
 * Provides controls for content control types (plain text, checkbox,
 * dropdown, date picker). Dispatches wo-command events to the editor.
 */

import { type JSX, useState } from "react"

interface FormPanelProps {
  visible: boolean
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

export function FormPanel({ visible }: FormPanelProps): JSX.Element | null {
  const [selectedType, setSelectedType] = useState<ControlType>("plain-text")
  const [placeholder, setPlaceholder] = useState("")
  const [dropdownOptions, setDropdownOptions] = useState("Option 1\nOption 2\nOption 3")
  const [isRequired, setIsRequired] = useState(false)
  const [isLocked, setIsLocked] = useState(false)

  if (!visible) return null

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
        {/* Control Type Selection */}
        <div className="de-prop-section" style={{ marginBottom: 16 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 12,
              color: "#666",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Control Type
          </div>
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
            <div
              style={{
                fontWeight: 600,
                fontSize: 12,
                color: "#666",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Placeholder
            </div>
            <input
              type="text"
              value={placeholder}
              onChange={(e) => setPlaceholder(e.target.value)}
              placeholder="Enter placeholder text\u2026"
              style={{
                width: "100%",
                padding: "4px 8px",
                border: "1px solid #ccc",
                borderRadius: 3,
                fontSize: 12,
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* Dropdown Options */}
        {selectedType === "dropdown" && (
          <div className="de-prop-section" style={{ marginBottom: 16 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 12,
                color: "#666",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Options
            </div>
            <textarea
              value={dropdownOptions}
              onChange={(e) => setDropdownOptions(e.target.value)}
              placeholder="One option per line"
              rows={5}
              style={{
                width: "100%",
                padding: "4px 8px",
                border: "1px solid #ccc",
                borderRadius: 3,
                fontSize: 12,
                boxSizing: "border-box",
                resize: "vertical",
                fontFamily: "monospace",
              }}
            />
          </div>
        )}

        {/* Date Picker Default */}
        {selectedType === "date-picker" && (
          <div className="de-prop-section" style={{ marginBottom: 16 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 12,
                color: "#666",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Default Date
            </div>
            <input
              type="date"
              style={{
                width: "100%",
                padding: "4px 8px",
                border: "1px solid #ccc",
                borderRadius: 3,
                fontSize: 12,
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* Options */}
        <div className="de-prop-section" style={{ marginBottom: 16 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 12,
              color: "#666",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Options
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#555",
              cursor: "pointer",
              marginBottom: 6,
            }}
          >
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            Required
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#555",
              cursor: "pointer",
            }}
          >
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
