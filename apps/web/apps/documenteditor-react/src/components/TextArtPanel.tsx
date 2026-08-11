/**
 * TextArtPanel — right menu panel for WordArt/text effects.
 * Controls for text fill, outline, shadow, reflection, and transform style.
 */
import { type JSX, useState } from "react"

interface TextArtPanelProps {
  visible: boolean
}

const TRANSFORM_STYLES = [
  { id: "none", label: "None" },
  { id: "arch-up", label: "Arch Up" },
  { id: "arch-down", label: "Arch Down" },
  { id: "circle", label: "Circle" },
  { id: "button", label: "Button" },
  { id: "wave1", label: "Wave 1" },
  { id: "wave2", label: "Wave 2" },
  { id: "chevron", label: "Chevron" },
]

export function TextArtPanel({ visible }: TextArtPanelProps): JSX.Element | null {
  const [transform, setTransform] = useState("none")

  if (!visible) return null

  function cmd(command: string, value?: string) {
    window.dispatchEvent(new CustomEvent("wo-command", { detail: { command, value } }))
  }

  return (
    <div className="de-properties-panel" style={panelStyle}>
      <div style={headerStyle}>WordArt / Text Effects</div>
      <div style={bodyStyle}>
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Text Fill</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="color"
              defaultValue="#2b579a"
              onChange={(e) => cmd("textartFill", e.target.value)}
              style={{
                width: 32,
                height: 28,
                padding: 0,
                border: "1px solid #ccc",
                borderRadius: 3,
                cursor: "pointer",
              }}
            />
            <select
              onChange={(e) => cmd("textartFillType", e.target.value)}
              style={fullSelectStyle}
            >
              <option value="solid">Solid</option>
              <option value="gradient">Gradient</option>
              <option value="pattern">Pattern</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Text Outline</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input
              type="color"
              defaultValue="#000000"
              onChange={(e) => cmd("textartOutlineColor", e.target.value)}
              style={{
                width: 32,
                height: 28,
                padding: 0,
                border: "1px solid #ccc",
                borderRadius: 3,
                cursor: "pointer",
              }}
            />
            <select
              onChange={(e) => cmd("textartOutlineWidth", e.target.value)}
              style={fullSelectStyle}
            >
              <option value="0">None</option>
              <option value="0.5">0.5 pt</option>
              <option value="1">1 pt</option>
              <option value="2">2 pt</option>
              <option value="3">3 pt</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Transform</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TRANSFORM_STYLES.map((ts) => (
              <button
                key={ts.id}
                type="button"
                onClick={() => {
                  setTransform(ts.id)
                  cmd("textartTransform", ts.id)
                }}
                style={{
                  flex: "0 0 auto",
                  padding: "4px 8px",
                  border: transform === ts.id ? "1px solid #2b579a" : "1px solid #ddd",
                  borderRadius: 3,
                  background: transform === ts.id ? "#e8f0fe" : "#fff",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#333",
                }}
              >
                {ts.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={checkStyle}>
            <input
              type="checkbox"
              onChange={(e) => cmd("textartShadow", e.target.checked ? "true" : "false")}
            />
            Shadow
          </label>
          <label style={checkStyle}>
            <input
              type="checkbox"
              onChange={(e) => cmd("textartReflection", e.target.checked ? "true" : "false")}
            />
            Reflection
          </label>
          <label style={checkStyle}>
            <input
              type="checkbox"
              onChange={(e) => cmd("textartGlow", e.target.checked ? "true" : "false")}
            />
            Glow
          </label>
        </div>
      </div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
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
  fontFamily: "'Aptos','Calibri','Segoe UI',Roboto,sans-serif",
  fontSize: 13,
  zIndex: 100,
}
const headerStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #e0e0e0",
  fontWeight: 600,
  fontSize: 14,
  background: "#f8f9fa",
}
const bodyStyle: React.CSSProperties = { flex: 1, overflowY: "auto", padding: "12px 16px" }
const sectionLabel: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 12,
  color: "#666",
  textTransform: "uppercase",
  marginBottom: 8,
}
const fullSelectStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 8px",
  border: "1px solid #ccc",
  borderRadius: 3,
  fontSize: 12,
  boxSizing: "border-box",
}
const checkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "#555",
  cursor: "pointer",
  marginBottom: 4,
}
