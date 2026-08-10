/**
 * TablePanel — right menu panel for table properties.
 *
 * Provides controls for table dimensions, cell borders, shading, and
 * alignment. Dispatches wo-command events to the canvas/RichText editor.
 */

import type { JSX } from "react"

interface TablePanelProps {
  visible: boolean
}

const BORDER_STYLES = ["none", "solid", "dashed", "dotted", "double"]
const VERTICAL_ALIGNS = [
  { id: "top", label: "Top", icon: "↥" },
  { id: "middle", label: "Middle", icon: "↕" },
  { id: "bottom", label: "Bottom", icon: "↧" },
]

export function TablePanel({ visible }: TablePanelProps): JSX.Element | null {
  if (!visible) return null

  function handleCommand(command: string, value?: string) {
    window.dispatchEvent(new CustomEvent("wo-command", { detail: { command, value } }))
  }

  function handleBorderChange(e: React.ChangeEvent<HTMLSelectElement>) {
    handleCommand("tableBorderStyle", e.target.value)
  }

  function handleShadingChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleCommand("tableShading", e.target.value)
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
        Table Settings
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {/* Rows & Columns */}
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
            Rows &amp; Columns
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={() => handleCommand("addRowBefore")} style={btnStyle}>
              Insert Above
            </button>
            <button type="button" onClick={() => handleCommand("addRowAfter")} style={btnStyle}>
              Insert Below
            </button>
            <button type="button" onClick={() => handleCommand("deleteRow")} style={btnStyle}>
              Delete Row
            </button>
            <button type="button" onClick={() => handleCommand("addColumnBefore")} style={btnStyle}>
              Insert Left
            </button>
            <button type="button" onClick={() => handleCommand("addColumnAfter")} style={btnStyle}>
              Insert Right
            </button>
            <button type="button" onClick={() => handleCommand("deleteColumn")} style={btnStyle}>
              Delete Column
            </button>
            <button type="button" onClick={() => handleCommand("mergeCells")} style={btnStyle}>
              Merge Cells
            </button>
            <button type="button" onClick={() => handleCommand("splitCell")} style={btnStyle}>
              Split Cell
            </button>
          </div>
        </div>

        {/* Cell Borders */}
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
            Cell Borders
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <button
              type="button"
              title="All Borders"
              onClick={() => handleCommand("setTableBorderAll")}
              style={smBtnStyle}
            >
              ▦
            </button>
            <button
              type="button"
              title="Outside Borders"
              onClick={() => handleCommand("setTableBorderOutside")}
              style={smBtnStyle}
            >
              ▣
            </button>
            <button
              type="button"
              title="No Borders"
              onClick={() => handleCommand("removeBorders")}
              style={smBtnStyle}
            >
              ▢
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              defaultValue="solid"
              onChange={handleBorderChange}
              style={{
                flex: 1,
                padding: "4px 8px",
                border: "1px solid #ccc",
                borderRadius: 3,
                fontSize: 12,
              }}
            >
              {BORDER_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            <input
              type="color"
              defaultValue="#000000"
              onChange={(e) => handleCommand("tableBorderColor", e.target.value)}
              title="Border color"
              style={{
                width: 32,
                height: 28,
                padding: 0,
                border: "1px solid #ccc",
                borderRadius: 3,
                cursor: "pointer",
              }}
            />
          </div>
        </div>

        {/* Cell Shading */}
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
            Cell Shading
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="color"
              defaultValue="#ffffff"
              onChange={handleShadingChange}
              title="Background color"
              style={{
                width: 32,
                height: 28,
                padding: 0,
                border: "1px solid #ccc",
                borderRadius: 3,
                cursor: "pointer",
              }}
            />
            <button
              type="button"
              onClick={() => handleCommand("tableShading", "#ffffff")}
              style={{
                padding: "4px 12px",
                border: "1px solid #ccc",
                borderRadius: 3,
                background: "#fff",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Cell Vertical Alignment */}
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
            Vertical Alignment
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {VERTICAL_ALIGNS.map((align) => (
              <button
                key={align.id}
                type="button"
                onClick={() => handleCommand("tableVerticalAlign", align.id)}
                title={align.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: "6px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 3,
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#333",
                }}
              >
                <span style={{ fontSize: 16 }}>{align.icon}</span>
                <span>{align.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Header Row Toggle */}
        <div className="de-prop-section" style={{ marginBottom: 16 }}>
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
              onChange={(e) =>
                handleCommand(e.target.checked ? "toggleHeaderRow" : "toggleHeaderRow")
              }
            />
            Header row
          </label>
        </div>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  flex: "0 0 auto",
  padding: "6px 10px",
  border: "1px solid #ddd",
  borderRadius: 3,
  background: "#fff",
  cursor: "pointer",
  fontSize: 11,
  color: "#333",
  whiteSpace: "nowrap",
}

const smBtnStyle: React.CSSProperties = {
  width: 32,
  height: 28,
  padding: 0,
  border: "1px solid #ccc",
  borderRadius: 3,
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}
