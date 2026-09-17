import {
  createPluginContext,
  pluginLoader,
  type PluginConfig,
  type WorldOfficePlugin,
} from "@world-office/editor-common"
import { useSyncExternalStore } from "react"

export type { PluginConfig }

// ── Plugin config (native localStorage, same key the editor-common plugin
//    loader + PluginsPanel read). Persisted state is the source of truth;
//    BuiltinPlugin.enabled is the fallback before anything is persisted. ──

const CONFIG_KEY = "wo-plugins"

export function loadPluginConfig(): PluginConfig[] {
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PluginConfig[]) : []
  } catch {
    return []
  }
}

export function savePluginConfig(list: PluginConfig[]): void {
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(list))
  } catch {
    // Ignore storage errors (matches the rest of the app)
  }
  // Let the runtime reconcile (load/unload) immediately.
  window.dispatchEvent(new CustomEvent("plugin-config-changed"))
}

// ── Builtin plugins ─────────────────────────────────────────────────────

interface BuiltinPlugin {
  id: string
  name: string
  version: string
  enabled: boolean
  module: () => Promise<{ default: WorldOfficePlugin }>
}

/** Plugins bundled with the app. `module` is a vite-analyzable static import. */
const BUILTIN_PLUGINS: BuiltinPlugin[] = [
  {
    id: "word-count",
    name: "Word Count",
    version: "1.0.0",
    enabled: true,
    module: () => import("../plugins/word-count"),
  },
]

// ── Host state for plugin-registered UI (buttons from ctx.toolbar) ──────

export interface HostButton {
  id: string
  label: string
  icon?: string
  tooltip?: string
  onClick: () => void
  pluginId: string
}

let hostButtons: HostButton[] = []
const listeners = new Set<() => void>()

function emitHostChange(): void {
  for (const l of listeners) l()
}

export function getHostButtons(): HostButton[] {
  return hostButtons
}

export function subscribeHost(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** React hook over the plugin host state (buttons registered by plugins). */
export function usePluginAppBar(): HostButton[] {
  return useSyncExternalStore(subscribeHost, getHostButtons)
}

// ── Runtime wiring ──────────────────────────────────────────────────────

function effectiveEnabled(id: string): boolean {
  const persisted = loadPluginConfig().find((c) => c.id === id)
  if (persisted) return persisted.enabled
  return BUILTIN_PLUGINS.find((b) => b.id === id)?.enabled ?? false
}

/**
 * Bring the runtime in line with persisted config: load enabled builtins,
 * unload disabled ones. Safe to call repeatedly.
 */
export function reconcilePlugins(): void {
  for (const builtin of BUILTIN_PLUGINS) {
    const enabled = effectiveEnabled(builtin.id)
    if (enabled && !pluginLoader.isActive(builtin.id)) {
      pluginLoader.setContext(createPluginContext(builtin.id))
      const cfg: PluginConfig = {
        id: builtin.id,
        name: builtin.name,
        enabled: true,
        module: builtin.module,
      }
      void pluginLoader.loadPlugins([cfg])
    } else if (!enabled && pluginLoader.isActive(builtin.id)) {
      pluginLoader.unloadPlugin(builtin.id)
    }
  }
}

/** Wire host events once. `onToast` renders plugin toasts. */
export function initPluginRuntime(onToast: (message: string) => void): () => void {
  const onAddButton = (e: Event): void => {
    const d = (e as CustomEvent).detail ?? {}
    if (!d.id || typeof d.onClick !== "function") return
    hostButtons = [
      ...hostButtons.filter((b) => b.id !== d.id),
      {
        id: d.id,
        label: String(d.label ?? d.id),
        icon: d.icon,
        tooltip: d.tooltip,
        onClick: d.onClick,
        pluginId: String(d.pluginId ?? ""),
      },
    ]
    emitHostChange()
  }
  const onRemoveButton = (e: Event): void => {
    const d = (e as CustomEvent).detail ?? {}
    hostButtons = hostButtons.filter((b) => b.id !== d.id)
    emitHostChange()
  }
  const onToastEvent = (e: Event): void => {
    const msg = (e as CustomEvent).detail?.message
    if (typeof msg === "string" && msg) onToast(msg)
  }
  window.addEventListener("plugin-add-button", onAddButton)
  window.addEventListener("plugin-remove-button", onRemoveButton)
  window.addEventListener("plugin-show-toast", onToastEvent)
  window.addEventListener("plugin-config-changed", () => reconcilePlugins())

  reconcilePlugins()

  return () => {
    window.removeEventListener("plugin-add-button", onAddButton)
    window.removeEventListener("plugin-remove-button", onRemoveButton)
    window.removeEventListener("plugin-show-toast", onToastEvent)
    window.removeEventListener("plugin-config-changed", () => reconcilePlugins())
  }
}
