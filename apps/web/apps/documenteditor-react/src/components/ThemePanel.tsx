/**
 * ThemePanel — right menu panel for selecting document color/font themes.
 */

import { observer } from "mobx-react-lite"
import { THEMES, getThemeById, themeToCss } from "../lib/themes"
import { documentStore } from "../stores/DocumentStore"

function ThemePanelInner({ visible }: { visible: boolean }) {
  if (!visible) return null

  function handleSelect(themeId: string) {
    documentStore.setTheme(themeId)
    // Apply theme as CSS custom properties on the root editor element
    const theme = getThemeById(themeId)
    const css = themeToCss(theme)
    const editorEl = document.querySelector(".de-viewport-editor-area") as HTMLElement | null
    if (editorEl) {
      // Parse and apply each CSS variable
      const vars = css.split(";").filter(Boolean)
      for (const v of vars) {
        const parts = v.split(":").map((s: string) => s.trim())
        if (parts[0] && parts[1]) {
          editorEl.style.setProperty(parts[0], parts[1].replace(/"/g, ""))
        }
      }
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        right: 48,
        top: 0,
        width: 260,
        height: "100%",
        background: "#fff",
        borderLeft: "1px solid #e0e0e0",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Aptos', 'Calibri', 'Segoe UI', Roboto, sans-serif",
        fontSize: 13,
        zIndex: 100,
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e0e0e0",
          fontWeight: 600,
          fontSize: 14,
          background: "#f8f9fa",
        }}
      >
        Document Theme
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {THEMES.map(
          (theme: {
            id: string
            name: string
            majorFont: string
            minorFont: string
            accent1: string
            accent2: string
            accent3: string
            accent4: string
            accent5: string
            accent6: string
          }) => {
            const active = documentStore.themeId === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleSelect(theme.id)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 16px",
                  border: "none",
                  borderBottom: "1px solid #f0f0f0",
                  background: active ? "#e8f4ff" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "#f5f5f5"
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent"
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontFamily: theme.majorFont,
                    fontSize: 14,
                    marginBottom: 2,
                  }}
                >
                  {theme.name}
                </div>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
                  <span style={{ fontFamily: theme.majorFont }}>{theme.majorFont}</span>
                  {" / "}
                  <span style={{ fontFamily: theme.minorFont }}>{theme.minorFont}</span>
                </div>
                <div style={{ display: "flex", gap: 3 }}>
                  {[
                    theme.accent1,
                    theme.accent2,
                    theme.accent3,
                    theme.accent4,
                    theme.accent5,
                    theme.accent6,
                  ].map((color) => (
                    <span
                      key={color}
                      style={{
                        display: "inline-block",
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: color,
                        border: "1px solid rgba(0,0,0,0.1)",
                      }}
                    />
                  ))}
                </div>
              </button>
            )
          },
        )}
      </div>
    </div>
  )
}

export const ThemePanel = observer(ThemePanelInner)
