/**
 * SignaturePanel — right menu panel for digital signature properties.
 * Controls for signing, signature display options, and certificate info.
 */
import { type JSX, useState } from "react"

interface SignaturePanelProps {
  visible: boolean
}

export function SignaturePanel({ visible }: SignaturePanelProps): JSX.Element | null {
  const [signed, setSigned] = useState(false)

  if (!visible) return null

  function cmd(command: string, value?: string) {
    window.dispatchEvent(new CustomEvent("wo-command", { detail: { command, value } }))
  }

  return (
    <div className="de-properties-panel" style={panelStyle}>
      <div style={headerStyle}>Digital Signature</div>
      <div style={bodyStyle}>
        {!signed ? (
          <>
            <p style={{ fontSize: 12, color: "#555", marginBottom: 16, lineHeight: 1.5 }}>
              Add a digital signature to certify this document. A digital signature ensures
              authenticity and integrity.
            </p>
            <button
              type="button"
              onClick={() => {
                setSigned(true)
                cmd("addSignature")
              }}
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
                marginBottom: 12,
              }}
            >
              Add Signature
            </button>
            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabel}>Sign as</div>
              <input
                type="text"
                defaultValue="User Name"
                onChange={(e) => cmd("signatureName", e.target.value)}
                style={fullInputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabel}>Purpose</div>
              <select
                defaultValue="approval"
                onChange={(e) => cmd("signaturePurpose", e.target.value)}
                style={fullSelectStyle}
              >
                <option value="approval">Approval</option>
                <option value="review">Review</option>
                <option value="execution">Execution</option>
                <option value="witness">Witness</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={checkStyle}>
                <input
                  type="checkbox"
                  onChange={(e) => cmd("signatureVisible", e.target.checked ? "true" : "false")}
                />
                Show signature in document
              </label>
              <label style={checkStyle}>
                <input
                  type="checkbox"
                  onChange={(e) => cmd("signatureTimestamp", e.target.checked ? "true" : "false")}
                />
                Include timestamp
              </label>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
                padding: 12,
                background: "#f0f7f0",
                borderRadius: 4,
                border: "1px solid #b7e1b7",
              }}
            >
              <span style={{ fontSize: 20, color: "#2e7d32" }}>✓</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#2e7d32" }}>Signed</div>
                <div style={{ fontSize: 11, color: "#666" }}>Signed by User Name</div>
                <div style={{ fontSize: 11, color: "#666" }}>Timestamped</div>
              </div>
            </div>
            <button type="button" onClick={() => cmd("viewSignatureCert")} style={ghostBtnStyle}>
              View Certificate
            </button>
            <button
              type="button"
              onClick={() => cmd("removeSignature")}
              style={{ ...ghostBtnStyle, color: "#c62828" }}
            >
              Remove Signature
            </button>
          </>
        )}
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
const fullInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 8px",
  border: "1px solid #ccc",
  borderRadius: 3,
  fontSize: 12,
  boxSizing: "border-box",
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
const ghostBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 16px",
  border: "1px solid #ccc",
  borderRadius: 4,
  background: "#fff",
  cursor: "pointer",
  fontSize: 12,
  marginBottom: 6,
  textAlign: "center",
}
