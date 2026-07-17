// @world-office/i18n — i18next configuration for World Office editors

import i18n from "i18next"

export interface I18nConfig {
  /** Current language code (e.g. "en", "de") */
  lng?: string
  /** Fallback language when translation is missing */
  fallbackLng?: string
  /** Base URL path for loading locale JSON files */
  localePath?: string
  /** Pre-loaded translations (avoids fetch). Shape: { lng: { namespace: { key: value } } } */
  resources?: Record<string, Record<string, Record<string, string>>>
  /** Whether to enable debug logging */
  debug?: boolean
}

/**
 * Create and initialize an i18next instance for an editor.
 *
 * The locale JSON files use flat dot-namespace keys matching the
 * existing Backbone translation format, e.g.:
 * ```json
 * { "Toolbar.textBold": "Bold", "FileMenu.textSave": "Save" }
 * ```
 *
 * @example
 * ```ts
 * import { createI18n } from "@world-office/i18n"
 *
 * const i18n = createI18n({
 *   lng: "en",
 *   localePath: "./locale",
 * })
 *
 * // In React components:
 * // import { useTranslation } from "react-i18next"
 * // const { t } = useTranslation()
 * // t("Toolbar.textBold") // => "Bold"
 * ```
 */
export function createI18n(config: I18nConfig = {}): typeof i18n {
  const { lng = "en", fallbackLng = "en", localePath, resources, debug = false } = config

  // If pre-loaded resources provided, use them directly
  if (resources) {
    i18n.init({
      lng,
      fallbackLng,
      debug,
      resources,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
  } else if (localePath) {
    // Dynamic loading via fetch — compatible with existing locale JSON files
    i18n.init({
      lng,
      fallbackLng,
      debug,
      backend: {
        loadPath: `${localePath}/{{lng}}.json`,
      },
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
  } else {
    // Minimal initialization without any backend
    i18n.init({
      lng,
      fallbackLng,
      debug,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
  }

  return i18n
}

/**
 * Supported locale codes extracted from existing translation files.
 * Each editor app has locale files for all these languages.
 */
export const SUPPORTED_LOCALES = [
  "ar",
  "ca",
  "cs",
  "de",
  "el",
  "en",
  "es",
  "fr",
  "he",
  "hu",
  "hy",
  "id",
  "it",
  "ja",
  "ko",
  "nl",
  "pl",
  "pt",
  "pt-pt",
  "ro",
  "ru",
  "si",
  "sq",
  "sr",
  "sr-cyrl",
  "sv",
  "tr",
  "uk",
  "ur",
  "vi",
  "zh",
  "zh-tw",
] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/**
 * Get a display label for a locale code.
 */
export function getLocaleLabel(locale: string): string {
  const labels: Record<string, string> = {
    ar: "العربية",
    ca: "Català",
    cs: "Čeština",
    de: "Deutsch",
    el: "Ελληνικά",
    en: "English",
    es: "Español",
    fr: "Français",
    he: "עברית",
    hu: "Magyar",
    hy: "Հայերեն",
    id: "Bahasa Indonesia",
    it: "Italiano",
    ja: "日本語",
    ko: "한국어",
    nl: "Nederlands",
    pl: "Polski",
    pt: "Português (Brasil)",
    "pt-pt": "Português (Portugal)",
    ro: "Română",
    ru: "Русский",
    si: "සිංහල",
    sq: "Shqip",
    sr: "Српски",
    "sr-cyrl": "Српски (ћирилица)",
    sv: "Svenska",
    tr: "Türkçe",
    uk: "Українська",
    ur: "اردو",
    vi: "Tiếng Việt",
    zh: "中文 (简体)",
    "zh-tw": "中文 (繁體)",
  }
  return labels[locale] ?? locale
}
