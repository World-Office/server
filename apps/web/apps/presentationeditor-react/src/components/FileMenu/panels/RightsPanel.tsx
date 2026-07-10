import type { JSX } from "react"

export function RightsPanel({ visible }: { visible: boolean }): JSX.Element {
  return (
    <div
      className="prese-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="prese-file-menu-header">Access Rights</div>
      <div className="prese-file-menu-body">
        <p className="prese-file-menu-instruction">
          Configure document permissions and access rights.
        </p>
      </div>
      <div className="prese-file-menu-footer">
        <button type="button" onClick={() => {}}>
          Close
        </button>
      </div>
    </div>
  )
}
