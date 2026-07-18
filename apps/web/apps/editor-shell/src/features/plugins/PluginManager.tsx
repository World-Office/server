import { useCallback } from "react"

interface PluginManagerProps {
  visible: boolean
  onClose: () => void
}

export default function PluginManager({ visible, onClose }: PluginManagerProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    },
    [onClose],
  )

  if (!visible) return null

  return (
    <dialog
      open
      className="editor-overlay-panel"
      aria-label="Plugin Manager"
      onKeyDown={handleKeyDown}
    >
      <div className="editor-overlay-header">
        <h2>Plugin Manager</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="editor-overlay-body">
        <p>Plugin management will be available in a future release.</p>
      </div>
    </dialog>
  )
}
