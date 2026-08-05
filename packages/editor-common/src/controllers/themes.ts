/**
 * Themes controller — manages UI theme switching, skeleton CSS,
 * theme color tokens, and content dark mode.
 *
 * Migrated from: apps/web/apps/common/main/lib/controller/Themes.js
 */

import { type ControllerEvents, notificationCenter } from "../core/event-bus"
import * as desktop from "./desktop"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThemeType = "light" | "dark" | "system"

/** Skeleton CSS descriptor for skeleton-screen loading states */
export interface ThemeSkeleton {
  css: string
}

/** Icon configuration for a theme */
export interface ThemeIcons {
  cls?: string
  src?: string
  basepath?: string
}

/** A single theme entry (used for remote / custom themes) */
export interface ThemeSource {
  id: string
  name: string
  type: ThemeType
  l10n?: Record<string, string>
  colors?: Record<string, string>
  icons?: { "sprite-buttons-base-url"?: string; "style-class-selector"?: string }
}

/** Runtime theme record stored in the themes map */
export interface ThemeRecord {
  text: string
  type: ThemeType
  source: "static" | "remote"
  skeleton?: ThemeSkeleton
  icons?: ThemeIcons
  src?: ThemeSource
}

/** Parsed theme object stored in localStorage under "ui-theme" */
export interface StoredTheme {
  id: string
  type: ThemeType
  text: string
  colors?: Record<string, string>
  icons?: ThemeIcons
}

/** Font theme properties */
export interface FontThemeProps {
  size: string
  name: string
}

/** The global `window.uitheme` interface injected by the server / build */
interface UiThemeWindow {
  id: string
  type?: ThemeType
  iscontentdark: boolean
  embedicons?: boolean
  DEFAULT_LIGHT_THEME_ID: string
  DEFAULT_DARK_THEME_ID: string
  set_id(id: string): void
  relevant_theme_id(): string
  is_theme_system(): boolean
  apply_icons_from_url(themeId: string, url: string): void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THEME_TYPE_LIGHT: ThemeType = "light"
const THEME_TYPE_DARK: ThemeType = "dark"
const THEME_TYPE_SYSTEM: ThemeType = "system"

/** CSS custom-property color tokens read from the document to build the skin object */
const themeColorTokens: string[] = [
  "toolbar-header-document",
  "toolbar-header-spreadsheet",
  "toolbar-header-presentation",
  "toolbar-header-pdf",
  "toolbar-header-visio",

  "text-toolbar-header-on-background-document",
  "text-toolbar-header-on-background-spreadsheet",
  "text-toolbar-header-on-background-presentation",
  "text-toolbar-header-on-background-pdf",
  "text-toolbar-header-on-background-visio",

  "background-normal",
  "background-toolbar",
  "background-toolbar-tab",
  "background-toolbar-additional",
  "background-primary-dialog-button",
  "background-notification-popover",
  "background-notification-badge",
  "background-scrim",
  "background-loader",
  "background-accent-button",
  "background-contrast-popover",
  "background-alt-key-hint",
  "shadow-contrast-popover",
  "background-fill-button",
  "background-pane",
  "background-pane-additional",

  "highlight-button-hover",
  "highlight-button-pressed",
  "highlight-button-pressed-hover",
  "highlight-primary-dialog-button-hover",
  "highlight-primary-dialog-button-pressed",
  "highlight-header-button-hover",
  "highlight-header-button-pressed",
  "highlight-text-select",
  "highlight-fill-button-hover",
  "highlight-fill-button-pressed",
  "highlight-toolbar-tab-underline-document",
  "highlight-toolbar-tab-underline-spreadsheet",
  "highlight-toolbar-tab-underline-presentation",
  "highlight-toolbar-tab-underline-pdf",
  "highlight-toolbar-tab-underline-visio",
  "highlight-header-tab-underline-document",
  "highlight-header-tab-underline-spreadsheet",
  "highlight-header-tab-underline-presentation",
  "highlight-header-tab-underline-pdf",
  "highlight-header-tab-underline-visio",
  "highlight-comment-hover",
  "highlight-comment-pressed",

  "border-toolbar",
  "border-toolbar-active-panel-top",
  "border-toolbar-active-tab",
  "border-divider",
  "border-regular-control",
  "border-preview-hover",
  "border-preview-select",
  "border-control-focus",
  "border-color-shading",
  "border-contrast-popover",
  "border-button-pressed-focus",

  "text-normal",
  "text-normal-pressed",
  "text-secondary",
  "text-tertiary",
  "text-link",
  "text-link-hover",
  "text-link-active",
  "text-link-visited",
  "text-inverse",
  "text-toolbar-header",
  "text-contrast-background",
  "text-alt-key-hint",

  "icon-normal",
  "icon-normal-pressed",
  "icon-toolbar-header",
  "icon-success",

  "canvas-background",
  "canvas-content-background",
  "canvas-page-border",

  "canvas-ruler-background",
  "canvas-ruler-border",
  "canvas-ruler-margins-background",
  "canvas-ruler-mark",
  "canvas-ruler-handle-border",
  "canvas-ruler-handle-border-disabled",

  "canvas-high-contrast",
  "canvas-high-contrast-disabled",

  "canvas-cell-title-background",
  "canvas-cell-title-background-hover",
  "canvas-cell-title-background-selected",
  "canvas-cell-title-border",
  "canvas-cell-title-border-hover",
  "canvas-cell-title-border-selected",
  "canvas-cell-title-text",

  "canvas-dark-cell-title",
  "canvas-dark-cell-title-hover",
  "canvas-dark-cell-title-selected",
  "canvas-dark-cell-title-border",
  "canvas-dark-cell-title-border-hover",
  "canvas-dark-cell-title-border-selected",

  "canvas-scroll-thumb",
  "canvas-scroll-thumb-hover",
  "canvas-scroll-thumb-pressed",
  "canvas-scroll-thumb-border",
  "canvas-scroll-thumb-border-hover",
  "canvas-scroll-thumb-border-pressed",
  "canvas-scroll-arrow",
  "canvas-scroll-arrow-hover",
  "canvas-scroll-arrow-pressed",
  "canvas-scroll-thumb-target",
  "canvas-scroll-thumb-target-hover",
  "canvas-scroll-thumb-target-pressed",

  "canvas-sheet-view-cell-background",
  "canvas-sheet-view-cell-background-hover",
  "canvas-sheet-view-cell-background-pressed",
  "canvas-sheet-view-cell-title-label",
  "canvas-sheet-view-select-all-icon",

  "canvas-select-all-icon",

  "canvas-anim-pane-background",
  "canvas-anim-pane-item-fill-selected",
  "canvas-anim-pane-item-fill-hovered",
  "canvas-anim-pane-button-fill",
  "canvas-anim-pane-button-fill-hovered",
  "canvas-anim-pane-button-fill-disabled",
  "canvas-anim-pane-play-button-fill",
  "canvas-anim-pane-play-button-outline",
  "canvas-anim-pane-effect-bar-entrance-fill",
  "canvas-anim-pane-effect-bar-entrance-outline",
  "canvas-anim-pane-effect-bar-emphasis-fill",
  "canvas-anim-pane-effect-bar-emphasis-outline",
  "canvas-anim-pane-effect-bar-exit-fill",
  "canvas-anim-pane-effect-bar-exit-outline",
  "canvas-anim-pane-effect-bar-path-fill",
  "canvas-anim-pane-effect-bar-path-outline",
  "canvas-anim-pane-timeline-ruler-outline",
  "canvas-anim-pane-timeline-ruler-tick",

  "canvas-anim-pane-timeline-scroller-fill",
  "canvas-anim-pane-timeline-scroller-outline",
  "canvas-anim-pane-timeline-scroller-opacity",
  "canvas-anim-pane-timeline-scroller-opacity-hovered",
  "canvas-anim-pane-timeline-scroller-opacity-active",

  "toolbar-height-controls",
  "sprite-button-icons-uid",
]

// ---------------------------------------------------------------------------
// Static theme definitions (skeleton CSS preserved verbatim from source)
// ---------------------------------------------------------------------------

const themesMap: Record<string, ThemeRecord> = {
  "theme-system": {
    text: "Same as system",
    type: THEME_TYPE_SYSTEM,
    source: "static",
  },
  "theme-light": {
    text: "Light",
    type: "light",
    source: "static",
    skeleton: {
      css: `.loadmask {--sk-height-toolbar-controls: 66px; --sk-layout-padding-toolbar: 0;
                        --sk-shadow-toolbar: inset 0 -1px #cbcbcb; --sk-border-radius-toolbar: 0;
                        --sk-background-toolbar: #f7f7f7; --sk-background-toolbar-controls: #f7f7f7;
                        --sk-background-toolbar-header-word: #446995; --sk-background-toolbar-header-pdf: #aa5252;
                        --sk-background-toolbar-header-slide: #BE664F; --sk-background-toolbar-header-cell: #40865c; 
                        --sk-background-toolbar-header-visio: #444796; 
                        --sk-background-toolbar-tab: rgba(0,0,0,.15); --sk-background-toolbar-button: #d8dadc;
                        --sk-layout-padding-toolbar-controls: 0 7px; --sk-layout-padding-header: 0 8px;
                        --sk-canvas-background: #eee; --sk-canvas-content-background: #fff;
                        --sk-canvas-page-border: #dde0e5; --sk-canvas-line: rgba(0,0,0,.05);
                        --sk-height-formula: 24px; --sk-padding-formula: 0 0 4px 0;
                        --sk-border-style-formula: solid; --sk-gap-formula-field: 20px;
                        --sk-border-radius-formula-field: 0px; --sk-layout-padding-placeholder: 46px auto;
                    }`,
    },
  },
  "theme-classic-light": {
    text: "Classic Light",
    type: "light",
    source: "static",
    skeleton: {
      css: `.loadmask {--sk-height-toolbar-controls: 66px; --sk-layout-padding-toolbar: 0;
                        --sk-shadow-toolbar: inset 0 -1px #cbcbcb; --sk-border-radius-toolbar: 0;
                        --sk-background-toolbar-header-word: #446995; --sk-background-toolbar-header-pdf: #aa5252;
                        --sk-background-toolbar-header-slide: #BE664F;; --sk-background-toolbar-header-cell: #40865c;
                        --sk-background-toolbar-header-visio: #444796; 
                        --sk-background-toolbar: #f7f7f7; --sk-background-toolbar-controls: #f1f1f1;
                        --sk-background-toolbar-tab: rgba(255,255,255,.15); --sk-background-toolbar-button: #d8dadc;
                        --sk-layout-padding-toolbar-controls: 0 7px; --sk-layout-padding-header: 0 8px;
                        --sk-canvas-background: #eee; --sk-canvas-content-background: #fff;
                        --sk-canvas-page-border: #dde0e5; --sk-canvas-line: rgba(0,0,0,.05);
                        --sk-height-formula: 24px; --sk-padding-formula: 0 0 4px 0;
                        --sk-border-style-formula: solid; --sk-gap-formula-field: 20px;
                        --sk-border-radius-formula-field: 0px; --sk-layout-padding-placeholder: 46px auto;
                    }`,
    },
  },
  "theme-dark": {
    text: "Dark",
    type: "dark",
    source: "static",
    skeleton: {
      css: `.theme-dark .loadmask, .theme-type-dark .loadmask {
                  --sk-height-toolbar-controls: 66px; --sk-layout-padding-toolbar: 0;
                  --sk-shadow-toolbar: inset 0 -1px #616161; --sk-border-radius-toolbar: 0;
                  --sk-background-toolbar-header-word: #2a2a2a; --sk-background-toolbar-header-pdf: #2a2a2a;
                  --sk-background-toolbar-header-slide: #2a2a2a;--sk-background-toolbar-header-cell: #2a2a2a;
                  --sk-background-toolbar-header-visio: #2a2a2a; 
                  --sk-background-toolbar: #404040; --sk-background-toolbar-controls: #404040;
                  --sk-background-toolbar-tab: rgba(255,255,255,.15); --sk-background-toolbar-button: #555;
                  --sk-layout-padding-toolbar-controls: 0 7px; --sk-layout-padding-header: 0 8px;
                  --sk-canvas-background: #555; --sk-canvas-content-background: #fff;
                  --sk-canvas-page-border: #555; --sk-canvas-line: rgba(0,0,0,.05);
                  --sk-height-formula: 24px; --sk-padding-formula: 0 0 4px 0;
                  --sk-border-style-formula: solid; --sk-gap-formula-field: 20px;
                  --sk-border-radius-formula-field: 0px; --sk-layout-padding-placeholder: 46px auto;
              }
              .content-theme-dark {
                  --sk-canvas-content-background: #3a3a3a; --sk-canvas-page-border: #616161;
                  --sk-canvas-line: rgba(255,255,255,.05);
              }`,
    },
  },
  "theme-contrast-dark": {
    text: "Dark Contrast",
    type: "dark",
    source: "static",
    skeleton: {
      css: `.theme-dark .loadmask, .theme-type-dark .loadmask {
                  --sk-height-toolbar-controls: 66px; --sk-layout-padding-toolbar: 0;
                  --sk-shadow-toolbar: inset 0 -1px #616161; --sk-border-radius-toolbar: 0;
                  --sk-background-toolbar-header-word: #2a2a2a; --sk-background-toolbar-header-pdf: #2a2a2a;
                  --sk-background-toolbar-header-slide: #2a2a2a;--sk-background-toolbar-header-cell: #2a2a2a;
                  --sk-background-toolbar-header-visio: #2a2a2a; 
                  --sk-background-toolbar: #404040; --sk-background-toolbar-controls: #404040;
                  --sk-background-toolbar-tab: rgba(255,255,255,.15); --sk-background-toolbar-button: #555;
                  --sk-layout-padding-toolbar-controls: 0 7px; --sk-layout-padding-header: 0 8px;
                  --sk-canvas-background: #555; --sk-canvas-content-background: #fff;
                  --sk-canvas-page-border: #555; --sk-canvas-line: rgba(0,0,0,.05);
                  --sk-height-formula: 24px; --sk-padding-formula: 0 0 4px 0;
                  --sk-border-style-formula: solid; --sk-gap-formula-field: 20px;
                  --sk-border-radius-formula-field: 0px; --sk-layout-padding-placeholder: 46px auto;
              }
              .content-theme-dark {
                  --sk-canvas-content-background: #3a3a3a;
                  --sk-canvas-page-border: #616161; --sk-canvas-line: rgba(255,255,255,.05);
              }`,
    },
  },
  "theme-gray": {
    text: "Gray",
    type: "light",
    source: "static",
    skeleton: {
      css: `.loadmask {--sk-height-toolbar-controls: 66px;--sk-layout-padding-toolbar: 0;
                        --sk-shadow-toolbar: inset 0 -1px #cbcbcb; --sk-border-radius-toolbar: 0;
                        --sk-background-toolbar-header-word: #f7f7f7; --sk-background-toolbar-header-pdf: #f7f7f7;
                        --sk-background-toolbar-header-slide: #f7f7f7;--sk-background-toolbar-header-cell: #f7f7f7;
                        --sk-background-toolbar-header-visio: #f7f7f7; 
                        --sk-background-toolbar: #f7f7f7; --sk-background-toolbar-controls: #f1f1f1;
                        --sk-background-toolbar-tab: #e0e0e0; --sk-background-toolbar-button: #e0e0e0;
                        --sk-layout-padding-toolbar-controls: 0 7px; --sk-layout-padding-header: 0 8px;
                        --sk-canvas-background: #eee; --sk-canvas-content-background: #fff;
                        --sk-canvas-page-border: #ccc; --sk-canvas-line: rgba(0,0,0,.05);
                        --sk-height-formula: 24px; --sk-padding-formula: 0 0 4px 0;
                        --sk-border-style-formula: solid; --sk-gap-formula-field: 20px;
                        --sk-border-radius-formula-field: 0px; --sk-layout-padding-placeholder: 46px auto;
                    }`,
    },
  },
  "theme-white": {
    text: "White",
    type: "light",
    source: "static",
    icons: {
      cls: "mod2",
    },
  },
  "theme-night": {
    text: "Night",
    type: "dark",
    source: "static",
    icons: {
      cls: "mod2",
    },
  },
}

// ---------------------------------------------------------------------------
// Module-scoped state
// ---------------------------------------------------------------------------

/** Cached theme properties (fonts, tab-style, button size) */
let themeProps: Record<string, unknown> = {}

/** The editor API reference set during init */
let api: {
  asc_setSkin: (obj: Record<string, unknown>) => void
  asc_setContentDarkMode: (dark: boolean) => void
} | null = null

/** Whether the theme switcher is locked (unavailable) */
let locked = false

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Accessor for the global `window.uitheme` object */
function uitheme(): UiThemeWindow {
  return (window as unknown as { uitheme: UiThemeWindow }).uitheme
}

/** Reads current theme CSS custom-property values from the document body */
function getCurrentThemeColors(tokens?: string[]): Record<string, string> {
  const colors = tokens ?? themeColorTokens
  const out: Record<string, string> = {}
  const style = getComputedStyle(document.body)
  for (const item of colors) {
    out[item] = style.getPropertyValue(`--${item}`).trim()
  }
  return out
}

/** Returns true if at least one of the first 5 values in obj is non-empty */
function validateVars(obj: Record<string, string>): boolean {
  if (!obj) return false
  let i = 0
  const count = 5
  for (const value of Object.values(obj)) {
    if (value !== "") return true
    if (++i < count) break
  }
  return false
}

/** Builds a CSS string for a theme's color overrides */
function createColorsCss(id: string, colors: Record<string, string>): string | undefined {
  if (!colors || !id) return undefined
  const parts: string[] = [":root .", id, "{"]
  for (const c in colors) {
    if (c === "highlight-toolbar-tab-underline") {
      console.warn(
        "Obsolete: The 'highlight-toolbar-tab-underline' color for interface themes is deprecated. " +
          "Please use 'highlight-toolbar-tab-underline-document', 'highlight-toolbar-tab-underline-presentation', etc. instead.",
      )
      parts.push("--", `${c}-document`, ":", colors[c], ";")
      parts.push("--", `${c}-spreadsheet`, ":", colors[c], ";")
      parts.push("--", `${c}-presentation`, ":", colors[c], ";")
      parts.push("--", `${c}-pdf`, ":", colors[c], ";")
      parts.push("--", `${c}-visio`, ":", colors[c], ";")
    } else {
      parts.push("--", c, ":", colors[c], ";")
    }
  }
  parts.push("}")
  return parts.join("")
}

/** Injects a <style> element into <head> */
function writeThemeCss(id: string, css: string): void {
  if (!css) return
  const style = document.createElement("style")
  style.id = id
  style.type = "text/css"
  style.innerHTML = css
  document.getElementsByTagName("head")[0].appendChild(style)
}

/** Normalizes icon metadata from a remote theme source */
function normalizeThemeIcons(t: ThemeRecord): void {
  if (t.src?.icons) {
    if (!t.icons) t.icons = {}
    if (t.src.icons["sprite-buttons-base-url"]) {
      t.icons.basepath = t.src.icons["sprite-buttons-base-url"]
    }
    if (t.src.icons["style-class-selector"]) {
      t.icons.src = t.src.icons["style-class-selector"]
    }
  }
}

/** Resolves a theme argument to its ID string */
function getUiThemeName(obj: unknown): string | undefined {
  if (typeof obj === "string" && obj.startsWith("{") && obj.endsWith("}")) {
    try {
      const parsed = JSON.parse(obj) as Record<string, unknown>
      return parsed.id as string | undefined
    } catch {
      return obj
    }
  }
  if (obj && typeof obj === "object") {
    return (obj as Record<string, unknown>).id as string | undefined
  }
  return obj as string | undefined
}

/** Checks whether a theme ID maps to the "system" type */
function isThemeTypeSystem(id: string): boolean {
  return themesMap[id]?.type === THEME_TYPE_SYSTEM
}

/** Returns the effective system theme type (dark or light) */
function getSystemThemeType(): ThemeType {
  if (desktop.isActive()) {
    return desktop.systemThemeType()
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? THEME_TYPE_DARK
    : THEME_TYPE_LIGHT
}

/** Returns the default theme for the current system preference */
function getSystemDefaultTheme(): { id: string; info: ThemeRecord } {
  const id =
    getSystemThemeType() === THEME_TYPE_DARK
      ? uitheme().DEFAULT_DARK_THEME_ID
      : uitheme().DEFAULT_LIGHT_THEME_ID
  return { id, info: themesMap[id] }
}

// ---------------------------------------------------------------------------
// Internal operations
// ---------------------------------------------------------------------------

/** Parses a themes config object (single or array) into the themes map */
function parseThemesObject(obj: { themes?: ThemeSource[] } & ThemeSource): void {
  if (Array.isArray(obj.themes)) {
    for (const item of obj.themes) {
      if (item.id) {
        themesMap[item.id] = {
          text: item.l10n?.[navigator.language] || item.name,
          type: item.type,
          src: item,
          source: "remote",
        }
      } else if (typeof item === "string") {
        // URL reference — not supported in the TypeScript rewrite
        // (would require async config loading infrastructure)
      }
    }
  } else if (obj.id) {
    themesMap[obj.id] = {
      text: obj.l10n?.[navigator.language] || obj.name,
      type: obj.type,
      src: obj,
      source: "remote",
    }
  }

  notificationCenter.emit("uitheme:countchanged")
}

/** Applies a theme by ID — updates body classes, icons, CSS vars, and API */
function applyTheme(id: string): void {
  const ut = uitheme()
  ut.set_id(id)

  const themeId = ut.relevant_theme_id()
  const themeRecord = themesMap[themeId]
  if (!themeRecord) return

  // Write custom color CSS for remote themes
  if (themeRecord.src) {
    const css = createColorsCss(themeRecord.src.id, themeRecord.src.colors ?? {})
    if (css) writeThemeCss(themeRecord.src.id, css)
    normalizeThemeIcons(themeRecord)
    themeRecord.src = undefined
  }

  // Update body classes
  document.body.className = document.body.className.replace(/theme-[\w-]+\s?/gi, "").trim()
  document.body.classList.add(themeId, `theme-type-${themeRecord.type}`)

  // Handle icon base URL and classes
  let iconsBaseUrl = getComputedStyle(document.body).getPropertyValue(
    "--sprite-button-icons-base-url",
  )
  if (themeRecord.icons) {
    if (themeRecord.icons.basepath) {
      iconsBaseUrl = themeRecord.icons.basepath
    } else if (iconsBaseUrl) {
      themeRecord.icons.basepath = iconsBaseUrl
    }
    if (themeRecord.icons.cls) {
      document.body.classList.add(`theme-icons-cls-${themeRecord.icons.cls}`)
    }
  }

  if (iconsBaseUrl && ut.embedicons !== true) {
    ut.apply_icons_from_url(themeId, iconsBaseUrl)
  }

  // Push dark-mode content flag to the editor API
  if (api?.asc_setContentDarkMode) {
    if (themeRecord.type === "dark") {
      api.asc_setContentDarkMode(isContentThemeDark())
      notificationCenter.emit("contenttheme:dark", isContentThemeDark())
    } else {
      api.asc_setContentDarkMode(false)
    }
  }

  // Build skin object from CSS custom properties
  const colorsObj = getCurrentThemeColors()
  if (validateVars(colorsObj)) {
    colorsObj.type = themeRecord.type
    colorsObj.name = themeId
    api?.asc_setSkin(colorsObj)

    // Persist selected theme to localStorage
    const storedTheme = localStorage.getItem("ui-theme")
    let storedId: string | undefined
    if (storedTheme) {
      const reid = /id":\s?"([\w-]+)/.exec(storedTheme)
      if (reid?.[1]) {
        storedId = reid[1]
      }
    }

    if (storedId !== id) {
      const themeObj: StoredTheme = {
        id,
        colors: colorsObj,
        text: themeRecord.text,
        type: themeRecord.type,
      }
      if (themeRecord.icons) {
        themeObj.icons = themeRecord.icons
      }
      localStorage.setItem("ui-theme", JSON.stringify(themeObj))
    }
  }

  themeProps = {}
}

/** Refreshes the theme when localStorage changes or system preference changes */
function refreshTheme(force?: boolean, caller?: string): void {
  const ut = uitheme()
  if (force || localStorage.getItem("ui-theme-id") !== ut.id) {
    let themeId = localStorage.getItem("ui-theme-id")

    if (themeId && force) {
      themeId = "theme-system"
    }

    if (themeId) {
      applyTheme(themeId)
      notificationCenter.emit("uitheme:changed", themeId, caller)
    }
  }
}

/** Handles system dark-mode preference changes */
function onSystemThemeDark(): void {
  if (uitheme().is_theme_system()) {
    refreshTheme(true)
  }
}

/** Handles document:ready — loads theme config */
export function onDocumentReady(): void {
  // In the original code this loads themes.json from the server.
  // The TypeScript rewrite relies on static themes + addTheme() for custom ones.
  // Desktop apps may inject themes via addTheme() before document:ready fires.
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initializes the Themes controller.
 *
 * Call this once after the editor API is available.
 * Sets up event listeners, applies the current theme, and configures the skin.
 *
 * @param editorApi - The editor API object (requires `asc_setSkin` and `asc_setContentDarkMode`)
 */
export function init(editorApi: {
  asc_setSkin: (obj: Record<string, unknown>) => void
  asc_setContentDarkMode: (dark: boolean) => void
}): void {
  api = editorApi

  // Remove legacy header CSS custom properties
  for (const header of [
    "toolbar-header-document",
    "toolbar-header-spreadsheet",
    "toolbar-header-presentation",
    "toolbar-header-pdf",
    "toolbar-header-visio",
  ]) {
    document.documentElement.style.removeProperty(`--${header}`)
  }

  const ut = uitheme()
  const themeId = ut.relevant_theme_id()

  // If the window-declared type doesn't match the theme map, re-apply
  if (ut.type && themesMap[themeId] && ut.type !== themesMap[themeId].type) {
    applyTheme(ut.id)
  }

  // Build and send initial skin
  const skinObj = getCurrentThemeColors(themeColorTokens) as Record<string, unknown>
  skinObj.type = ut.type ?? (themesMap[themeId] ? themesMap[themeId].type : THEME_TYPE_LIGHT)
  skinObj.name = themeId
  api.asc_setSkin(skinObj)

  // Set initial content dark mode
  const isContentDark = themesMap[themeId]?.type === "dark" && ut.iscontentdark
  if (api.asc_setContentDarkMode) {
    api.asc_setContentDarkMode(isContentDark)
  }

  // Ensure body has the correct theme-type class
  if (!document.body.classList.contains(`theme-type-${skinObj.type}`)) {
    document.body.classList.add(`theme-type-${skinObj.type}`)
  }

  // Register unknown themes from window.uitheme
  if (!themesMap[themeId] && ut.id === themeId) {
    themesMap[themeId] = {
      text: ut.id,
      type: ut.type ?? THEME_TYPE_LIGHT,
      source: "static",
    }
  }

  // Apply icon styles for the current theme
  const compStyle = getComputedStyle(document.body)
  if (themesMap[themeId]?.icons) {
    if (!document.querySelector(`style#${themeId}`) && ut.embedicons !== true) {
      const iconsBaseUrl = themesMap[themeId].icons.basepath
        ? themesMap[themeId].icons.basepath
        : compStyle.getPropertyValue("--sprite-button-icons-base-url")

      if (iconsBaseUrl) {
        ut.apply_icons_from_url(themeId, iconsBaseUrl)
      }
    }
    if (themesMap[themeId].icons.cls) {
      document.body.classList.add(`theme-icons-cls-${themesMap[themeId].icons.cls}`)
    }
  }

  // Listen for system dark-mode changes (non-desktop only)
  if (!desktop.isActive()) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onSystemThemeDark)
  }

  // Listen for localStorage changes (multi-tab sync)
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === "ui-theme-id" && !desktop.isActive()) {
      if (e.newValue) {
        refreshTheme()
      }
    } else if (e.key === "content-theme") {
      setContentTheme((e.newValue as "dark" | "light") ?? "light", true, false)
    }
  })

  notificationCenter.on("document:ready", onDocumentReady)
}

/**
 * Checks if the theme switcher is available.
 * @returns True if themes can be changed
 */
export function available(): boolean {
  return !locked
}

/**
 * Locks or unlocks the theme switcher.
 * @param value True to make themes available, false to lock
 */
export function setAvailable(value: boolean): void {
  locked = !value
}

/**
 * Returns the full themes map (static + custom themes).
 * Removes "theme-system" on desktop when system theme is unsupported.
 * @returns A copy of the themes map
 */
export function map(): Record<string, ThemeRecord> {
  // Desktop without system theme support should hide the system option
  if (
    desktop.isActive() &&
    !(desktop as unknown as { systemThemeSupported?: () => boolean }).systemThemeSupported?.()
  ) {
    const { "theme-system": _, ...rest } = themesMap
    return rest
  }
  return { ...themesMap }
}

/**
 * Gets a theme record by ID.
 * @param id The theme ID
 * @returns The theme record or undefined
 */
export function get(id: string): ThemeRecord | undefined {
  return themesMap[id]
}

/**
 * Gets the current active theme ID.
 * Falls back to the default light theme if the current theme is unknown.
 * @returns The current theme ID string
 */
export function currentThemeId(): string {
  const ut = uitheme()
  return themesMap[ut.id] ? ut.id : ut.DEFAULT_LIGHT_THEME_ID
}

/**
 * Reads a single CSS custom-property value from the body.
 * @param token The CSS variable name (with or without leading `--`)
 * @returns The computed value
 */
export function currentThemeColor(token: string): string {
  return getComputedStyle(document.body).getPropertyValue(token)
}

/**
 * Gets the default theme ID for a given type.
 * @param type The theme type ("dark" or "light")
 * @returns The default theme ID
 */
export function defaultThemeId(_type: ThemeType): string {
  return uitheme().DEFAULT_LIGHT_THEME_ID
}

/**
 * Gets the default theme record for a given type.
 * @param type The theme type ("dark" or "light")
 * @returns The default theme record
 */
export function defaultTheme(type: ThemeType): ThemeRecord | undefined {
  return themesMap[defaultThemeId(type)]
}

/**
 * Checks if a given theme (or the current theme) is dark.
 * System themes resolve to the current system preference.
 * @param id Optional theme ID (defaults to current theme)
 * @returns True if the effective theme type is dark
 */
export function isDarkTheme(id?: string): boolean {
  const resolvedId = id ?? currentThemeId()
  const effectiveType = isThemeTypeSystem(resolvedId)
    ? getSystemDefaultTheme().info.type
    : themesMap[resolvedId]?.type
  return effectiveType === THEME_TYPE_DARK
}

/**
 * Checks if content dark mode is enabled.
 * @returns True if content dark mode is on
 */
export function isContentThemeDark(): boolean {
  return uitheme().iscontentdark
}

/**
 * Sets the content dark mode.
 * @param mode "dark" or "light"
 * @param force Force the change even if the value is the same
 * @param keep If false, skip persisting to localStorage
 */
export function setContentTheme(mode: "dark" | "light", force?: boolean, keep?: boolean): void {
  const setDark = mode === "dark"
  if (setDark !== uitheme().iscontentdark || force) {
    uitheme().iscontentdark = setDark

    if (isDarkTheme()) {
      api?.asc_setContentDarkMode(setDark)
    }

    if (keep !== false && localStorage.getItem("content-theme") !== mode) {
      localStorage.setItem("content-theme", mode)
    }

    notificationCenter.emit("contenttheme:dark", setDark)
  }
}

/**
 * Toggles content dark mode and persists the change.
 */
export function toggleContentTheme(): void {
  const ut = uitheme()
  ut.iscontentdark = !ut.iscontentdark
  localStorage.setItem("content-theme", ut.iscontentdark ? "dark" : "light")

  if (isDarkTheme()) {
    api?.asc_setContentDarkMode(ut.iscontentdark)
  }

  notificationCenter.emit("contenttheme:dark", ut.iscontentdark)
}

/**
 * Switches to a different UI theme.
 * @param obj Theme ID string, JSON string, or stored theme object
 * @param caller Optional caller identifier for cross-controller coordination
 */
export function setTheme(obj: unknown, caller?: string): void {
  if (!obj) return

  const id = getUiThemeName(obj)
  if (!id || !themesMap[id]) return

  if (id !== uitheme().id) {
    applyTheme(id)
    localStorage.setItem("ui-theme-id", id)
    notificationCenter.emit("uitheme:changed", id, caller)
  }
}

/**
 * Refreshes the theme from localStorage (e.g., after a multi-tab change).
 * @param force If true, force-refresh to "theme-system"
 * @param caller Optional caller identifier
 */
export function refreshCurrentTheme(force?: boolean, caller?: string): void {
  refreshTheme(force, caller)
}

/**
 * Adds one or more custom themes from a config object.
 * @param obj A single theme source or an object with a `themes` array
 */
export function addTheme(obj: { themes?: ThemeSource[] } & ThemeSource): void {
  parseThemesObject(obj)
}

/**
 * Collects all current theme color tokens and their computed values.
 * @returns An object with `type`, `name`, and all color token values
 */
export function getThemeColors(): Record<string, string> & { type: ThemeType; name: string } {
  const ut = uitheme()
  const themeId = ut.relevant_theme_id()
  const obj = getCurrentThemeColors() as Record<string, string> & { type: ThemeType; name: string }
  obj.type = themesMap[themeId]?.type ?? "light"
  obj.name = themeId
  return obj
}

/**
 * Gets a cached theme property.
 * @param prop Property name: "font", "tab-style", or "small-btn-size"
 * @returns The property value
 */
export function getThemeProps(
  prop: "font" | "tab-style" | "small-btn-size",
): FontThemeProps | string | undefined {
  if (prop === "font") {
    if (!themeProps[prop]) {
      themeProps[prop] = {
        size:
          document.documentElement.style.getPropertyValue("--font-size-base-app-custom") ||
          window.getComputedStyle(document.body).getPropertyValue("--font-size-base") ||
          "11px",
        name:
          document.documentElement.style.getPropertyValue("--font-family-base-custom") ||
          'Arial, Helvetica, "Helvetica Neue", sans-serif',
      }
    }
    return themeProps[prop] as FontThemeProps
  }
  if (prop === "tab-style") {
    return (
      window.getComputedStyle(document.body).getPropertyValue("--toolbar-preferred-tab-style") ||
      "line"
    )
  }
  if (prop === "small-btn-size") {
    if (!themeProps[prop]) {
      themeProps[prop] =
        window.getComputedStyle(document.body).getPropertyValue("--x-small-btn-size") || "20px"
    }
    return themeProps[prop] as string
  }
  return themeProps[prop] as string | undefined
}

/**
 * Theme-changed event type.
 */
export type ThemeChangedEvent = ControllerEvents["uitheme:changed"]

/**
 * Content-theme-dark event type.
 */
export type ContentThemeDarkEvent = ControllerEvents["contenttheme:dark"]

/**
 * Theme-count-changed event type.
 */
export type ThemeCountChangedEvent = ControllerEvents["uitheme:countchanged"]
