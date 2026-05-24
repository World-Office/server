declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
      }
    }
  }
}

import { useState, useEffect, type ReactNode } from "react"

export function OfflineBadge(): ReactNode {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [backendOnline, setBackendOnline] = useState(true)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    const interval = setInterval(async () => {
      try {
        if (window.__TAURI__?.core) {
          const healthy = await window.__TAURI__.core.invoke("check_backend_health")
          setBackendOnline(healthy as boolean)
        }
      } catch {
        setBackendOnline(false)
      }
    }, 10000)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      clearInterval(interval)
    }
  }, [])

  const showOffline = !isOnline || !backendOnline

  if (!showOffline) return null

  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 9999,
        background: "#f39c12",
        color: "#fff",
        padding: "4px 10px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 6,
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
      }}
    >
      <span style={{ fontSize: 14 }}>&#x26A1;</span>
      Offline
    </div>
  )
}
