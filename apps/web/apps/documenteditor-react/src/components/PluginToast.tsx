import type { JSX } from "react"

interface PluginToastProps {
  message: string
}

/** Minimal global toast for plugin notifications (plugin-show-toast). */
export function PluginToast({ message }: PluginToastProps): JSX.Element {
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 72,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2000,
        maxWidth: "60vw",
        padding: "10px 16px",
        borderRadius: 6,
        background: "rgba(32, 39, 48, 0.92)",
        color: "#fff",
        fontSize: 13,
        fontFamily: "Segoe UI, sans-serif",
        boxShadow: "0 4px 16px rgba(0,0,0,.24)",
      }}
    >
      {message}
    </div>
  )
}
