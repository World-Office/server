/**
 * Browser and platform detection utilities.
 * Modern browser detection only — IE detection removed.
 */

const userAgent = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : ""
const check = (regex: RegExp): boolean => regex.test(userAgent)

/**
 * Detect if running on macOS.
 */
export const isMac = check(/macintosh|mac os x/)

/**
 * Detect if running on Windows.
 */
export const isWindows = check(/windows|win32/)

/**
 * Detect if running on Linux.
 */
export const isLinux = check(/linux/)

/**
 * Detect if the page is served over HTTPS.
 */
export const isSecure =
  typeof window !== "undefined" ? /^https/i.test(window.location.protocol) : false

/**
 * Detect if running on a mobile device.
 */
export const isMobile =
  typeof navigator !== "undefined"
    ? /android|avantgo|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od|ad)|iris|kindle|lge |maemo|midp|mmp|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(
        navigator.userAgent || navigator.vendor || "",
      )
    : false

/**
 * Full user agent string (lowercase).
 */
export const userAgentString = userAgent

/**
 * Check if browser is Chrome (not Edge or Safari).
 */
export const isChrome = check(/\bchrome\b/)

/**
 * Check if browser is Safari (not Chrome).
 */
export const isSafari = !isChrome && check(/safari/)

/**
 * Check if browser is Firefox (Gecko-based).
 */
export const isGecko = !isChrome && check(/gecko/)
