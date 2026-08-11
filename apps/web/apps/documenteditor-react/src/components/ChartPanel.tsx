/**
 * ChartPanel — right menu panel for chart properties.
 * Controls for chart type, data range, colors, and labels.
 */
import { type JSX, useState } from "react"

interface ChartPanelProps {
  visible: boolean
}

const CHART_TYPES = [
  { id: "bar", label: "Bar", icon: "▇" },
  { id: "line", label: "Line", icon: "━" },
  { id: "pie", label: "Pie", icon: "●" },
  { id: "area", label: "Area", icon: "▲" },
  { id: "column", label: "Column", icon: "▌" },
  { id: "scatter", label: "Scatter", icon: "✕" },
]

export function ChartPanel({ visible }: ChartPanelProps): JSX.Element | null {
  const [chartType, setChartType] = useState("bar")

  if (!visible) return null

  function cmd(command: string, value?: string) {
    window.dispatchEvent(new CustomEvent("wo-command", { detail: { command, value } }))
  }

  return (
    <div className="de-properties-panel" style={panelStyle}>
      <div style={headerStyle}>Chart Settings</div>
      <div style={bodyStyle}>
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Chart Type</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {CHART_TYPES.map((ct) => (
              <button
                key={ct.id}
                type="button"
                onClick={() => {
                  setChartType(ct.id)
                  cmd("chartType", ct.id)
                }}
                style={{
                  flex: "0 0 auto",
                  padding: "6px 10px",
                  border: chartType === ct.id ? "1px solid #2b579a" : "1px solid #ddd",
                  borderRadius: 4,
                  background: chartType === ct.id ? "#e8f0fe" : "#fff",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#333",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  minWidth: 48,
                }}
              >
                <span style={{ fontSize: 18 }}>{ct.icon}</span>
                <span>{ct.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Style</div>
          <select
            defaultValue="default"
            onChange={(e) => cmd("chartStyle", e.target.value)}
            style={fullSelectStyle}
          >
            <option value="default">Default</option>
            <option value="monochrome">Monochrome</option>
            <option value="vibrant">Vibrant</option>
            <option value="pastel">Pastel</option>
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={checkStyle}>
            <input
              type="checkbox"
              defaultChecked
              onChange={(e) => cmd("chartShowLegend", e.target.checked ? "true" : "false")}
            />
            Show legend
          </label>
          <label style={checkStyle}>
            <input
              type="checkbox"
              defaultChecked
              onChange={(e) => cmd("chartShowDataLabels", e.target.checked ? "true" : "false")}
            />
            Show data labels
          </label>
          <label style={checkStyle}>
            <input
              type="checkbox"
              onChange={(e) => cmd("chartShowGridlines", e.target.checked ? "true" : "false")}
            />
            Show gridlines
          </label>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Chart Title</div>
          <input
            type="text"
            defaultValue="Chart Title"
            onChange={(e) => cmd("chartTitle", e.target.value)}
            style={fullInputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => cmd("editChartData")}
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
            Edit Data
          </button>
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
const fullInputStyle: React.CSSProperties = {
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
