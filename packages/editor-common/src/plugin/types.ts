// ── Plugin Types ────────────────────────────────────────────────────────
// Type definitions for the World Office plugin architecture.

// ── Toolbar API Types ───────────────────────────────────────────────────

export interface PluginToolbarButtonConfig {
  /** Unique button identifier (scoped to plugin, e.g. "word-count") */
  id: string
  /** Display label */
  label: string
  /** Lucide icon name */
  icon?: string
  /** Tooltip text */
  tooltip?: string
  /** Ribbon group to place the button in */
  group?: string
  /** Click handler */
  onClick: () => void
  /** Whether the button is a toggle */
  toggleable?: boolean
  /** Current toggle state */
  toggled?: boolean
}

export interface PluginToolbarTabConfig {
  /** Unique tab identifier */
  id: string
  /** Display label */
  label: string
  /** Optional icon */
  icon?: string
}

export interface PluginToolbarAPI {
  registerButton(config: PluginToolbarButtonConfig): void
  registerTab(config: PluginToolbarTabConfig): void
  unregisterButton(id: string): void
  unregisterTab(id: string): void
}

// ── Menu API Types ──────────────────────────────────────────────────────

export interface PluginMenuItemConfig {
  /** Unique menu item identifier */
  id: string
  /** Display label */
  label: string
  /** Optional icon */
  icon?: string
  /** Click handler */
  onClick: () => void
  /** Keyboard shortcut hint */
  shortcut?: string
  /** Whether the item is disabled */
  disabled?: boolean
  /** Nested submenu items */
  children?: PluginMenuItemConfig[]
  /** Whether this is a separator */
  separator?: boolean
  /** Menu path (e.g. "file/export") */
  menuPath?: string
}

export interface PluginMenuAPI {
  registerItem(config: PluginMenuItemConfig): void
  unregisterItem(id: string): void
}

// ── Panel API Types ─────────────────────────────────────────────────────

export interface PluginPanelConfig {
  /** Unique panel identifier */
  id: string
  /** Display title */
  title: string
  /** Optional icon */
  icon?: string
  /** Panel position: "left" | "right" | "bottom" */
  position?: "left" | "right" | "bottom"
  /** Render function — receives a container element */
  render: (container: HTMLElement) => undefined | (() => void)
  /** Destroy/cleanup function */
  destroy?: () => void
}

export interface PluginPanelAPI {
  registerPanel(config: PluginPanelConfig): void
  unregisterPanel(id: string): void
}

// ── i18n API Types ──────────────────────────────────────────────────────

export interface PluginI18nAPI {
  addTranslations(locale: string, translations: Record<string, string>): void
}

// ── Storage API Types ───────────────────────────────────────────────────

export interface PluginStorageAPI {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

// ── Editor API Types ────────────────────────────────────────────────────

export interface PluginEditorSelection {
  text: string
  range: Range
}

export interface PluginEditorAPI {
  getSelection(): PluginEditorSelection
  insertContent(content: string): void
}

// ── Plugin Context ──────────────────────────────────────────────────────

export interface PluginContext {
  pluginId: string
  toolbar: PluginToolbarAPI
  menu: PluginMenuAPI
  panel: PluginPanelAPI
  i18n: PluginI18nAPI
  storage: PluginStorageAPI
  editor: PluginEditorAPI
}

// ── WorldOfficePlugin Interface ─────────────────────────────────────────

export interface WorldOfficePlugin {
  /** Unique plugin identifier (e.g. "word-count") */
  id: string
  /** Human-readable plugin name */
  name: string
  /** Semantic version string */
  version: string
  /** Optional plugin description */
  description?: string
  /** Called when the plugin is loaded. Receives the full PluginContext. */
  init(ctx: PluginContext): void | Promise<void>
  /** Called when the plugin is unloaded. Cleanup resources here. */
  destroy(): void
}

// ── Plugin Status ───────────────────────────────────────────────────────

export type PluginStatus = "active" | "failed" | "disabled"

export interface PluginRegistryEntry {
  plugin: WorldOfficePlugin
  status: PluginStatus
  error?: string
}
