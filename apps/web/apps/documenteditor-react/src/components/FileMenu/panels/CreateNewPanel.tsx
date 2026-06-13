import { documentStore } from "../../../stores/DocumentStore"

export function CreateNewPanel({ visible }: { visible: boolean }) {
  function handleCreateNew(): void {
    documentStore.setFilePath(null)
    documentStore.setDirty(false)
    documentStore.setActiveFileMenuPanel(null)
    documentStore.setFileMenuOpen(false)
    documentStore.setCurrentPage(0)
    documentStore.setTotalPages(1)
    documentStore.setZoomLevel(100)
  }

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="de-file-menu-header">Create New</div>
      <div className="de-file-menu-formats">
        {["Blank", "Office Open", "Template", "Content", "Education", "Business", "Calendar"].map(
          (format) => (
            <button
              key={format}
              type="button"
              className="de-file-menu-format-btn"
              onClick={handleCreateNew}
            >
              {format}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
