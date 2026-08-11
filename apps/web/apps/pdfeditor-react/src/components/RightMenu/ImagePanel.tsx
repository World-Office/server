/** Image settings panel for PDF editor. */
import type { JSX } from "react"
interface Props {
  visible: boolean
}
export function ImagePanel({ visible }: Props): JSX.Element | null {
  if (!visible) return null
  function cmd(c: string, v?: string) {
    window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: c, value: v } }))
  }
  return (
    <div className="pdf-properties-panel" style={p.panel}>
      <div style={p.header}>Image</div>
      <div style={p.body}>
        <div style={p.sec}>
          <div style={p.label}>Size</div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={p.sm}>
                Width
                <input
                  type="number"
                  defaultValue={200}
                  min={1}
                  onChange={(e) => cmd("imageWidth", e.target.value)}
                  style={p.inp}
                />
              </label>
            </div>
            <div style={{ flex: 1 }}>
              <label style={p.sm}>
                Height
                <input
                  type="number"
                  defaultValue={200}
                  min={1}
                  onChange={(e) => cmd("imageHeight", e.target.value)}
                  style={p.inp}
                />
              </label>
            </div>
          </div>
          <label style={p.chk}>
            <input
              type="checkbox"
              defaultChecked
              onChange={(e) => cmd("imageLockAspect", e.target.checked ? "true" : "false")}
            />
            Lock aspect ratio
          </label>
        </div>
        <div style={p.sec}>
          <div style={p.label}>Opacity</div>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={100}
            onChange={(e) => cmd("imageOpacity", e.target.value)}
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 11, color: "#888", textAlign: "right" }}>100%</div>
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
  sm: { display: "block", fontSize: 11, color: "#888", marginBottom: 2 },
  inp: {
    width: "100%",
    padding: "4px 8px",
    border: "1px solid #ccc",
    borderRadius: 3,
    fontSize: 12,
    boxSizing: "border-box",
    marginTop: 2,
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
