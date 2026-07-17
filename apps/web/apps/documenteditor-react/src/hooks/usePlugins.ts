import { getPluginAPI, sandboxExecutePlugin } from "@world-office/editor-common"
import { useEffect } from "react"

interface Plugin {
  id: string
  name: string
  enabled: boolean
  source: string
}

export function usePlugins() {
  useEffect(() => {
    // Plugin system requires Tauri desktop runtime — skip in web context
    if (typeof window !== "undefined" && !(window as unknown as Record<string, unknown>).__TAURI__) {
      return
    }

    async function loadPlugins() {
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        const list: Plugin[] = await invoke("get_plugins")
        const api = getPluginAPI()
        for (const p of list) {
          if (p.enabled && p.source) {
            sandboxExecutePlugin(p.source, api)
          }
        }
      } catch (err) {
        console.warn("[Plugins] Load error:", err)
      }
    }

    loadPlugins()

    window.addEventListener("plugin-changed", loadPlugins)
    return () => window.removeEventListener("plugin-changed", loadPlugins)
  }, [])
}
