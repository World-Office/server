import { useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"

const SHORTCUTS = [
  { keys: "Ctrl+Z", action: "Undo", i18n: "Undo" },
  { keys: "Ctrl+Y", action: "Redo", i18n: "Redo" },
  { keys: "Ctrl+B", action: "Bold", i18n: "Bold" },
  { keys: "Ctrl+I", action: "Italic", i18n: "Italic" },
  { keys: "Ctrl+U", action: "Underline", i18n: "Underline" },
  { keys: "Ctrl+S", action: "Save", i18n: "Save" },
  { keys: "Ctrl+F", action: "Find and Replace", i18n: "Find and Replace" },
  { keys: "Ctrl+H", action: "Find and Replace", i18n: "Find and Replace" },
  { keys: "Ctrl+P", action: "Print", i18n: "Print" },
  { keys: "Ctrl+A", action: "Select All", i18n: "Select All" },
  { keys: "Ctrl+Shift+C", action: "Paste Plain Text", i18n: "Paste Plain Text" },
]

interface ShortcutsOverlayProps {
  visible: boolean
  onClose: () => void
}

export function ShortcutsOverlay({ visible, onClose }: ShortcutsOverlayProps) {
  const { t } = useTranslation()

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
    <>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss, Escape handled on window */}
      <div
        className="de-shortcuts-overlay"
        role="dialog"
        aria-label={t("Keyboard Shortcuts")}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="de-shortcuts-panel">
          <div className="de-shortcuts-header">
            <strong>{t("Keyboard Shortcuts")}</strong>
            <button type="button" onClick={onClose}>
              ✕
            </button>
          </div>
          <table className="de-shortcuts-table">
            <thead>
              <tr>
                <th>{t("Shortcut")}</th>
                <th>{t("Action")}</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((s) => (
                <tr key={s.keys}>
                  <td>
                    <kbd>{t(s.keys)}</kbd>
                  </td>
                  <td>{t(s.i18n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
