import { localStorage } from "../utils/local-storage"

// ── Plugin Config ───────────────────────────────────────────────────────

export interface PluginConfig {
  /** Unique plugin identifier */
  id: string
  /** Human-readable plugin name */
  name: string
  /** Whether the plugin is enabled */
  enabled: boolean
  /** Path or URL to the plugin entry module */
  path?: string
  /** Plugin-specific settings */
  settings?: Record<string, unknown>
}

const STORAGE_KEY = "wo-plugins"

/**
 * Load plugin configuration from localStorage.
 * Returns an empty array if no configuration exists.
 */
export function loadPluginConfig(): PluginConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as PluginConfig[]
  } catch {
    return []
  }
}

/**
 * Save plugin configuration to localStorage.
 */
export function savePluginConfig(config: PluginConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch (err) {
    console.error("[Plugin Config] Failed to save:", err)
  }
}

/**
 * Get a plugin's settings by ID.
 */
export function getPluginSettings(pluginId: string): Record<string, unknown> {
  const configs = loadPluginConfig()
  const found = configs.find((c) => c.id === pluginId)
  return found?.settings ?? {}
}

/**
 * Update a plugin's settings by ID.
 */
export function updatePluginSettings(
  pluginId: string,
  settings: Record<string, unknown>,
): void {
  const configs = loadPluginConfig()
  const idx = configs.findIndex((c) => c.id === pluginId)
  if (idx >= 0) {
    configs[idx].settings = { ...configs[idx].settings, ...settings }
  } else {
    configs.push({ id: pluginId, name: pluginId, enabled: true, settings })
  }
  savePluginConfig(configs)
}

/**
 * Toggle a plugin's enabled state.
 */
export function togglePluginEnabled(pluginId: string): boolean {
  const configs = loadPluginConfig()
  const idx = configs.findIndex((c) => c.id === pluginId)
  if (idx >= 0) {
    configs[idx].enabled = !configs[idx].enabled
    savePluginConfig(configs)
    return configs[idx].enabled
  }
  return false
}
