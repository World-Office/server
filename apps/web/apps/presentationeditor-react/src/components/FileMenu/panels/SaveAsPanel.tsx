import type { JSX } from "react"
import { presentationStore } from "../../../stores/PresentationStore"

function downloadJSON(): void {
  const json = presentationStore.toJSON()
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "presentation.json"
  a.click()
  URL.revokeObjectURL(url)
}

export function SaveAsPanel({ visible }: { visible: boolean }): JSX.Element {
  return (
    <div
      className="prese-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="prese-file-menu-header">Download as</div>
      <div className="prese-file-menu-formats">
        {["PPTX", "PPSX", "PDF", "ODP", "POTX", "PPTM", "PDFA", "PDF/A", "OTP", "JPG", "PNG"].map(
          (format) => (
            <button
              key={format}
              type="button"
              className="prese-file-menu-format-btn"
              onClick={() => {}}
            >
              {format}
            </button>
          ),
        )}
      </div>

      <div className="prese-file-menu-header" style={{ marginTop: "16px" }}>
        Save as JSON
      </div>
      <div className="prese-file-menu-formats">
        <button
          type="button"
          className="prese-file-menu-format-btn"
          onClick={downloadJSON}
        >
          JSON
        </button>
      </div>
    </div>
  )
}
