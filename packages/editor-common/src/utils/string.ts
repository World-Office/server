/**
 * String utility functions — formatting, encoding, truncation, platform-specific text.
 */

import { isMac } from "./browser"

/**
 * Default modifier key labels for Windows/Linux.
 */
export const MODIFIER_KEYS = {
  ctrl: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  comma: ",",
} as const

/**
 * Platform-specific modifier key labels.
 */
export const PLATFORM_KEYS = {
  ctrl: isMac ? "⌘" : MODIFIER_KEYS.ctrl,
  shift: "⇧",
  alt: "⌥",
  comma: MODIFIER_KEYS.comma,
} as const

/**
 * String formatting similar to sprintf.
 * Supports {0}, {1}, etc. placeholders.
 *
 * @param format - String with {0}, {1}, etc. placeholders
 * @param args - Values to replace placeholders with (array or spread)
 * @returns Formatted string
 */
export function format(formatStr: string, ...args: (string | number)[]): string {
  const values: (string | number)[] = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
  return formatStr.replace(/\{(\d+)\}/g, (_match, index) => {
    return String(values[index] ?? "")
  })
}

/**
 * HTML-encode a string (escape special characters).
 *
 * @param str - String to encode
 * @returns HTML-encoded string
 */
export function htmlEncode(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * HTML-decode a string (unescape HTML entities).
 *
 * @param str - String to decode
 * @returns HTML-decoded string
 */
export function htmlDecode(str: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  }
  return str.replace(/&(amp|lt|gt|quot|#39|apos);/g, (match) => entities[match] ?? match)
}

/**
 * Truncate string with ellipsis if longer than specified length.
 *
 * @param value - String to truncate
 * @param len - Maximum length
 * @param word - If true, try to break at word boundary
 * @returns Truncated string with ellipsis if needed
 */
export function ellipsis(value: string, len: number, word = false): string {
  if (!value || value.length <= len) {
    return value
  }

  if (word) {
    const truncated = value.slice(0, len - 2)
    const separators = [" ", ".", "!", "?"]
    const lastSeparatorIndex = Math.max(...separators.map((sep) => truncated.lastIndexOf(sep)))

    if (lastSeparatorIndex !== -1 && lastSeparatorIndex >= len - 15) {
      return `${truncated.slice(0, lastSeparatorIndex)}...`
    }
  }

  return `${value.slice(0, len - 3)}...`
}

/**
 * Format keyboard shortcut for current platform.
 *
 * @param shortcut - Shortcut string (e.g., "Ctrl+C", "Cmd+V")
 * @param template - Template string (default: " ({0})")
 * @param hookFn - Optional function to modify shortcut before formatting
 * @returns Platform-specific shortcut string
 */
export function platformKey(
  shortcut: string,
  template = " ({0})",
  hookFn?: (shortcut: string) => string,
): string {
  const templateStr = template || " ({0})"
  let formattedShortcut = shortcut

  if (isMac) {
    if (hookFn) {
      formattedShortcut = hookFn(shortcut)
    }
    formattedShortcut = formattedShortcut
      .replace(/\+(?=\S)/g, "")
      .replace(/Ctrl|ctrl/g, "⌘")
      .replace(/Alt|alt/g, "⌥")
      .replace(/Shift|shift/g, "⇧")
  } else {
    formattedShortcut = formattedShortcut
      .replace(/Ctrl|ctrl/g, MODIFIER_KEYS.ctrl)
      .replace(/Alt|alt/g, MODIFIER_KEYS.alt)
      .replace(/Shift|shift/g, MODIFIER_KEYS.shift)
  }

  return format(templateStr, formattedShortcut)
}

/**
 * Parse float string with comma support (locale-aware).
 *
 * @param str - String to parse
 * @returns Parsed float number
 */
export function parseFloatSafe(str: string): number {
  const normalized = typeof str === "string" ? str.replace(",", ".") : str
  return Number.parseFloat(normalized)
}

/**
 * Encode Unicode character (handle surrogate pairs).
 *
 * @param unicode - Unicode code point
 * @returns Encoded character string
 */
export function encodeSurrogateChar(unicode: number): string {
  if (unicode < 0x10000) {
    return String.fromCharCode(unicode)
  }

  const adjustedUnicode = unicode - 0x10000
  const leadingChar = 0xd800 | (adjustedUnicode >> 10)
  const trailingChar = 0xdc00 | (adjustedUnicode & 0x3ff)
  return `${String.fromCharCode(leadingChar)}${String.fromCharCode(trailingChar)}`
}

/**
 * Pad number with leading zeros.
 *
 * @param num - Number to pad
 * @param digits - Target digit count
 * @param fill - Fill character (default: "0")
 * @returns Padded string
 */
export function fixedDigits(num: number, digits: number, fill = "0"): string {
  const str = num.toString()
  const padLength = Math.max(0, digits - str.length)
  return `${fill.repeat(padLength)}${str}`
}

/**
 * Escape string for use in regex.
 *
 * @param str - String to escape
 * @returns Regex-escaped string
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
