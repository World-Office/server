import { useEffect } from "react"
import {
  getPluginAPI,
  sandboxExecutePlugin,
} from "@world-office/editor-common"

interface Plugin {
  id: string
  name: string
  enabled: boolean
  source: string
}

export function usePlugins() {
  useEffect(() => {
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
        console.error("[Plugins] Load error:", err)
      }
    }

    loadPlugins()

    window.addEventListener("plugin-changed", loadPlugins)
    return () => window.removeEventListener("plugin-changed", loadPlugins)
  }, [])
}
