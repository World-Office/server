export interface DetectedWopiParams {
  wopiFileId: string
  wopiAccessToken: string
  docserverBase: string
}

/**
 * Extract WOPI parameters from the current URL or a custom window config.
 * Checks for URL query params: access_token, file_id
 * Falls back to window.__WORLD_OFFICE_CONFIG__.
 * Returns null if neither source has valid params.
 */
export function detectWopiParams(): DetectedWopiParams | null {
  const params = new URLSearchParams(window.location.search)
  const token = params.get("access_token") || params.get("WOPI_ACCESS_TOKEN")
  const fileId = params.get("file_id") || params.get("WOPI_FILE_ID")
  if (token && fileId) {
    return {
      wopiAccessToken: token,
      wopiFileId: fileId,
      docserverBase: `${window.location.protocol}//${window.location.host}`,
    }
  }

  // Check for config set by host page
  const cfg = (window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__ as
    | DetectedWopiParams
    | undefined
  if (cfg?.wopiFileId && cfg?.wopiAccessToken) {
    return {
      wopiFileId: cfg.wopiFileId,
      wopiAccessToken: cfg.wopiAccessToken,
      docserverBase: cfg.docserverBase || window.location.origin,
    }
  }

  return null
}

/**
 * Augment the window type for __WORLD_OFFICE_CONFIG__.
 */
declare global {
  interface Window {
    __WORLD_OFFICE_CONFIG__?: {
      wopiFileId?: string
      wopiAccessToken?: string
      docserverBase?: string
    }
  }
}
