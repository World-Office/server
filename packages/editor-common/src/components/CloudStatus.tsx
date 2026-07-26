import { useEffect } from "react"

const KEYFRAMES_ID = "wc-cloud-status-pulse"

function ensureKeyframes() {
  if (document.getElementById(KEYFRAMES_ID)) return
  const style = document.createElement("style")
  style.id = KEYFRAMES_ID
  style.textContent = `
    @keyframes wc-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `
  document.head.appendChild(style)
}

export interface CloudStatusProps {
  /** Whether WOPI/cloud mode is active */
  isWopi: boolean
  /**
   * Current collaboration connection state.
   * Accepts "connected" | "connecting" | "reconnecting" | "disconnected" | undefined
   */
  connectionStatus?: string
  /** Whether the document is currently being saved */
  isSaving?: boolean
  /** Whether the document has unsaved changes */
  isModified?: boolean
  /** Number of connected collaborators */
  userCount?: number
  /** ISO timestamp of last successful save */
  lastSyncTime?: string | null
  /** Optional CSS class */
  className?: string
}

const STATUS_MAP: Record<string, { label: string; color: string; dotClass: string }> = {
  connected: { label: "Connected", color: "#2ECC71", dotClass: "wc-status-ok" },
  connecting: { label: "Connecting...", color: "#F39C12", dotClass: "wc-status-warn" },
  reconnecting: { label: "Reconnecting...", color: "#E67E22", dotClass: "wc-status-warn" },
  disconnected: { label: "Offline", color: "#E74C3C", dotClass: "wc-status-error" },
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

/**
 * Cloud connection and sync status indicator.
 * Shows a colored dot, connection state, save indicator, and user count.
 */
export function CloudStatus({
  isWopi,
  connectionStatus,
  isSaving,
  isModified,
  userCount,
  lastSyncTime,
  className,
}: CloudStatusProps) {
  useEffect(() => {
    ensureKeyframes()
  }, [])

  if (!isWopi) return null

  const status = connectionStatus ? STATUS_MAP[connectionStatus] : null
  const dotColor = status?.color ?? "#95a5a6"
  const dotClass = status?.dotClass ?? "wc-status-idle"
  const label = status?.label ?? "Unknown"

  return (
    <span
      className={`wc-cloud-status ${className ?? ""}`}
      aria-label={`Cloud: ${label}${isSaving ? ", saving" : ""}${isModified ? ", unsaved" : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        lineHeight: 1,
        color: "var(--text-secondary, #666)",
      }}
    >
      {/* Connection status dot */}
      <span
        className={dotClass}
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: dotColor,
          flexShrink: 0,
          transition: "background-color 0.3s ease",
        }}
        title={label}
      />

      {/* Connection label */}
      <span style={{ whiteSpace: "nowrap" }}>{label}</span>

      {/* Save indicator */}
      {isSaving && (
        <span
          style={{
            color: "#F39C12",
            animation: "wc-pulse 1.5s ease-in-out infinite",
            whiteSpace: "nowrap",
          }}
        >
          Saving…
        </span>
      )}
      {!isSaving && isModified && (
        <span style={{ color: "#E67E22", whiteSpace: "nowrap" }}>Unsaved</span>
      )}
      {!isSaving && !isModified && lastSyncTime && (
        <span style={{ color: "#95a5a6", whiteSpace: "nowrap" }}>
          Saved {formatTime(lastSyncTime)}
        </span>
      )}

      {/* Collaborator count */}
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
  )
}
