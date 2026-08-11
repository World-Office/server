/**
 * PluginsPanel — right menu panel for managing editor plugins/extensions.
 * Lists available plugins with enable/disable toggles and install option.
 */
import { type JSX, useState } from "react"

interface PluginsPanelProps {
  visible: boolean
}

interface PluginInfo {
  id: string
  name: string
  description: string
  enabled: boolean
}

const DEFAULT_PLUGINS: PluginInfo[] = [
  {
    id: "spellcheck",
    name: "Spell Checker",
    description: "Real-time spell checking",
    enabled: true,
  },
  {
    id: "wordcount",
    name: "Word Count",
    description: "Live word and character count in status bar",
    enabled: true,
  },
  {
    id: "autocorrect",
    name: "AutoCorrect",
    description: "Automatic correction of common typos",
    enabled: true,
  },
  {
    id: "thesaurus",
    name: "Thesaurus",
    description: "Synonyms and antonyms lookup",
    enabled: false,
  },
  {
    id: "translator",
    name: "Translator",
    description: "In-document translation service",
    enabled: false,
  },
  {
    id: "grammar",
    name: "Grammar Checker",
    description: "Advanced grammar and style checking",
    enabled: false,
  },
  {
    id: "equation",
    name: "Equation Editor",
    description: "Mathematical equation input and editing",
    enabled: true,
  },
  {
    id: "comments",
    name: "Advanced Comments",
    description: "Enhanced comment threading and review",
    enabled: false,
  },
]

export function PluginsPanel({ visible }: PluginsPanelProps): JSX.Element | null {
  const [plugins, setPlugins] = useState(DEFAULT_PLUGINS)

  if (!visible) return null

  function togglePlugin(id: string) {
    setPlugins((prev) => prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)))
    window.dispatchEvent(
      new CustomEvent("wo-command", { detail: { command: "togglePlugin", value: id } }),
    )
  }

  return (
    <div className="de-properties-panel" style={panelStyle}>
      <div style={headerStyle}>Plugins</div>
      <div style={bodyStyle}>
        <p style={{ fontSize: 12, color: "#888", marginBottom: 12, lineHeight: 1.4 }}>
          Enable or disable editor plugins and extensions.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {plugins.map((plugin) => (
            <div
              key={plugin.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                border: "1px solid #eee",
                borderRadius: 4,
                background: plugin.enabled ? "#fafafa" : "#fff",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "#333", marginBottom: 2 }}>
                  {plugin.name}
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>{plugin.description}</div>
              </div>
              <label
                style={{
                  position: "relative",
                  display: "inline-block",
                  width: 36,
                  height: 20,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={plugin.enabled}
                  onChange={() => togglePlugin(plugin.id)}
                  style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
                />
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: plugin.enabled ? "#2b579a" : "#ccc",
                    borderRadius: 20,
                    transition: "background 0.2s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: plugin.enabled ? 18 : 2,
                      width: 16,
                      height: 16,
                      background: "#fff",
                      borderRadius: "50%",
                      transition: "left 0.2s",
                    }}
                  />
                </span>
              </label>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("wo-command", { detail: { command: "openPluginStore" } }),
            )
          }
          style={{
            width: "100%",
            padding: "8px 16px",
            border: "1px dashed #ccc",
            borderRadius: 4,
            background: "#fafafa",
            cursor: "pointer",
            fontSize: 12,
            color: "#2b579a",
            marginTop: 12,
          }}
        >
          + Browse Plugin Store
        </button>
      </div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
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
  fontFamily: "'Aptos','Calibri','Segoe UI',Roboto,sans-serif",
  fontSize: 13,
  zIndex: 100,
}
const headerStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #e0e0e0",
  fontWeight: 600,
  fontSize: 14,
  background: "#f8f9fa",
}
const bodyStyle: React.CSSProperties = { flex: 1, overflowY: "auto", padding: "12px 16px" }
