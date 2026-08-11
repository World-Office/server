/** Table settings panel for PDF editor. */
import type { JSX } from "react"
interface Props {
  visible: boolean
}
export function TablePanel({ visible }: Props): JSX.Element | null {
  if (!visible) return null
  function cmd(c: string, v?: string) {
    window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: c, value: v } }))
  }
  return (
    <div className="pdf-properties-panel" style={p.panel}>
      <div style={p.header}>Table</div>
      <div style={p.body}>
        <div style={p.sec}>
          <div style={p.label}>Rows & Columns</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button type="button" onClick={() => cmd("addRowBefore")} style={p.btn}>
              Above
            </button>
            <button type="button" onClick={() => cmd("addRowAfter")} style={p.btn}>
              Below
            </button>
            <button type="button" onClick={() => cmd("deleteRow")} style={p.btn}>
              Del Row
            </button>
            <button type="button" onClick={() => cmd("addColumnBefore")} style={p.btn}>
              Left
            </button>
            <button type="button" onClick={() => cmd("addColumnAfter")} style={p.btn}>
              Right
            </button>
            <button type="button" onClick={() => cmd("deleteColumn")} style={p.btn}>
              Del Col
            </button>
            <button type="button" onClick={() => cmd("mergeCells")} style={p.btn}>
              Merge
            </button>
            <button type="button" onClick={() => cmd("splitCell")} style={p.btn}>
              Split
            </button>
          </div>
        </div>
        <div style={p.sec}>
          <div style={p.label}>Border</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select onChange={(e) => cmd("tableBorderStyle", e.target.value)} style={p.sel}>
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
              <option value="none">None</option>
            </select>
            <input
              type="color"
              defaultValue="#000"
              onChange={(e) => cmd("tableBorderColor", e.target.value)}
              style={p.clr}
            />
          </div>
        </div>
        <div style={p.sec}>
          <div style={p.label}>Shading</div>
          <input
            type="color"
            defaultValue="#fff"
            onChange={(e) => cmd("tableShading", e.target.value)}
            style={p.clr}
          />
        </div>
        <label style={p.chk}>
          <input
            type="checkbox"
            onChange={(e) => cmd("toggleHeaderRow", e.target.checked ? "true" : "false")}
          />
          Header row
        </label>
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
  sel: { flex: 1, padding: "4px 8px", border: "1px solid #ccc", borderRadius: 3, fontSize: 12 },
  clr: {
    width: 32,
    height: 28,
    padding: 0,
    border: "1px solid #ccc",
    borderRadius: 3,
    cursor: "pointer",
  },
  btn: {
    padding: "4px 8px",
    border: "1px solid #ddd",
    borderRadius: 3,
    background: "#fff",
    cursor: "pointer",
    fontSize: 10,
    color: "#333",
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
