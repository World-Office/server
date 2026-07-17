interface PluginManagerProps {
  visible: boolean
  onClose: () => void
}

/** Lazy-loaded plugin manager — loaded only when the user opens the plugin dialog. */
export default function PluginManager({ visible, onClose }: PluginManagerProps) {
  if (!visible) return null

  return (
    <div className="editor-overlay">
      <div className="editor-overlay-backdrop" onClick={onClose} role="presentation" />
      <div className="editor-overlay-panel" role="dialog" aria-label="Plugin Manager">
        <div className="editor-overlay-header">
          <h2>Plugin Manager</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="editor-overlay-body">
          <p>Plugin management will be available in a future release.</p>
        </div>
      </div>
    </div>
  )
}
