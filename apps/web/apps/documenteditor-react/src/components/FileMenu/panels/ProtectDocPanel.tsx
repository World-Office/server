import { documentStore } from "../../../stores/DocumentStore"

export function ProtectDocPanel({ visible }: { visible: boolean }) {
  function handleClose(): void {
    documentStore.setActiveFileMenuPanel(null)
    documentStore.setFileMenuOpen(false)
  }

  const canEdit = documentStore.wopiFileInfo?.UserCanWrite ?? true

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="de-file-menu-header">Protect Document</div>
      <div className="de-file-menu-body">
        <div className="de-file-menu-settings-table">
          <tbody>
            <tr className="de-file-menu-row">
              <td className="de-file-menu-group td">
                <span className="de-file-menu-label">Editing</span>
              </td>
              <td className="de-file-menu-right">
                <span className="de-file-menu-label" style={{ color: canEdit ? "#27ae60" : "#e74c3c" }}>
                  {canEdit ? "Full Access" : "Read Only"}
                </span>
              </td>
            </tr>
            <tr className="de-file-menu-row">
              <td className="de-file-menu-group td">
                <span className="de-file-menu-label">Track Changes</span>
              </td>
              <td className="de-file-menu-right">
                <label className="de-file-menu-checkbox">
                  <input
                    type="checkbox"
                    checked={documentStore.trackChanges}
                    onChange={(e) => documentStore.setTrackChanges(e.target.checked)}
                  />
                  <span>Enabled</span>
                </label>
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
