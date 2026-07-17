import { colors, radii, shadows, spacing, typography } from "@world-office/design-system"
import { useEffect } from "react"
import { createPortal } from "react-dom"

interface PluginMarketplaceProps {
  visible: boolean
  onClose: () => void
}

export function PluginMarketplace({ visible, onClose }: PluginMarketplaceProps) {
  useEffect(() => {
    if (!visible) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [visible, onClose])

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
    width: 480,
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
    padding: spacing[6],
    textAlign: "center" as const,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: spacing[3],
  }

  const footerStyle = {
    display: "flex",
    justifyContent: "center",
    padding: `${spacing[1.5]} ${spacing[2]}`,
    borderTop: `1px solid ${colors.semantic.border}`,
    flexShrink: 0,
  }

  const btnStyle = {
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

  const iconStyle = {
    fontSize: 48,
    marginBottom: spacing[1],
    color: colors.neutral[400],
  }

  return createPortal(
    <>
      <div style={maskStyle} onClick={onClose} role="presentation" />
      <div style={dialogStyle} role="dialog" aria-label="Plugin Marketplace">
        <div style={headerStyle}>
          <span style={titleStyle}>Plugin Marketplace</span>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div style={bodyStyle}>
          <div style={iconStyle}>&#128230;</div>
          <div
            style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              color: colors.semantic.foreground,
            }}
          >
            Coming Soon
          </div>
          <div
            style={{
              fontSize: typography.fontSize.sm,
              color: colors.neutral[500],
              lineHeight: typography.lineHeight.relaxed,
              maxWidth: 320,
            }}
          >
            The World Office Plugin Marketplace will be a central directory for discovering
            and installing community-contributed plugins. Browse extensions for document
            automation, AI writing assistants, custom templates, specialized format tools,
            and more.
          </div>
          <div
            style={{
              fontSize: typography.fontSize.xs,
              color: colors.neutral[400],
              fontStyle: "italic",
            }}
          >
            Marketplace launch is planned for a future release.
          </div>
        </div>

        <div style={footerStyle}>
          <button type="button" style={btnStyle} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
