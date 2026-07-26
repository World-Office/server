import { colors, radii, shadows, spacing, typography } from "@world-office/design-system"
import { useCallback, useState } from "react"
import type { CSSProperties } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

// ── Types ──────────────────────────────────────────────────────────────

export interface ExportFormat {
  /** Machine-readable id (e.g. "pdf", "docx", "html") */
  id: string
  /** Short label to show on the button (e.g. "PDF", "DOCX") */
  label: string
  /** Longer description (e.g. "Portable Document Format") */
  description: string
  /** File extension including dot (e.g. ".pdf") */
  extension: string
  /** MIME type for the output */
  mimeType?: string
}

export interface ExportFormatGroup {
  /** Group heading (e.g. "Document", "E-book") */
  heading: string
  /** Formats in this group */
  formats: ExportFormat[]
}

export interface ExportWizardProps {
  /** Whether the wizard is open */
  visible: boolean
  /** Format groups to display */
  groups: ExportFormatGroup[]
  /** Called when user selects a format to export. Return true on success. */
  onExport: (format: ExportFormat) => Promise<boolean>
  /** Called when user chooses "Send as Email" after export */
  onEmail?: (format: ExportFormat, email: string) => Promise<boolean>
  /** Called when wizard is dismissed */
  onClose: () => void
  /** Title for the dialog */
  title?: string
  /** Maximum file size warning (human-readable, e.g. "25 MB") */
  maxSize?: string
}

// ── Styles ─────────────────────────────────────────────────────────────

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.3)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10000,
}

const dialogStyle: CSSProperties = {
  backgroundColor: colors.neutral[50],
  borderRadius: radii.lg,
  boxShadow: shadows.xl,
  minWidth: 420,
  maxWidth: 560,
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
}

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `${spacing[4]} ${spacing[5]}`,
  borderBottom: `1px solid ${colors.neutral[200]}`,
}

const titleStyle: CSSProperties = {
  fontSize: typography.fontSize.lg,
  fontWeight: typography.fontWeight.semibold,
  fontFamily: typography.fontFamily.sans,
  color: colors.neutral[900],
  margin: 0,
}

const closeBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: typography.fontSize.xl,
  color: colors.neutral[500],
  padding: spacing[1],
  lineHeight: 1,
}

const bodyStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: spacing[5],
}

const groupHeadingStyle: CSSProperties = {
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.semibold,
  fontFamily: typography.fontFamily.sans,
  color: colors.neutral[600],
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginTop: spacing[4],
  marginBottom: spacing[2],
}

const groupHeadingFirstStyle: CSSProperties = {
  ...groupHeadingStyle,
  marginTop: 0,
}

const formatGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: spacing[2],
}

const formatBtnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: spacing[1],
  padding: `${spacing[3]} ${spacing[2]}`,
  border: `1px solid ${colors.neutral[200]}`,
  borderRadius: radii.md,
  backgroundColor: colors.neutral[50],
  cursor: "pointer",
  transition: "border-color 0.15s, background-color 0.15s",
  fontFamily: typography.fontFamily.sans,
  fontSize: typography.fontSize.sm,
}

const formatBtnLabelStyle: CSSProperties = {
  fontWeight: typography.fontWeight.semibold,
  fontSize: typography.fontSize.base,
  color: colors.neutral[800],
}

const formatBtnDescStyle: CSSProperties = {
  fontSize: typography.fontSize.xs,
  color: colors.neutral[500],
  textAlign: "center",
  lineHeight: 1.3,
}

const formatBtnDisabledStyle: CSSProperties = {
  ...formatBtnStyle,
  opacity: 0.45,
  cursor: "not-allowed",
  pointerEvents: "none" as const,
}

const convertingOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor: "rgba(255, 255, 255, 0.8)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing[3],
  zIndex: 1,
  borderRadius: radii.lg,
}

const progressLabelStyle: CSSProperties = {
  fontSize: typography.fontSize.sm,
  fontFamily: typography.fontFamily.sans,
  color: colors.neutral[700],
}

const doneBannerStyle: CSSProperties = {
  padding: `${spacing[3]} ${spacing[4]}`,
  backgroundColor: colors.success.DEFAULT,
  color: colors.neutral[50],
  borderRadius: radii.md,
  fontSize: typography.fontSize.sm,
  fontFamily: typography.fontFamily.sans,
  textAlign: "center",
  marginBottom: spacing[4],
}

const emailSectionStyle: CSSProperties = {
  borderTop: `1px solid ${colors.neutral[200]}`,
  padding: spacing[4],
  display: "flex",
  gap: spacing[2],
  alignItems: "center",
}

const emailInputStyle: CSSProperties = {
  flex: 1,
  padding: `${spacing[2]} ${spacing[3]}`,
  border: `1px solid ${colors.neutral[300]}`,
  borderRadius: radii.md,
  fontSize: typography.fontSize.sm,
  fontFamily: typography.fontFamily.sans,
  outline: "none",
}

const sendBtnStyle: CSSProperties = {
  padding: `${spacing[2]} ${spacing[4]}`,
  backgroundColor: colors.accent.DEFAULT,
  color: colors.neutral[50],
  border: "none",
  borderRadius: radii.md,
  cursor: "pointer",
  fontSize: typography.fontSize.sm,
  fontFamily: typography.fontFamily.sans,
  fontWeight: typography.fontWeight.medium,
  whiteSpace: "nowrap",
}

// ── Spinner ────────────────────────────────────────────────────────────

function Spinner() {
  const spinnerStyle: CSSProperties = {
    width: 28,
    height: 28,
    border: `3px solid ${colors.neutral[200]}`,
    borderTopColor: colors.accent.DEFAULT,
    borderRadius: "50%",
    animation: "ew-spin 0.7s linear infinite",
  }
  return <div style={spinnerStyle} />
}

// ── Component ──────────────────────────────────────────────────────────

export function ExportWizard({
  visible,
  groups,
  onExport,
  onEmail,
  onClose,
  title,
  maxSize,
}: ExportWizardProps) {
  const { t } = useTranslation()
  const [converting, setConverting] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)

  const handleSelect = useCallback(
    async (format: ExportFormat) => {
      setConverting(format.id)
      setError(null)
      setDone(null)
      try {
        const ok = await onExport(format)
        if (ok) {
          setDone(format.id)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("ExportWizard.exportFailed"))
      } finally {
        setConverting(null)
      }
    },
    [onExport, t],
  )

  const handleEmail = useCallback(async () => {
    if (!done || !email.trim() || !onEmail) return
    setSending(true)
    setError(null)
    try {
      const group = groups.flatMap((g) => g.formats).find((f) => f.id === done)
      if (!group) return
      await onEmail(group, email.trim())
      setDone(null)
      setEmail("")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ExportWizard.sendFailed"))
    } finally {
      setSending(false)
    }
  }, [done, email, onEmail, groups, onClose, t])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !converting) onClose()
    },
    [converting, onClose],
  )

  const handleBackdropKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && !converting) onClose()
    },
    [converting, onClose],
  )

  if (!visible) return null

  const portal = createPortal(
    <dialog
      style={backdropStyle}
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropKeyDown}
      aria-modal="true"
      open
    >
      <div style={dialogStyle}>
        {/* ── Header ── */}
        <div style={headerStyle}>
          <h2 style={titleStyle}>{title ?? t("ExportWizard.title", "Download as")}</h2>
          <button
            type="button"
            style={closeBtnStyle}
            onClick={onClose}
            disabled={!!converting}
            aria-label={t("ExportWizard.close", "Close")}
          >
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ ...bodyStyle, position: "relative" }}>
          {/* Converting overlay */}
          {converting && (
            <div style={convertingOverlayStyle}>
              <Spinner />
              <span style={progressLabelStyle}>
                {t("ExportWizard.converting", "Converting to {{format}}…").replace(
                  "{{format}}",
                  converting.toUpperCase(),
                )}
              </span>
              {maxSize && (
                <span
                  style={{ ...progressLabelStyle, fontSize: typography.fontSize.xs, opacity: 0.6 }}
                >
                  {t("ExportWizard.maxSizeWarning", "Max file size: {{size}}").replace(
                    "{{size}}",
                    maxSize,
                  )}
                </span>
              )}
              <style>{"@keyframes ew-spin { to { transform: rotate(360deg) } }"}</style>
            </div>
          )}

          {/* Success banner */}
          {done && !converting && (
            <div style={doneBannerStyle}>
              {t("ExportWizard.downloadStarted", "Download started")}
            </div>
          )}

          {/* Error message */}
          {error && !converting && (
            <div
              style={{
                ...doneBannerStyle,
                backgroundColor: colors.error.DEFAULT,
                marginBottom: spacing[4],
              }}
            >
              {error}
            </div>
          )}

          {/* Format groups */}
          {groups.map((group, gi) => (
            <div key={group.heading}>
              <h3 style={gi === 0 ? groupHeadingFirstStyle : groupHeadingStyle}>{group.heading}</h3>
              <div style={formatGridStyle}>
                {group.formats.map((fmt) => {
                  const isConverting = converting === fmt.id
                  const isDone = done === fmt.id
                  const btnStyle =
                    fmt.id === "disabled"
                      ? formatBtnDisabledStyle
                      : {
                          ...formatBtnStyle,
                          borderColor: isDone ? colors.success.DEFAULT : colors.neutral[200],
                          backgroundColor: isDone ? "#e8f5e9" : colors.neutral[50],
                        }
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      style={btnStyle}
                      disabled={isConverting || fmt.id === "disabled"}
                      onClick={() => handleSelect(fmt)}
                    >
                      <span style={formatBtnLabelStyle}>
                        {isConverting ? "⏳" : isDone ? "✓" : fmt.label}
                      </span>
                      <span style={formatBtnDescStyle}>{fmt.description}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ── Email section ── */}
        {done && onEmail && (
          <div style={emailSectionStyle}>
            <input
              type="email"
              style={emailInputStyle}
              placeholder={t("ExportWizard.emailPlaceholder", "Email address")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
            />
            <button
              type="button"
              style={sendBtnStyle}
              disabled={!email.trim() || sending}
              onClick={handleEmail}
            >
              {sending
                ? t("ExportWizard.sending", "Sending…")
                : t("ExportWizard.send", "Send as Email")}
            </button>
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  )

  return portal
}
