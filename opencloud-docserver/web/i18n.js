/**
 * opencloud-docserver i18n — simple internationalization for the editor UI.
 *
 * Provides translation support for the editor interface using a simple
 * key-to-string mapping loaded from a JSON file.
 *
 * Usage:
 *   <script src="/static/i18n.js"></script>
 *   <script>
 *     // Initialize with default language
 *     const t = window.createI18n({ lng: "en" });
 *
 *     // Use translations
 *     document.getElementById("btn-save").textContent = t("Toolbar.Save");
 *     document.getElementById("status").textContent = t("Status.Ready");
 *   </script>
 */

"use strict";

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.createI18n = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /**
   * Supported language codes
   */
  const SUPPORTED_LOCALES = [
    "ar",
    "bg",
    "ca",
    "cs",
    "da",
    "de",
    "el",
    "en",
    "es",
    "et",
    "fi",
    "fr",
    "gl",
    "he",
    "hr",
    "hu",
    "hy",
    "id",
    "it",
    "ja",
    "ka",
    "kk",
    "ko",
    "lt",
    "lv",
    "mn",
    "ms",
    "nl",
    "pl",
    "pt",
    "pt-pt",
    "ro",
    "ru",
    "si",
    "sk",
    "sl",
    "sq",
    "sr",
    "sr-cyrl",
    "sv",
    "th",
    "tr",
    "uk",
    "ur",
    "vi",
    "zh",
    "zh-tw",
  ];

  /**
   * Default English translations for the editor UI.
   * These are the fallback translations when a key is missing.
   */
  const DEFAULT_TRANSLATIONS = {
    "Toolbar.Bold": "Bold",
    "Toolbar.Italic": "Italic",
    "Toolbar.Underline": "Underline",
    "Toolbar.Heading1": "Heading 1",
    "Toolbar.Heading2": "Heading 2",
    "Toolbar.Paragraph": "Paragraph",
    "Toolbar.BulletList": "Bullet list",
    "Toolbar.NumberedList": "Numbered list",
    "Toolbar.InsertTable": "Insert table",
    "Toolbar.Undo": "Undo",
    "Toolbar.Redo": "Redo",
    "Toolbar.Save": "Save",
    "Status.Ready": "Ready",
    "Status.Loading": "Loading…",
    "Status.Saving": "Saving…",
    "Status.Saved": "Saved ✓",
    "Status.Unsaved": "Unsaved changes…",
    "Status.LoadFailed": "Load failed: ",
    "Status.SaveFailed": "Save failed: ",
    "Status.EmptyDocument": "Empty document — start typing",
    "Status.ReadOnly": "Read-only — another user is editing this document",
    "Table.Columns": "Columns",
    "Table.Rows": "Rows",
  };

  /**
   * Create an i18n instance with the given configuration.
   *
   * @param {Object} config - Configuration object
   * @param {string} [config.lng="en"] - Language code (e.g., "en", "de", "fr")
   * @param {Object} [config.translations] - Custom translations to merge with defaults
   * @param {string} [config.localePath] - Base URL path for loading locale JSON files
   * @returns {Function} A translation function: t(key, defaultVal) => string
   */
  function createI18n(config = {}) {
    const { lng = "en", translations = {}, localePath } = config;

    // Validate language code
    const langCode = SUPPORTED_LOCALES.includes(lng) ? lng : "en";

    // Merge default and custom translations
    const resources = { [langCode]: { translation: { ...DEFAULT_TRANSLATIONS, ...translations } } };

    // Translation function
    function t(key, defaultVal) {
      if (resources[langCode] && resources[langCode].translation && resources[langCode].translation[key]) {
        return resources[langCode].translation[key];
      }
      return defaultVal !== undefined ? defaultVal : key;
    }

    // Expose configuration
    t.lng = langCode;
    t.resources = resources;
    t.supportedLocales = SUPPORTED_LOCALES;

    // Load translations from JSON file if localePath is provided
    if (localePath) {
      const loadTranslations = () => {
        fetch(`${localePath}/${langCode}.json`)
          .then((response) => {
            if (!response.ok) throw new Error(`Failed to load locale: ${response.statusText}`);
            return response.json();
          })
          .then((localeData) => {
            if (localeData && typeof localeData === "object") {
              resources[langCode].translation = { ...resources[langCode].translation, ...localeData };
            }
          })
          .catch((err) => {
            console.warn(`[i18n] Could not load locale from ${localePath}/${langCode}.json: ${err.message}`);
          });
      };

      // Load immediately and on language change
      loadTranslations();
      t.loadTranslations = loadTranslations;
    }

    return t;
  }

  // Make createI18n available globally for non-module environments
  return createI18n;
});