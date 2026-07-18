import { documentStore } from "../../../stores/DocumentStore"

export function RightsPanel({ visible }: { visible: boolean }) {
  function handleClose(): void {
    documentStore.setActiveFileMenuPanel(null)
    documentStore.setFileMenuOpen(false)
  }

  const info = documentStore.wopiFileInfo

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="de-file-menu-header">Access Rights</div>
      <div className="de-file-menu-body">
        <div className="de-file-menu-settings-table">
          <tbody>
            <tr className="de-file-menu-row">
              <td className="de-file-menu-group td">
                <span className="de-file-menu-label">Owner</span>
              </td>
              <td className="de-file-menu-right">
                <span className="de-file-menu-label">{info?.OwnerId ?? "Unknown"}</span>
              </td>
            </tr>
            <tr className="de-file-menu-row">
              <td className="de-file-menu-group td">
                <span className="de-file-menu-label">Can Edit</span>
              </td>
              <td className="de-file-menu-right">
                <span
                  className="de-file-menu-label"
                  style={{ color: info?.UserCanWrite ? "#27ae60" : "#e74c3c" }}
                >
                  {info?.UserCanWrite ? "Yes" : "No"}
                </span>
              </td>
            </tr>
            <tr className="de-file-menu-row">
              <td className="de-file-menu-group td">
                <span className="de-file-menu-label">Version</span>
              </td>
              <td className="de-file-menu-right">
                <span className="de-file-menu-label">{info?.Version ?? "—"}</span>
              </td>
            </tr>
          </tbody>
        </div>
      </div>
      <div className="de-file-menu-footer">
        <button type="button" onClick={handleClose}>
          Close
        </button>
      </div>
    </div>
  )
}
