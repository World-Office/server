interface StatusBarProps {
  zoom?: number
  page?: number
  pageCount?: number
  /** Whether WOPI/cloud mode is active */
  isWopi?: boolean
  /** Current collaboration connection status */
  connectionStatus?: "connected" | "connecting" | "reconnecting" | "disconnected"
  /** Whether currently saving */
  isSaving?: boolean
  /** Whether there are unsaved changes */
  isModified?: boolean
  /** Number of connected users */
  userCount?: number
  /** Last sync timestamp */
  lastSyncTime?: string | null
}

const CONNECTION_COLORS: Record<string, string> = {
  connected: "#2ECC71",
  connecting: "#F39C12",
  reconnecting: "#E67E22",
  disconnected: "#E74C3C",
}

const CONNECTION_LABELS: Record<string, string> = {
  connected: "Online",
  connecting: "Connecting...",
  reconnecting: "Reconnecting...",
  disconnected: "Offline",
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

export function StatusBar({
  zoom = 100,
  page,
  pageCount,
  isWopi,
  connectionStatus,
  isSaving,
  isModified,
  userCount,
  lastSyncTime,
}: StatusBarProps) {
  const cloudDotColor = connectionStatus ? CONNECTION_COLORS[connectionStatus] : "#95a5a6"
  const cloudLabel = connectionStatus ? CONNECTION_LABELS[connectionStatus] : ""

  return (
    <output className="statusbar-container" aria-live="polite" aria-atomic="true">
      <div className="statusbar-left">
        {page !== undefined && pageCount !== undefined && (
          <span aria-label={`Page ${page} of ${pageCount}`}>
            Page {page} of {pageCount}
          </span>
        )}
      </div>
      <div className="statusbar-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {isWopi && connectionStatus && (
          <span
            className="wc-cloud-status"
            aria-label={`Cloud: ${cloudLabel}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              lineHeight: 1,
              color: "var(--text-secondary, #666)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: cloudDotColor,
                flexShrink: 0,
                transition: "background-color 0.3s ease",
              }}
              title={cloudLabel}
            />
            <span style={{ whiteSpace: "nowrap" }}>{cloudLabel}</span>

            {isSaving && <span style={{ color: "#F39C12", whiteSpace: "nowrap" }}>Saving…</span>}
            {!isSaving && isModified && (
              <span style={{ color: "#E67E22", whiteSpace: "nowrap" }}>Unsaved</span>
            )}
            {!isSaving && !isModified && lastSyncTime && (
              <span style={{ color: "#95a5a6", whiteSpace: "nowrap" }}>
                Saved {formatTime(lastSyncTime)}
              </span>
            )}

            {userCount !== undefined && userCount > 0 && (
              <span
                style={{
                  backgroundColor: "#3498DB",
                  color: "#fff",
                  borderRadius: "50%",
                  width: 16,
                  height: 16,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 600,
                }}
                title={`${userCount} collaborator${userCount !== 1 ? "s" : ""}`}
              >
                {userCount}
              </span>
            )}
          </span>
        )}

        <span aria-label={`Zoom ${zoom} percent`}>{zoom}%</span>
      </div>
    </output>
  )
}
