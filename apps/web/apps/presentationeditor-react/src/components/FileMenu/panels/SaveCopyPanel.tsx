import type { JSX } from "react"

export function SaveCopyPanel({ visible }: { visible: boolean }): JSX.Element {
  return (
    <div
      className="prese-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="prese-file-menu-header">Save Copy as</div>
      <div className="prese-file-menu-body">
        <p className="prese-file-menu-instruction">Select a location to save a document copy.</p>
      </div>
    </div>
  )
}
