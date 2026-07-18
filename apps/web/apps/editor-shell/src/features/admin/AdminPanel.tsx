import { useCallback } from "react"

interface AdminPanelProps {
  onClose: () => void
}

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    },
    [onClose],
  )

  return (
    <dialog
      open
      className="editor-overlay-panel"
      aria-label="Admin Panel"
      onKeyDown={handleKeyDown}
    >
      <div className="editor-overlay-header">
        <h2>Admin Panel</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="editor-overlay-body">
        <p>Admin features will be available in a future release.</p>
      </div>
    </dialog>
  )
}
