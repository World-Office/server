/** Shape settings panel for PDF editor. */
import type { JSX } from "react"
interface Props {
  visible: boolean
}
export function ShapePanel({ visible }: Props): JSX.Element | null {
  if (!visible) return null
  function cmd(c: string, v?: string) {
    window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: c, value: v } }))
  }
  return (
    <div className="pdf-properties-panel" style={p.panel}>
      <div style={p.header}>Shape</div>
      <div style={p.body}>
        <div style={p.sec}>
          <div style={p.label}>Fill</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="color"
              defaultValue="#4472C4"
              onChange={(e) => cmd("shapeFill", e.target.value)}
              style={p.clr}
            />
            <button type="button" onClick={() => cmd("shapeFill", "transparent")} style={p.smBtn}>
              None
            </button>
          </div>
        </div>
        <div style={p.sec}>
          <div style={p.label}>Outline</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input
              type="color"
              defaultValue="#000"
              onChange={(e) => cmd("shapeOutlineColor", e.target.value)}
              style={p.clr}
            />
            <select
              onChange={(e) => cmd("shapeOutlineWidth", e.target.value)}
              style={{
                flex: 1,
                padding: "4px 8px",
                border: "1px solid #ccc",
                borderRadius: 3,
                fontSize: 12,
              }}
            >
              <option value="0">None</option>
              <option value="1">0.5pt</option>
              <option value="2" selected>
                1pt
              </option>
              <option value="4">2pt</option>
            </select>
          </div>
        </div>
        <div style={p.sec}>
          <label style={p.chk}>
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
const p: Record<string, React.CSSProperties> = {
  panel: {
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
  },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid #e0e0e0",
    fontWeight: 600,
    fontSize: 14,
    background: "#f8f9fa",
  },
  body: { flex: 1, overflowY: "auto", padding: "12px 16px" },
  sec: { marginBottom: 16 },
  label: {
    fontWeight: 600,
    fontSize: 12,
    color: "#666",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  clr: {
    width: 32,
    height: 28,
    padding: 0,
    border: "1px solid #ccc",
    borderRadius: 3,
    cursor: "pointer",
  },
  smBtn: {
    padding: "4px 12px",
    border: "1px solid #ccc",
    borderRadius: 3,
    background: "#fff",
    cursor: "pointer",
    fontSize: 11,
  },
  chk: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#555",
    cursor: "pointer",
    marginBottom: 4,
  },
}
