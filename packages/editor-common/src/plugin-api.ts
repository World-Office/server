interface ToolbarButtonConfig {
  id: string
  label: string
  icon?: string
  onClick: () => void
}

interface PluginAPIConfig {
  toolbar: {
    addButton(config: ToolbarButtonConfig): void
  }
  editor: {
    on(event: string, callback: (data: unknown) => void): () => void
    getDocument(): unknown
  }
  ui: {
    showToast(message: string): void
  }
}

let pluginAPI: PluginAPIConfig | null = null

export function getPluginAPI(): PluginAPIConfig {
  if (!pluginAPI) {
    pluginAPI = {
      toolbar: {
        addButton(config) {
          window.dispatchEvent(
            new CustomEvent("plugin-add-button", { detail: config }),
          )
        },
      },
      editor: {
        on(event, callback) {
          const handler = (e: Event) =>
            callback((e as CustomEvent).detail)
          window.addEventListener(`plugin-event:${event}`, handler)
          return () =>
            window.removeEventListener(`plugin-event:${event}`, handler)
        },
        getDocument() {
          return {}
        },
      },
      ui: {
        showToast(message) {
          console.log("[Plugin]", message)
        },
      },
    }
  }
  return pluginAPI
}

export function sandboxExecutePlugin(
  source: string,
  api: PluginAPIConfig,
): void {
  try {
    const fn = new Function("api", source)
    fn(api)
  } catch (err) {
    console.error("[Plugin] Execution error:", err)
  }
}
