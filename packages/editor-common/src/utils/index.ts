/**
 * Utils barrel export
 * Exports all utility modules for the editor-common package
 */

export * from "./browser"
export * from "./color"
export * from "./enums"
export * from "./local-storage"
export * from "./metric"
export * from "./screen-reader"
export * from "./string"
export * from "./url-patterns"
export * from "./language-info"
export * from "./math-types"
export * from "./character-codes"

// Re-export internal-settings with namespace prefix to avoid conflicts
// with controllers/themes.ts exports (e.g., 'get')
export {
  get as getInternalSetting,
  set as setInternalSetting,
  remove as removeInternalSetting,
  has as hasInternalSetting,
  clear as clearInternalSettings,
  keys as getInternalSettingKeys,
  entries as getInternalSettingEntries,
} from "./internal-settings"
