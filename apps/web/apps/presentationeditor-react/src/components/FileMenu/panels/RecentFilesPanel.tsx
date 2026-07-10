import type { JSX } from "react"

export function RecentFilesPanel({ visible }: { visible: boolean }): JSX.Element {
  const recentDocs = [
    { id: 1, title: "Untitled Document", date: "2026-04-10" },
    { id: 2, title: "Presentation.pptx", date: "2026-04-09" },
    { id: 3, title: "Meeting Notes.pptx", date: "2026-04-08" },
  ]

  return (
    <div
      className="prese-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="prese-file-menu-header">Recent Files</div>
      <div className="prese-file-menu-body">
        <p className="prese-file-menu-instruction">
          Choose a recent document from the list to open.
        </p>
      </div>
      <div className="prese-file-menu-footer">
        <button type="button" onClick={() => {}}>
          Cancel
        </button>
      </div>
      <div className="prese-file-menu-list">
        {recentDocs.map((doc) => (
          <button key={doc.id} className="prese-file-menu-item" type="button" onClick={() => {}}>
            <span className="prese-file-menu-item-title">{doc.title}</span>
            <span className="prese-file-menu-item-date">{doc.date}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
