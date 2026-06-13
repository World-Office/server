import type { ConnectionState } from "@world-office/collaboration-client"
import { useConnectionStatus } from "../hooks/useConnectionStatus"

export interface CollaborationStatusProps {
  state: ConnectionState
  userCount: number
  className?: string
}

export function CollaborationStatus({ state, userCount, className }: CollaborationStatusProps) {
  const status = useConnectionStatus(state)

  return (
    <output
      className={`wo-collaboration-status ${className ?? ""}`}
      aria-label={`Collaboration: ${status.label}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, lineHeight: 1 }}
    >
      <span
        data-testid="collab-status-dot"
        data-color={status.color}
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: status.color,
          flexShrink: 0,
        }}
      />
      <span>{status.label}</span>
      {status.isConnected && userCount > 0 && (
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
        >
          {userCount}
        </span>
      )}
    </output>
  )
}
