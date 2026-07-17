import type {
  PluginContext,
  PluginEditorAPI,
  PluginEditorSelection,
  PluginI18nAPI,
  PluginMenuAPI,
  PluginMenuItemConfig,
  PluginPanelAPI,
  PluginPanelConfig,
  PluginStorageAPI,
  PluginToolbarAPI,
  PluginToolbarButtonConfig,
  PluginToolbarTabConfig,
} from "./plugin/types"
import { localStorage } from "./utils/local-storage"

// ── Legacy Types (backward compatibility) ───────────────────────────────

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

// ── PluginContext Factory ───────────────────────────────────────────────

/**
 * Create a full PluginContext for a given plugin ID.
 */
export function createPluginContext(pluginId: string): PluginContext {
  const storageApi: PluginStorageAPI = {
    get(key: string): string | null {
      return localStorage.getItem(`wo-plugin:${pluginId}:${key}`)
    },
    set(key: string, value: string): void {
      localStorage.setItem(`wo-plugin:${pluginId}:${key}`, value)
    },
    remove(key: string): void {
      localStorage.removeItem(`wo-plugin:${pluginId}:${key}`)
    },
  }

  const toolbarApi: PluginToolbarAPI = {
    registerButton(config: PluginToolbarButtonConfig): void {
      window.dispatchEvent(
        new CustomEvent("plugin-add-button", {
          detail: { ...config, pluginId },
        }),
      )
    },
    registerTab(config: PluginToolbarTabConfig): void {
      window.dispatchEvent(
        new CustomEvent("plugin-add-tab", {
          detail: { ...config, pluginId },
        }),
      )
    },
    unregisterButton(id: string): void {
      window.dispatchEvent(
        new CustomEvent("plugin-remove-button", {
          detail: { id, pluginId },
        }),
      )
    },
    unregisterTab(id: string): void {
      window.dispatchEvent(
        new CustomEvent("plugin-remove-tab", {
          detail: { id, pluginId },
        }),
      )
    },
  }

  const menuApi: PluginMenuAPI = {
    registerItem(config: PluginMenuItemConfig): void {
      window.dispatchEvent(
        new CustomEvent("plugin-add-menu-item", {
          detail: { ...config, pluginId },
        }),
      )
    },
    unregisterItem(id: string): void {
      window.dispatchEvent(
        new CustomEvent("plugin-remove-menu-item", {
          detail: { id, pluginId },
        }),
      )
    },
  }

  const panelApi: PluginPanelAPI = {
    registerPanel(config: PluginPanelConfig): void {
      window.dispatchEvent(
        new CustomEvent("plugin-add-panel", {
          detail: { ...config, pluginId },
        }),
      )
    },
    unregisterPanel(id: string): void {
      window.dispatchEvent(
        new CustomEvent("plugin-remove-panel", {
          detail: { id, pluginId },
        }),
      )
    },
  }

  const i18nApi: PluginI18nAPI = {
    addTranslations(locale: string, translations: Record<string, string>): void {
      window.dispatchEvent(
        new CustomEvent("plugin-add-translations", {
          detail: { locale, translations, pluginId },
        }),
      )
    },
  }

  const editorApi: PluginEditorAPI = {
    getSelection(): PluginEditorSelection {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) {
        return { text: "", range: document.createRange() }
      }
      const range = sel.getRangeAt(0)
      return { text: sel.toString(), range }
    },
    insertContent(content: string): void {
      window.dispatchEvent(
        new CustomEvent("plugin-insert-content", {
          detail: { content, pluginId },
        }),
      )
    },
  }

  return {
    pluginId,
    toolbar: toolbarApi,
    menu: menuApi,
    panel: panelApi,
    i18n: i18nApi,
    storage: storageApi,
    editor: editorApi,
  }
}

// ── Legacy Plugin API (backward compatible) ─────────────────────────────

let pluginAPI: PluginAPIConfig | null = null

export function getPluginAPI(): PluginAPIConfig {
  if (!pluginAPI) {
    pluginAPI = {
      toolbar: {
        addButton(config) {
          window.dispatchEvent(new CustomEvent("plugin-add-button", { detail: config }))
        },
      },
      editor: {
        on(event, callback) {
          const handler = (e: Event) => callback((e as CustomEvent).detail)
          window.addEventListener(`plugin-event:${event}`, handler)
          return () => window.removeEventListener(`plugin-event:${event}`, handler)
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

export function sandboxExecutePlugin(source: string, api: PluginAPIConfig): void {
  try {
    const fn = new Function("api", source)
    fn(api)
  } catch (err) {
    console.error("[Plugin] Execution error:", err)
  }
}
