export {
  EventBus,
  createEventBus,
  notificationCenter,
  type EditorEvents,
} from "./core/event-bus"

export {
  registerEditorRouter,
  registerCommands,
  unregisterCommands,
  isCommandRegistered,
  getRegisteredCommands,
  resetRouter,
  type WoCommand,
  type CommandHandler,
} from "./core/command-router"

export * from "./controllers"

export * from "./utils"

export { getPluginAPI, sandboxExecutePlugin, createPluginContext } from "./plugin-api"

export * from "./ribbon"

// ── Plugin System ───────────────────────────────────────────────────────

export type {
  WorldOfficePlugin,
  PluginContext,
  PluginStatus,
  PluginRegistryEntry,
} from "./plugin/types"
export type {
  PluginToolbarButtonConfig,
  PluginToolbarTabConfig,
  PluginToolbarAPI,
  PluginMenuItemConfig,
  PluginMenuAPI,
  PluginPanelConfig,
  PluginPanelAPI,
  PluginI18nAPI,
  PluginStorageAPI,
  PluginEditorAPI,
  PluginEditorSelection,
} from "./plugin/types"

export {
  type PluginConfig,
  loadPluginConfig,
  savePluginConfig,
  getPluginSettings,
  updatePluginSettings,
  togglePluginEnabled,
} from "./plugin/config"

export { PluginLoader, pluginLoader } from "./plugin/loader"
