import { colors, radii, shadows, spacing, typography } from "@world-office/design-system"
import { loadPluginConfig, savePluginConfig } from "@world-office/editor-common"
import {
  ArrowLeft,
  BarChart3,
  FileOutput,
  LayoutTemplate,
  Package,
  Search,
  Sparkles,
  X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

interface CatalogPlugin {
  id: string
  name: string
  version: string
  description: string
  author: string
  icon: string
  homepage: string
  license: string
  downloadUrl: string
}

interface PluginMarketplaceProps {
  visible: boolean
  onClose: () => void
}

const iconMap: Record<string, React.ComponentType<{ size?: number }>> = {
  "bar-chart-3": BarChart3,
  sparkles: Sparkles,
  "layout-template": LayoutTemplate,
  "file-output": FileOutput,
}

function PluginIcon({ icon, size = 24 }: { icon: string; size?: number }) {
  const Comp = iconMap[icon]
  if (Comp) return <Comp size={size} />
  return <Package size={size} />
}

const SPIN_KEYFRAMES = `@keyframes marketplace-spin { to { transform: rotate(360deg); } }`

export function PluginMarketplace({ visible, onClose }: PluginMarketplaceProps) {
  const [catalog, setCatalog] = useState<CatalogPlugin[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedPlugin, setSelectedPlugin] = useState<CatalogPlugin | null>(null)
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())

  const refreshInstalled = useCallback(() => {
    const configs = loadPluginConfig()
    setInstalledIds(new Set(configs.map((c) => c.id)))
  }, [])

  const fetchCatalog = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const baseUrl = import.meta.env.BASE_URL ?? "/"
      const res = await fetch(`${baseUrl}plugins/catalog.json`)
      if (!res.ok) throw new Error(`Failed to load catalog (HTTP ${res.status})`)
      const data: CatalogPlugin[] = (await res.json()) as CatalogPlugin[]
      setCatalog(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    fetchCatalog()
    refreshInstalled()
  }, [visible, fetchCatalog, refreshInstalled])

  useEffect(() => {
    if (!visible) return
    const handler = () => refreshInstalled()
    window.addEventListener("plugin-changed", handler)
    return () => window.removeEventListener("plugin-changed", handler)
  }, [visible, refreshInstalled])

  useEffect(() => {
    if (!visible) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (selectedPlugin) {
        setSelectedPlugin(null)
      } else {
        onClose()
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [visible, selectedPlugin, onClose])

  const filteredCatalog = useMemo(() => {
    if (!searchQuery.trim()) return catalog
    const q = searchQuery.toLowerCase().trim()
    return catalog.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    )
  }, [catalog, searchQuery])

  const handleInstall = useCallback(
    (plugin: CatalogPlugin) => {
      const configs = loadPluginConfig()
      if (configs.some((c) => c.id === plugin.id)) return
      configs.push({
        id: plugin.id,
        name: plugin.name,
        enabled: true,
        path: plugin.downloadUrl,
      })
      savePluginConfig(configs)
      window.dispatchEvent(new CustomEvent("plugin-changed"))
      refreshInstalled()
    },
    [refreshInstalled],
  )

  const handleUninstall = useCallback(
    (pluginId: string) => {
      const configs = loadPluginConfig().filter((c) => c.id !== pluginId)
      savePluginConfig(configs)
      window.dispatchEvent(new CustomEvent("plugin-changed"))
      refreshInstalled()
    },
    [refreshInstalled],
  )

  if (!visible) return null

  const maskStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    zIndex: 9998,
  }

  const dialogStyle: React.CSSProperties = {
    position: "fixed",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: 640,
    maxHeight: "85vh",
    backgroundColor: colors.semantic.background,
    borderRadius: radii.lg,
    boxShadow: shadows.xl,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    fontFamily: typography.fontFamily.sans,
    overflow: "hidden",
  }

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${spacing[1.5]} ${spacing[2]}`,
    borderBottom: `1px solid ${colors.semantic.border}`,
    flexShrink: 0,
  }

  const titleStyle: React.CSSProperties = {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.semantic.foreground,
  }

  const closeBtnStyle: React.CSSProperties = {
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

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflow: "auto",
    padding: spacing[2],
  }

  const footerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    padding: `${spacing[1.5]} ${spacing[2]}`,
    borderTop: `1px solid ${colors.semantic.border}`,
    flexShrink: 0,
  }

  const btnPrimary: React.CSSProperties = {
    padding: `${spacing[0.5]} ${spacing[3]}`,
    border: "none",
    borderRadius: radii.sm,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    cursor: "pointer",
    fontFamily: typography.fontFamily.sans,
    backgroundColor: colors.accent.DEFAULT,
    color: colors.accent.foreground,
  }

  const btnSecondary: React.CSSProperties = {
    padding: `${spacing[0.5]} ${spacing[3]}`,
    border: "none",
    borderRadius: radii.sm,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    cursor: "pointer",
    fontFamily: typography.fontFamily.sans,
    backgroundColor: colors.neutral[100],
    color: colors.semantic.foreground,
  }

  const renderLoading = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: spacing[12], gap: spacing[2] }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ animation: "marketplace-spin 1s linear infinite", color: colors.neutral[400] }}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: typography.fontSize.sm, color: colors.neutral[500] }}>Loading catalog…</span>
      <style>{SPIN_KEYFRAMES}</style>
    </div>
  )

  const renderError = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: spacing[12], gap: spacing[2], textAlign: "center" }}>
      <div style={{ fontSize: 32, color: colors.error.DEFAULT }}>⚠</div>
      <span style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.semantic.foreground }}>
        Failed to load catalog
      </span>
      <span style={{ fontSize: typography.fontSize.xs, color: colors.neutral[500], maxWidth: 300 }}>
        {error}
      </span>
      <button type="button" style={btnPrimary} onClick={fetchCatalog}>
        Retry
      </button>
      <style>{SPIN_KEYFRAMES}</style>
    </div>
  )

  const renderEmptyCatalog = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: spacing[12], gap: spacing[2] }}>
      <Package size={32} color={colors.neutral[400]} />
      <span style={{ fontSize: typography.fontSize.sm, color: colors.neutral[500] }}>
        No plugins available yet.
      </span>
    </div>
  )

  const renderEmptySearch = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: spacing[12], gap: spacing[2] }}>
      <Search size={24} color={colors.neutral[400]} />
      <span style={{ fontSize: typography.fontSize.sm, color: colors.neutral[500] }}>
        No plugins match &quot;{searchQuery}&quot;
      </span>
    </div>
  )

  const renderCardGrid = () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: spacing[2] }}>
      {filteredCatalog.map((plugin) => {
        const installed = installedIds.has(plugin.id)
        return (
          <button
            key={plugin.id}
            type="button"
            onClick={() => setSelectedPlugin(plugin)}
            style={{
              display: "flex",
              flexDirection: "column",
              padding: spacing[2],
              borderRadius: radii.md,
              border: `1px solid ${colors.semantic.border}`,
              backgroundColor: colors.semantic.background,
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              transition: "box-shadow 0.15s, border-color 0.15s",
              gap: spacing[1],
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = colors.accent.DEFAULT
              e.currentTarget.style.boxShadow = shadows.md
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = colors.semantic.border
              e.currentTarget.style.boxShadow = "none"
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: spacing[1.5] }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: radii.md,
                backgroundColor: colors.neutral[50],
                color: colors.neutral[600],
                flexShrink: 0,
              }}>
                <PluginIcon icon={plugin.icon} size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: spacing[1], flexWrap: "wrap" }}>
                  <span style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.semantic.foreground }}>
                    {plugin.name}
                  </span>
                  <span style={{ fontSize: typography.fontSize.xs, color: colors.neutral[400] }}>
                    v{plugin.version}
                  </span>
                </div>
              </div>
            </div>

            <p style={{
              fontSize: typography.fontSize.xs,
              color: colors.neutral[600],
              lineHeight: typography.lineHeight.normal,
              margin: 0,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: "2.25em",
            }}>
              {plugin.description}
            </p>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: spacing[0.5] }}>
              <span style={{ fontSize: typography.fontSize.xs, color: colors.neutral[400] }}>
                {plugin.author}
              </span>
              {installed ? (
                <span style={{
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.medium,
                  padding: `${spacing[0.5]} ${spacing[1]}`,
                  borderRadius: radii.sm,
                  backgroundColor: "#d4edda",
                  color: "#155724",
                  lineHeight: 1.4,
                }}>
                  ✓ Installed
                </span>
              ) : (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleInstall(plugin)
                  }}
                  style={{
                    fontSize: typography.fontSize.xs,
                    fontWeight: typography.fontWeight.medium,
                    padding: `${spacing[0.5]} ${spacing[1.5]}`,
                    borderRadius: radii.sm,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    backgroundColor: colors.accent.DEFAULT,
                    color: colors.accent.foreground,
                    lineHeight: 1.4,
                  }}
                >
                  Install
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )

  const renderDetail = () => {
    if (!selectedPlugin) return null
    const installed = installedIds.has(selectedPlugin.id)

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: spacing[2.5] }}>
        <button
          type="button"
          onClick={() => setSelectedPlugin(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing[0.5],
            border: "none",
            backgroundColor: "transparent",
            cursor: "pointer",
            fontSize: typography.fontSize.sm,
            color: colors.neutral[500],
            fontFamily: "inherit",
            padding: 0,
            alignSelf: "flex-start",
          }}
        >
          <ArrowLeft size={14} />
          <span>Back to catalog</span>
        </button>

        <div style={{ display: "flex", gap: spacing[3], alignItems: "center" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 64,
            height: 64,
            borderRadius: radii.xl,
            backgroundColor: colors.neutral[50],
            color: colors.neutral[600],
            flexShrink: 0,
          }}>
            <PluginIcon icon={selectedPlugin.icon} size={32} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.semantic.foreground }}>
              {selectedPlugin.name}
            </h2>
            <span style={{ fontSize: typography.fontSize.sm, color: colors.neutral[500] }}>
              v{selectedPlugin.version} by {selectedPlugin.author}
            </span>
          </div>
        </div>

        <p style={{
          margin: 0,
          fontSize: typography.fontSize.sm,
          color: colors.neutral[600],
          lineHeight: typography.lineHeight.relaxed,
        }}>
          {selectedPlugin.description}
        </p>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: spacing[1],
          padding: spacing[2],
          borderRadius: radii.md,
          backgroundColor: colors.neutral[50],
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: typography.fontSize.sm }}>
            <span style={{ color: colors.neutral[500] }}>License</span>
            <span style={{ color: colors.semantic.foreground, fontWeight: typography.fontWeight.medium }}>
              {selectedPlugin.license}
            </span>
          </div>
          {selectedPlugin.homepage && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: typography.fontSize.sm }}>
              <span style={{ color: colors.neutral[500] }}>Homepage</span>
              <span style={{ color: colors.semantic.foreground }}>{selectedPlugin.homepage}</span>
            </div>
          )}
        </div>

        {installed ? (
          <button
            type="button"
            onClick={() => handleUninstall(selectedPlugin.id)}
            style={{
              ...btnSecondary,
              alignSelf: "flex-start",
              color: colors.error.DEFAULT,
            }}
          >
            Uninstall
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleInstall(selectedPlugin)}
            style={{
              ...btnPrimary,
              alignSelf: "flex-start",
            }}
          >
            Install
          </button>
        )}
      </div>
    )
  }

  const renderBody = () => {
    if (loading) return renderLoading()
    if (error) return renderError()
    if (selectedPlugin) return renderDetail()
    if (catalog.length === 0) return renderEmptyCatalog()
    if (filteredCatalog.length === 0) return renderEmptySearch()
    return renderCardGrid()
  }

  return createPortal(
    <>
      <div style={maskStyle} onClick={onClose} role="presentation" />
      <div style={dialogStyle} role="dialog" aria-label="Plugin Marketplace">
        <div style={headerStyle}>
          <span style={titleStyle}>
            {selectedPlugin ? "Plugin Details" : "Plugin Marketplace"}
          </span>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {!selectedPlugin && !loading && !error && (
          <div style={{ padding: `${spacing[1.5]} ${spacing[2]}`, borderBottom: `1px solid ${colors.semantic.border}`, flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: colors.neutral[400],
                  pointerEvents: "none",
                }}
              />
              <input
                type="text"
                placeholder="Search plugins…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search plugins"
                style={{
                  width: "100%",
                  padding: `${spacing[1]} ${spacing[2]}`,
                  paddingLeft: "28px",
                  border: `1px solid ${colors.semantic.border}`,
                  borderRadius: radii.md,
                  fontSize: typography.fontSize.sm,
                  fontFamily: typography.fontFamily.sans,
                  color: colors.semantic.foreground,
                  backgroundColor: colors.semantic.background,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        )}

        <div style={bodyStyle}>
          {renderBody()}
        </div>

        <div style={footerStyle}>
          <button type="button" style={btnPrimary} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
