/** Form controls panel for PDF editor. */
import { type JSX, useState } from "react"
interface Props {
  visible: boolean
}
const CTYPES = [
  { id: "text", label: "Text Field", icon: "Aa" },
  { id: "checkbox", label: "Checkbox", icon: "☑" },
  { id: "dropdown", label: "Dropdown", icon: "☰" },
  { id: "date", label: "Date", icon: "📅" },
]
export function FormPanel({ visible }: Props): JSX.Element | null {
  const [sel, setSel] = useState("text")
  if (!visible) return null
  function cmd(c: string, v?: string) {
    window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: c, value: v } }))
  }
  return (
    <div className="pdf-properties-panel" style={p.panel}>
      <div style={p.header}>Form</div>
      <div style={p.body}>
        <div style={p.sec}>
          <div style={p.label}>Control Type</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {CTYPES.map((ct) => (
              <button
                key={ct.id}
                type="button"
                onClick={() => setSel(ct.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  border: sel === ct.id ? "1px solid #2b579a" : "1px solid #ddd",
                  borderRadius: 4,
                  background: sel === ct.id ? "#e8f0fe" : "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "#333",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{ct.icon}</span>
                <span style={{ fontWeight: 600 }}>{ct.label}</span>
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => cmd("insertFormControl", sel)}
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
}
