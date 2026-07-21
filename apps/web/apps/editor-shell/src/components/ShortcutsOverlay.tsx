import { useCallback, useEffect } from "react"

const SHORTCUTS = [
  { keys: "Ctrl+Z", action: "Undo" },
  { keys: "Ctrl+Y", action: "Redo" },
  { keys: "Ctrl+S", action: "Save" },
  { keys: "Ctrl+F", action: "Find" },
  { keys: "Ctrl+H", action: "Find and Replace" },
  { keys: "Ctrl+A", action: "Select All" },
  { keys: "?", action: "Show this help" },
]

interface ShortcutsOverlayProps {
  visible: boolean
  onClose: () => void
}

export function ShortcutsOverlay({ visible, onClose }: ShortcutsOverlayProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault()
        onClose()
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (visible) {
      window.addEventListener("keydown", handleKeyDown)
      return () => window.removeEventListener("keydown", handleKeyDown)
    }
  }, [visible, handleKeyDown])

  if (!visible) return null

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-dialog-title"
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 24,
          minWidth: 320,
          maxWidth: 480,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 id="shortcuts-dialog-title" style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>Keyboard Shortcuts</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <td
                  style={{
                    padding: "6px 12px 6px 0",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    color: "#333",
                  }}
                >
                  {s.keys}
                </td>
                <td style={{ padding: "6px 0", fontSize: 13, color: "#666" }}>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: "16px 0 0", fontSize: 11, color: "#999", textAlign: "center" }}>
          Press Escape or ? to close
        </p>
      </div>
    </div>
  )
}
