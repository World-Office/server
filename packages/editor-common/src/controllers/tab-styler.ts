/**
 * TabStyler controller — manages tab appearance customization.
 *
 * Handles tab style and background settings with localStorage persistence.
 * Emits events when styles change.
 */

import { notificationCenter } from "../core/event-bus"

/** Tab style options */
export type TabStyle = "fill" | "line"

/** Tab background options */
export type TabBackground = "header" | "toolbar" | "tab"

/** Feature flag configuration */
interface FeatureConfig {
  canChangeStyle: boolean
  canChangeBackground: boolean
}

/** Theme info needed for style initialization */
interface ThemeInfo {
  themeId: string
  defaultTabStyle: TabStyle
}

/** Storage keys for tab settings */
const STORAGE_TAB_STYLE = "settings-tab-style"
const STORAGE_TAB_BACKGROUND = "settings-tab-background"

/** Internal settings (migrated from Common.Utils.InternalSettings) */
const internalSettings = {
  tabStyle: undefined as TabStyle | undefined,
  tabBackground: undefined as TabBackground | undefined,
}

const features: FeatureConfig = {
  canChangeStyle: true,
  canChangeBackground: true,
}

let themeInfo: ThemeInfo | null = null

/** Checks if a value exists in localStorage */
function storageItemExists(key: string): boolean {
  return localStorage.getItem(key) !== null
}

/** Gets the default tab style based on theme and configuration */
function getDefaultTabStyle(): TabStyle {
  const styleFromStorage = localStorage.getItem(STORAGE_TAB_STYLE)
  if (features.canChangeStyle && styleFromStorage) {
    const isNewTheme =
      themeInfo &&
      (themeInfo.themeId === "theme-system" ||
        themeInfo.themeId === "theme-white" ||
        themeInfo.themeId === "theme-night")

    // For new themes without stored style, default to 'line'
    if (isNewTheme && !storageItemExists("settings-tab-style-newtheme")) {
      return "line"
    }
    return (styleFromStorage as TabStyle) || "fill"
  }

  return themeInfo?.defaultTabStyle || "fill"
}

/** Gets the default tab background based on configuration */
function getDefaultTabBackground(): TabBackground {
  const backgroundFromStorage = localStorage.getItem(STORAGE_TAB_BACKGROUND)
  if (features.canChangeBackground && backgroundFromStorage) {
    return (backgroundFromStorage as TabBackground) || "header"
  }

  return "header"
}

/** Refreshes tab style from localStorage */
function refreshStyle(): void {
  const storedValue = localStorage.getItem(STORAGE_TAB_STYLE)
  if (storedValue && storedValue !== internalSettings.tabStyle) {
    internalSettings.tabStyle = storedValue as TabStyle
    notificationCenter.emit("tabstyle:changed", storedValue as TabStyle)
  }
}

/** Refreshes tab background from localStorage */
function refreshBackground(): void {
  const storedValue = localStorage.getItem(STORAGE_TAB_BACKGROUND)
  if (storedValue && storedValue !== internalSettings.tabBackground) {
    internalSettings.tabBackground = storedValue as TabBackground
    notificationCenter.emit("tabbackground:changed", storedValue as TabBackground)
  }
}

/** Sets the tab style */
function setStyle(style?: TabStyle): void {
  const resolvedStyle = style || getDefaultTabStyle()
  localStorage.setItem(STORAGE_TAB_STYLE, resolvedStyle)
  internalSettings.tabStyle = resolvedStyle
  notificationCenter.emit("tabstyle:changed", resolvedStyle)
}

/** Sets the tab background */
function setBackground(background: TabBackground): void {
  localStorage.setItem(STORAGE_TAB_BACKGROUND, background)
  internalSettings.tabBackground = background
  notificationCenter.emit("tabbackground:changed", background)
}

/** Handles theme change events */
function handleThemeChanged(): void {
  setStyle()
}

/** Sets up window storage event listeners */
function setupStorageListeners(): void {
  window.addEventListener("storage", (e: globalThis.StorageEvent) => {
    if (e.key === STORAGE_TAB_STYLE && features.canChangeStyle) {
      refreshStyle()
    } else if (e.key === STORAGE_TAB_BACKGROUND && features.canChangeBackground) {
      refreshBackground()
    }
  })
}

/**
 * Initializes the TabStyler controller.
 * @param customThemeInfo Theme information for style initialization
 * @param featureFlags Feature flag configuration (optional, defaults to both enabled)
 */
export function initTabStyler(
  customThemeInfo: ThemeInfo,
  featureFlags?: Partial<FeatureConfig>,
): void {
  themeInfo = customThemeInfo

  if (featureFlags) {
    if (featureFlags.canChangeStyle !== undefined) {
      features.canChangeStyle = featureFlags.canChangeStyle
    }
    if (featureFlags.canChangeBackground !== undefined) {
      features.canChangeBackground = featureFlags.canChangeBackground
    }
  }

  // Initialize settings
  internalSettings.tabStyle = getDefaultTabStyle()
  internalSettings.tabBackground = getDefaultTabBackground()

  // Set up event listeners
  setupStorageListeners()
  notificationCenter.on("uitheme:changed", handleThemeChanged)
}

/**
 * Sets the tab style and persists to localStorage.
 * @param style The tab style to set (fill or line)
 */
export function setTabStyle(style: TabStyle): void {
  setStyle(style)
}

/**
 * Sets the tab background and persists to localStorage.
 * @param background The tab background to set (header, toolbar, or tab)
 */
export function setTabBackground(background: TabBackground): void {
  setBackground(background)
}

/**
 * Refreshes the tab style from localStorage and emits change event.
 */
export function refreshTabStyle(): void {
  refreshStyle()
}

/**
 * Refreshes the tab background from localStorage and emits change event.
 */
export function refreshTabBackground(): void {
  refreshBackground()
}
