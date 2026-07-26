interface RightPanelProps {
  title?: string
  onClose?: () => void
}

export function RightPanel({ title = "Properties", onClose }: RightPanelProps) {
  return (
    <section className="editor-right-panel" aria-label={title}>
      <div className="panel-container">
        <div className="panel-title">
          {title}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                float: "right",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                color: "inherit",
              }}
              aria-label="Close panel"
            >
              &times;
            </button>
          )}
        </div>
        <div className="panel-content">
          <p style={{ color: "var(--wo-color-text-secondary)", fontSize: 12 }}>
            Right panel content
          </p>
        </div>
      </div>
    </section>
  )
}
