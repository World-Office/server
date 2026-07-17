export {
  EventBus,
  createEventBus,
  notificationCenter,
  type EditorEvents,
} from "./core/event-bus"

export {
  bind,
  unbind,
  setScope,
  getScope,
  deleteScope,
  isPressed,
  getPressedKeyCodes,
  suspend,
  resume,
  reset,
  useHotkeys,
  useHotkeysScope,
  MODIFIERS,
  KEY_MAP,
  type ModifierState,
  type ShortcutHandler,
} from "./core/keymaster"

export {
  AppProvider,
  useApp,
  useAppSelector,
  type EditorAppConfig,
  type EditorPermissions,
  type EditorType,
} from "./core/application-context"

export * from "./components"

export * from "./controllers"

export * from "./utils"

export { getPluginAPI, sandboxExecutePlugin, createPluginContext } from "./plugin-api"

export * from "./ribbon"

// ── Plugin System ───────────────────────────────────────────────────────

export { type WorldOfficePlugin, type PluginContext, type PluginStatus, type PluginRegistryEntry } from "./plugin/types"
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

export { type PluginConfig, loadPluginConfig, savePluginConfig, getPluginSettings, updatePluginSettings, togglePluginEnabled } from "./plugin/config"

export { PluginLoader, pluginLoader } from "./plugin/loader"
