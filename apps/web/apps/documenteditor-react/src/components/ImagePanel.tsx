/**
 * ImagePanel — right menu panel for image properties.
 *
 * Provides controls for image size, text wrapping, alt text, and border
 * styling. Dispatches wo-command events to the canvas/RichText editor.
 */

import type { JSX } from "react"

interface ImagePanelProps {
  visible: boolean
}

const WRAP_STYLES = [
  { id: "inline", label: "Inline", icon: "⊞" },
  { id: "square", label: "Square", icon: "◈" },
  { id: "tight", label: "Tight", icon: "◇" },
  { id: "through", label: "Through", icon: "◇" },
  { id: "top-bottom", label: "Top & Bottom", icon: "⇕" },
  { id: "behind", label: "Behind Text", icon: "▤" },
  { id: "in-front", label: "In Front", icon: "▣" },
]

export function ImagePanel({ visible }: ImagePanelProps): JSX.Element | null {
  if (!visible) return null

  function handleWrapChange(wrapStyle: string) {
    window.dispatchEvent(
      new CustomEvent("wo-command", {
        detail: { command: "imageWrap", value: wrapStyle },
      }),
    )
  }

  function handleWidthChange(e: React.ChangeEvent<HTMLInputElement>) {
    window.dispatchEvent(
      new CustomEvent("wo-command", {
        detail: { command: "imageWidth", value: e.target.value },
      }),
    )
  }

  function handleHeightChange(e: React.ChangeEvent<HTMLInputElement>) {
    window.dispatchEvent(
      new CustomEvent("wo-command", {
        detail: { command: "imageHeight", value: e.target.value },
      }),
    )
  }

  function handleBorderChange(e: React.ChangeEvent<HTMLSelectElement>) {
    window.dispatchEvent(
      new CustomEvent("wo-command", {
        detail: { command: "imageBorder", value: e.target.value },
      }),
    )
  }

  function handleAltTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    window.dispatchEvent(
      new CustomEvent("wo-command", {
        detail: { command: "imageAltText", value: e.target.value },
      }),
    )
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
        Image Settings
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {/* Size */}
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
            Size
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 2 }}>
                Width
                <input
                  type="number"
                  defaultValue={200}
                  min={1}
                  max={1000}
                  onChange={handleWidthChange}
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 3,
                    fontSize: 12,
                    boxSizing: "border-box",
                    marginTop: 2,
                  }}
                />
              </label>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 2 }}>
                Height
                <input
                  type="number"
                  defaultValue={200}
                  min={1}
                  max={1000}
                  onChange={handleHeightChange}
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 3,
                    fontSize: 12,
                    boxSizing: "border-box",
                    marginTop: 2,
                  }}
                />
              </label>
            </div>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
              fontSize: 12,
              color: "#555",
            }}
          >
            <input type="checkbox" defaultChecked />
            Lock aspect ratio
          </label>
        </div>

        {/* Text Wrapping */}
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
            Text Wrapping
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 4,
            }}
          >
            {WRAP_STYLES.map((wrap) => (
              <button
                key={wrap.id}
                type="button"
                onClick={() => handleWrapChange(wrap.id)}
                title={wrap.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: "6px 4px",
                  border: "1px solid #ddd",
                  borderRadius: 3,
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#333",
                }}
              >
                <span style={{ fontSize: 16 }}>{wrap.icon}</span>
                <span>{wrap.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Border */}
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
            Border
          </div>
          <select
            defaultValue="none"
            onChange={handleBorderChange}
            style={{
              width: "100%",
              padding: "4px 8px",
              border: "1px solid #ccc",
              borderRadius: 3,
              fontSize: 12,
            }}
          >
            <option value="none">No Border</option>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
          </select>
        </div>

        {/* Alt Text */}
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
            Alt Text
          </div>
          <input
            type="text"
            placeholder="Descriptive text for accessibility"
            onChange={handleAltTextChange}
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
      </div>
    </div>
  )
}
