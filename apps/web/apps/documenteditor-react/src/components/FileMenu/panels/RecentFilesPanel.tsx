import { useEffect, useState } from "react"
import { isDesktop } from "../../../bridge/platform"
import { documentStore } from "../../../stores/DocumentStore"

interface RecentFileEntry {
  path: string
  name: string
}

export function RecentFilesPanel({ visible }: { visible: boolean }) {
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([])

  useEffect(() => {
    if (!visible || !isDesktop()) return
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<string[]>("get_recent_files").then((files) => {
        setRecentFiles(files.map((path) => ({ path, name: path.split(/[/\\]/).pop() ?? path })))
      })
    })
  }, [visible])

  async function handleOpenFile(path: string): Promise<void> {
    if (!isDesktop()) return
    const { invoke } = await import("@tauri-apps/api/core")
    const binaryExtensions = new Set([
      "docx",
      "odt",
      "doc",
      "pdf",
      "xlsx",
      "pptx",
      "epub",
      "fb2",
      "rtf",
    ])
    const ext = path.split(".").pop()?.toLowerCase() ?? ""
    const isBinary = binaryExtensions.has(ext)
    if (isBinary) {
      await invoke<string>("read_file_binary", { path })
    } else {
      await invoke<string>("read_file", { path })
    }
    documentStore.setFilePath(path)
    documentStore.setDirty(false)
    documentStore.setActiveFileMenuPanel(null)
    documentStore.setFileMenuOpen(false)
  }

  function handleCancel(): void {
    documentStore.setActiveFileMenuPanel(null)
  }

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="de-file-menu-header">Recent Files</div>
      <div className="de-file-menu-body">
        <p className="de-file-menu-instruction">Choose a recent document from the list to open.</p>
      </div>
      {recentFiles.length > 0 && (
        <div className="de-file-menu-list">
          {recentFiles.map((file) => (
            <button
              key={file.path}
              type="button"
              className="de-file-menu-item"
              onClick={() => handleOpenFile(file.path)}
            >
              <span className="de-file-menu-item-title">{file.name}</span>
              <span className="de-file-menu-item-date">{file.path}</span>
            </button>
          ))}
        </div>
      )}
      {recentFiles.length === 0 && (
        <div className="de-file-menu-body">
          <p className="de-file-menu-instruction">No recent files.</p>
        </div>
      )}
      <div className="de-file-menu-footer">
        <button type="button" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
