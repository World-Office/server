import type { JSX } from "react"
import { presentationStore } from "../../../stores/PresentationStore"

export function DocumentInfoPanel({ visible }: { visible: boolean }): JSX.Element {
  const doc = presentationStore.document

  return (
    <div
      className="prese-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="prese-file-menu-header">Document Info</div>
      <table className="prese-file-menu-info-table">
        <tbody>
          <tr className="prese-file-menu-info-row">
            <td className="prese-file-menu-info-left">
              <span className="prese-file-menu-label">Title:</span>
            </td>
            <td className="prese-file-menu-info-right">
              <span className="prese-file-menu-value">{doc?.title ?? "Untitled"}</span>
            </td>
          </tr>
          <tr className="prese-file-menu-info-row">
            <td className="prese-file-menu-info-left">
              <span className="prese-file-menu-label">Author:</span>
            </td>
            <td className="prese-file-menu-info-right">
              <span className="prese-file-menu-value">{doc?.info?.author ?? "—"}</span>
            </td>
          </tr>
          <tr className="prese-file-menu-info-row">
            <td className="prese-file-menu-info-left">
              <span className="prese-file-menu-label">Created:</span>
            </td>
            <td className="prese-file-menu-info-right">
              <span className="prese-file-menu-value">{doc?.info?.created ?? "—"}</span>
            </td>
          </tr>
          <tr className="prese-file-menu-info-row">
            <td className="prese-file-menu-info-left">
              <span className="prese-file-menu-label">Modified:</span>
            </td>
            <td className="prese-file-menu-info-right">
              <span className="prese-file-menu-value">{doc?.info?.modified ?? "—"}</span>
            </td>
          </tr>
          <tr className="prese-file-menu-info-row">
            <td className="prese-file-menu-info-left">
              <span className="prese-file-menu-label">Type:</span>
            </td>
            <td className="prese-file-menu-info-right">
              <span className="prese-file-menu-value">{doc?.fileType ?? "—"}</span>
            </td>
          </tr>
          <tr className="prese-file-menu-info-row">
            <td className="prese-file-menu-info-left">
              <span className="prese-file-menu-label">Size:</span>
            </td>
            <td className="prese-file-menu-info-right">
              <span className="prese-file-menu-value">{doc?.info?.pageCount ?? "—"}</span>
            </td>
          </tr>
          <tr className="prese-file-menu-info-row">
            <td className="prese-file-menu-info-left">
              <span className="prese-file-menu-label">Slides:</span>
            </td>
            <td className="prese-file-menu-info-right">
              <span className="prese-file-menu-value">{doc?.info?.pageCount ?? "—"}</span>
            </td>
          </tr>
          <tr className="prese-file-menu-info-row">
            <td className="prese-file-menu-info-left">
              <span className="prese-file-menu-label">Format:</span>
            </td>
            <td className="prese-file-menu-info-right">
              <span className="prese-file-menu-value">{doc?.fileType ?? "—"}</span>
            </td>
          </tr>
          <tr className="prese-file-menu-info-row">
            <td className="prese-file-menu-info-left">
              <span className="prese-file-menu-label">Language:</span>
            </td>
            <td className="prese-file-menu-info-right">
              <span className="prese-file-menu-value">
                {presentationStore.languageCode ?? "en-US"}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="prese-file-menu-footer">
        <button type="button" onClick={() => {}}>
          Close
        </button>
      </div>
    </div>
  )
}
