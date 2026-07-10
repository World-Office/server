import { visioStore } from "../../../../stores/VisioStore"

export function DocumentInfoPanel({ visible }: { visible: boolean }) {
  const doc = visioStore.document

  return (
    <div
      className="visio-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 30px" }}
    >
      <div className="visio-file-menu-header">Document Info</div>
      <table className="visio-file-menu-info-table">
        <tbody>
          <tr className="visio-file-menu-info-row">
            <td className="visio-file-menu-info-left">
              <span>Title</span>
            </td>
            <td className="visio-file-menu-info-right">
              <span>{doc?.title ?? "Untitled"}</span>
            </td>
          </tr>
          <tr className="visio-file-menu-info-divider" />
          <tr className="visio-file-menu-info-row">
            <td className="visio-file-menu-info-left">
              <span>Author</span>
            </td>
            <td className="visio-file-menu-info-right">
              <span>{doc?.info?.author ?? "—"}</span>
            </td>
          </tr>
          <tr className="visio-file-menu-info-row">
            <td className="visio-file-menu-info-left">
              <span>Created</span>
            </td>
            <td className="visio-file-menu-info-right">
              <span>{doc?.info?.created ?? "—"}</span>
            </td>
          </tr>
          <tr className="visio-file-menu-info-row">
            <td className="visio-file-menu-info-left">
              <span>Modified</span>
            </td>
            <td className="visio-file-menu-info-right">
              <span>{doc?.info?.modified ?? "—"}</span>
            </td>
          </tr>
          <tr className="visio-file-menu-info-row">
            <td className="visio-file-menu-info-left">
              <span>Format</span>
            </td>
            <td className="visio-file-menu-info-right">
              <span>{doc?.fileType?.toUpperCase() ?? "—"}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
