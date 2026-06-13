import type { ConnectionState } from "@world-office/collaboration-client"
import { useMemo } from "react"

export interface ConnectionStatusInfo {
  state: ConnectionState
  isConnected: boolean
  isConnecting: boolean
  isReconnecting: boolean
  label: string
  color: string
}

/**
 * Derives human-readable connection status from raw ConnectionState.
 * Pure computation — no side effects.
 */
export function useConnectionStatus(state: ConnectionState): ConnectionStatusInfo {
  return useMemo(() => {
    switch (state) {
      case "connected":
        return {
          state,
          isConnected: true,
          isConnecting: false,
          isReconnecting: false,
          label: "Connected",
          color: "#2ECC71",
        }
      case "connecting":
        return {
          state,
          isConnected: false,
          isConnecting: true,
          isReconnecting: false,
          label: "Connecting...",
          color: "#F39C12",
        }
      case "reconnecting":
        return {
          state,
          isConnected: false,
          isConnecting: false,
          isReconnecting: true,
          label: "Reconnecting...",
          color: "#E67E22",
        }
      case "disconnected":
        return {
          state,
          isConnected: false,
          isConnecting: false,
          isReconnecting: false,
          label: "Disconnected",
          color: "#E74C3C",
        }
    }
  }, [state])
}
