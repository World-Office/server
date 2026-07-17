interface AdminPanelProps {
  onClose: () => void
}

/** Lazy-loaded admin panel — loaded only when navigating to /admin. */
export default function AdminPanel({ onClose }: AdminPanelProps) {
  return (
    <div className="editor-overlay">
      <div className="editor-overlay-backdrop" onClick={onClose} role="presentation" />
      <div className="editor-overlay-panel" role="dialog" aria-label="Admin Panel">
        <div className="editor-overlay-header">
          <h2>Admin Panel</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="editor-overlay-body">
          <p>Admin features will be available in a future release.</p>
        </div>
      </div>
    </div>
  )
}
