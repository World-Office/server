// ── Plugin SDK - Public API ──────────────────────────────────────────────
// Re-exports all plugin types and utilities from @world-office/editor-common
// and provides SDK-specific helpers for plugin development.

export type {
  WorldOfficePlugin,
  PluginContext,
  PluginToolbarAPI,
  PluginMenuAPI,
  PluginPanelAPI,
  PluginStorageAPI,
  PluginEditorAPI,
  PluginToolbarButtonConfig,
  PluginToolbarTabConfig,
  PluginMenuItemConfig,
  PluginPanelConfig,
  PluginEditorSelection,
  PluginStatus,
  PluginRegistryEntry,
} from "@world-office/editor-common"

export {
  createPluginContext,
  getPluginAPI,
  sandboxExecutePlugin,
  type PluginConfig,
  loadPluginConfig,
  savePluginConfig,
  getPluginSettings,
  updatePluginSettings,
  togglePluginEnabled,
  PluginLoader,
  pluginLoader,
} from "@world-office/editor-common"

import type { PluginManifest } from "./types"
export type { PluginManifest }
export { validatePlugin, type ValidationResult } from "./validator"
export { scaffoldPlugin } from "./scaffold"

/**
 * Create a plugin manifest object with the given configuration.
 * Returns a PluginManifest with sensible defaults for optional fields.
 */
export function createPluginManifest(config: {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  license?: string
  homepage?: string
  icon?: string
}): PluginManifest {
  return {
    id: config.id,
    name: config.name,
    version: config.version,
    description: config.description,
    author: config.author,
    license: config.license ?? "AGPL-3.0",
    homepage: config.homepage,
    icon: config.icon,
    main: "src/index.ts",
  }
}
