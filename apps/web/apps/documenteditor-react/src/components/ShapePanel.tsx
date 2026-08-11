/**
 * ShapePanel — right menu panel for shape properties.
 * Controls for fill, outline, rotation, and shadow.
 */
import type { JSX } from "react"

interface ShapePanelProps {
  visible: boolean
}

export function ShapePanel({ visible }: ShapePanelProps): JSX.Element | null {
  if (!visible) return null

  function cmd(command: string, value?: string) {
    window.dispatchEvent(new CustomEvent("wo-command", { detail: { command, value } }))
  }

  return (
    <div className="de-properties-panel" style={panelStyle}>
      <div style={headerStyle}>Shape Settings</div>
      <div style={bodyStyle}>
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Fill</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="color"
              defaultValue="#4472C4"
              onChange={(e) => cmd("shapeFill", e.target.value)}
              style={{
                width: 32,
                height: 28,
                padding: 0,
                border: "1px solid #ccc",
                borderRadius: 3,
                cursor: "pointer",
              }}
            />
            <button type="button" onClick={() => cmd("shapeFill", "transparent")} style={smBtn}>
              None
            </button>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Outline</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input
              type="color"
              defaultValue="#000000"
              onChange={(e) => cmd("shapeOutlineColor", e.target.value)}
              style={{
                width: 32,
                height: 28,
                padding: 0,
                border: "1px solid #ccc",
                borderRadius: 3,
                cursor: "pointer",
              }}
            />
            <select onChange={(e) => cmd("shapeOutlineWidth", e.target.value)} style={selectStyle}>
              <option value="0">None</option>
              <option value="1">0.5 pt</option>
              <option value="2" selected>
                1 pt
              </option>
              <option value="4">2 pt</option>
              <option value="8">4 pt</option>
            </select>
          </div>
          <select onChange={(e) => cmd("shapeOutlineStyle", e.target.value)} style={selectStyle}>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Rotation</div>
          <input
            type="number"
            defaultValue={0}
            min={-180}
            max={180}
            onChange={(e) => cmd("shapeRotation", e.target.value)}
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
        <div style={{ marginBottom: 16 }}>
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
              onChange={(e) => cmd("shapeShadow", e.target.checked ? "true" : "false")}
            />
            Shadow
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
const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 8px",
  border: "1px solid #ccc",
  borderRadius: 3,
  fontSize: 12,
  marginBottom: 6,
  boxSizing: "border-box",
}
const smBtn: React.CSSProperties = {
  padding: "4px 12px",
  border: "1px solid #ccc",
  borderRadius: 3,
  background: "#fff",
  cursor: "pointer",
  fontSize: 11,
}
