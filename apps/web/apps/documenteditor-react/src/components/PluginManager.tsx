import { colors, radii, shadows, spacing, typography } from "@world-office/design-system"
import {
  type PluginConfig,
  type PluginRegistryEntry,
  loadPluginConfig,
  pluginLoader,
  togglePluginEnabled,
} from "@world-office/editor-common"
import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { PluginMarketplace } from "./PluginMarketplace"

interface PluginManagerProps {
  visible: boolean
  onClose: () => void
}

export const PluginManager = observer(function PluginManager({
  visible,
  onClose,
}: PluginManagerProps) {
  const [plugins, setPlugins] = useState<PluginRegistryEntry[]>([])
  const [configs, setConfigs] = useState<PluginConfig[]>([])
  const [showMarketplace, setShowMarketplace] = useState(false)

  const refresh = useCallback(() => {
    setPlugins(pluginLoader.getAllPlugins())
    setConfigs(loadPluginConfig())
  }, [])

  useEffect(() => {
    if (!visible) return
    refresh()

    const handleLoad = () => refresh()
    const handleUnload = () => refresh()
    window.addEventListener("plugin-loaded", handleLoad)
    window.addEventListener("plugin-unloaded", handleUnload)
    return () => {
      window.removeEventListener("plugin-loaded", handleLoad)
      window.removeEventListener("plugin-unloaded", handleUnload)
    }
  }, [visible, refresh])

  const handleToggle = useCallback(
    (pluginId: string) => {
      const newState = togglePluginEnabled(pluginId)
      const entry = pluginLoader.getPlugin(pluginId)
      if (entry && newState) {
        const cfg = configs.find((c) => c.id === pluginId)
        if (cfg) {
          pluginLoader.reloadPlugin(pluginId, cfg)
        }
      } else if (entry && !newState) {
        pluginLoader.unloadPlugin(pluginId)
      }
      refresh()
      window.dispatchEvent(new CustomEvent("plugin-changed"))
    },
    [configs, refresh],
  )

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!visible) return
    document.addEventListener("keydown", handleEsc)
    return () => document.removeEventListener("keydown", handleEsc)
  }, [visible, handleEsc])

  if (!visible) return null

  const maskStyle = {
    position: "fixed" as const,
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    zIndex: 9998,
  }

  const dialogStyle = {
    position: "fixed" as const,
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: 560,
    maxHeight: "80vh",
    backgroundColor: colors.semantic.background,
    borderRadius: radii.lg,
    boxShadow: shadows.xl,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column" as const,
    fontFamily: typography.fontFamily.sans,
    overflow: "hidden",
  }

  const headerStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${spacing[1.5]} ${spacing[2]}`,
    borderBottom: `1px solid ${colors.semantic.border}`,
    flexShrink: 0,
  }

  const titleStyle = {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.semantic.foreground,
  }

  const closeBtnStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    border: "none",
    backgroundColor: "transparent",
    color: colors.neutral[500],
    cursor: "pointer",
    borderRadius: radii.sm,
    fontSize: 18,
    lineHeight: 1,
  }

  const bodyStyle = {
    flex: 1,
    padding: spacing[2],
    overflow: "auto",
  }

  const listStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: spacing[1.5],
  }

  const pluginCardStyle = (status: string) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing[2],
    borderRadius: radii.md,
    border: `1px solid ${colors.semantic.border}`,
    backgroundColor: status === "active" ? colors.semantic.background : colors.neutral[50],
    opacity: status === "disabled" ? 0.6 : 1,
  })

  const pluginInfoStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  }

  const pluginNameStyle = {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.semantic.foreground,
  }

  const pluginMetaStyle = {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[500],
  }

  const pluginDescStyle = {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[600],
    marginTop: 2,
  }

  const statusBadgeStyle = (status: string) => ({
    fontSize: typography.fontSize.xs,
    padding: `${spacing[0.5]} ${spacing[1]}`,
    borderRadius: radii.sm,
    backgroundColor:
      status === "active" ? "#d4edda" : status === "failed" ? "#f8d7da" : colors.neutral[100],
    color: status === "active" ? "#155724" : status === "failed" ? "#721c24" : colors.neutral[600],
  })

  const footerStyle = {
    display: "flex",
    justifyContent: "flex-end",
    gap: spacing[1.5],
    padding: `${spacing[1.5]} ${spacing[2]}`,
    borderTop: `1px solid ${colors.semantic.border}`,
    flexShrink: 0,
  }

  const btnStyle = (variant: "primary" | "secondary") => ({
    padding: `${spacing[0.5]} ${spacing[3]}`,
    border: "none",
    borderRadius: radii.sm,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    cursor: "pointer",
    fontFamily: typography.fontFamily.sans,
    backgroundColor: variant === "primary" ? colors.accent.DEFAULT : colors.neutral[100],
    color: variant === "primary" ? colors.accent.foreground : colors.semantic.foreground,
  })

  const toggleStyle = (enabled: boolean) => ({
    width: 40,
    height: 20,
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    backgroundColor: enabled ? colors.accent.DEFAULT : colors.neutral[300],
    position: "relative" as const,
    transition: "background-color 0.2s",
    flexShrink: 0,
  })

  const toggleKnobStyle = (enabled: boolean) => ({
    width: 16,
    height: 16,
    borderRadius: "50%",
    backgroundColor: "#fff",
    position: "absolute" as const,
    top: 2,
    left: enabled ? 22 : 2,
    transition: "left 0.2s",
    boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
  })

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "Active"
      case "failed":
        return "Failed"
      case "disabled":
        return "Disabled"
      default:
        return status
    }
  }

  if (showMarketplace) {
    return <PluginMarketplace visible onClose={() => setShowMarketplace(false)} />
  }

  const enabledCount = plugins.filter((p) => p.status === "active").length

  return createPortal(
    <>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop overlay */}
      <div style={maskStyle} onClick={onClose} role="presentation" />
      {/* biome-ignore lint/a11y/useSemanticElements: portal dialog, not native <dialog> */}
      <div style={dialogStyle} role="dialog" aria-label="Plugin Manager">
        <div style={headerStyle}>
          <span style={titleStyle}>Plugin Manager</span>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div style={bodyStyle}>
          <div
            style={{
              marginBottom: spacing[2],
              fontSize: typography.fontSize.sm,
              color: colors.neutral[600],
            }}
          >
            {plugins.length} plugin(s) installed, {enabledCount} active
          </div>

          {plugins.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: spacing[6],
                color: colors.neutral[500],
                fontSize: typography.fontSize.sm,
              }}
            >
              No plugins installed.
            </div>
          ) : (
            <div style={listStyle}>
              {plugins.map((entry) => {
                const enabled = entry.status === "active"
                return (
                  <div key={entry.plugin.id} style={pluginCardStyle(entry.status)}>
                    <div style={pluginInfoStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: spacing[1] }}>
                        <span style={pluginNameStyle}>{entry.plugin.name}</span>
                        <span style={statusBadgeStyle(entry.status)}>
                          {getStatusLabel(entry.status)}
                        </span>
                      </div>
                      <span style={pluginMetaStyle}>
                        v{entry.plugin.version}
                        {entry.error && ` — ${entry.error}`}
                      </span>
                      {entry.plugin.description && (
                        <span style={pluginDescStyle}>{entry.plugin.description}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: spacing[1.5] }}>
                      <button
                        type="button"
                        style={toggleStyle(enabled)}
                        onClick={() => handleToggle(entry.plugin.id)}
                        aria-label={enabled ? "Disable plugin" : "Enable plugin"}
                        title={enabled ? "Disable" : "Enable"}
                      >
                        <div style={toggleKnobStyle(enabled)} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <button
            type="button"
            style={btnStyle("secondary")}
            onClick={() => setShowMarketplace(true)}
          >
            Get Plugins…
          </button>
          <button type="button" style={btnStyle("primary")} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
})
