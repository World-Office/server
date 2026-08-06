/**
 * WOPI parameter detection tests — tests detectWopiParams() with URL query
 * params and window config fallback.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { detectWopiParams } from "../src/detect-wopi-params"

describe("detectWopiParams", () => {
  let originalLocation: Location
  let originalConfig: unknown

  beforeEach(() => {
    originalLocation = window.location
    originalConfig = (window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__
  })

  afterEach(() => {
    // Restore config
    if (originalConfig === undefined) {
      delete (window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__
    } else {
      ;(window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__ = originalConfig
    }
  })

  function setUrl(search: string): void {
    // Mock window.location.search
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, search },
      writable: true,
    })
  }

  it("detects access_token and file_id from URL query params", () => {
    setUrl("?access_token=abc123&file_id=doc456")
    const result = detectWopiParams()
    expect(result).not.toBeNull()
    expect(result!.wopiAccessToken).toBe("abc123")
    expect(result!.wopiFileId).toBe("doc456")
    expect(result!.docserverBase).toContain("://")
  })

  it("detects WOPI_ACCESS_TOKEN and WOPI_FILE_ID from URL query params", () => {
    setUrl("?WOPI_ACCESS_TOKEN=token789&WOPI_FILE_ID=file012")
    const result = detectWopiParams()
    expect(result).not.toBeNull()
    expect(result!.wopiAccessToken).toBe("token789")
    expect(result!.wopiFileId).toBe("file012")
  })

  it("returns null when only access_token is present", () => {
    setUrl("?access_token=abc123")
    const result = detectWopiParams()
    expect(result).toBeNull()
  })

  it("returns null when only file_id is present", () => {
    setUrl("?file_id=doc456")
    const result = detectWopiParams()
    expect(result).toBeNull()
  })

  it("returns null when no params present", () => {
    setUrl("")
    delete (window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__
    const result = detectWopiParams()
    expect(result).toBeNull()
  })

  it("falls back to window.__WORLD_OFFICE_CONFIG__", () => {
    setUrl("")
    ;(window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__ = {
      wopiFileId: "cfg-file-id",
      wopiAccessToken: "cfg-token",
      docserverBase: "https://docserver.example.com",
    }
    const result = detectWopiParams()
    expect(result).not.toBeNull()
    expect(result!.wopiFileId).toBe("cfg-file-id")
    expect(result!.wopiAccessToken).toBe("cfg-token")
    expect(result!.docserverBase).toBe("https://docserver.example.com")
  })

  it("uses window.location.origin as docserverBase fallback from config", () => {
    setUrl("")
    ;(window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__ = {
      wopiFileId: "cfg-file-id",
      wopiAccessToken: "cfg-token",
      // No docserverBase
    }
    const result = detectWopiParams()
    expect(result).not.toBeNull()
    expect(result!.docserverBase).toContain("://")
  })

  it("returns null when config has no wopiFileId", () => {
    setUrl("")
    ;(window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__ = {
      wopiAccessToken: "token",
    }
    const result = detectWopiParams()
    expect(result).toBeNull()
  })

  it("returns null when config has no wopiAccessToken", () => {
    setUrl("")
    ;(window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__ = {
      wopiFileId: "file-id",
    }
    const result = detectWopiParams()
    expect(result).toBeNull()
  })

  it("URL params take precedence over config", () => {
    setUrl("?access_token=url-token&file_id=url-file")
    ;(window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__ = {
      wopiFileId: "cfg-file",
      wopiAccessToken: "cfg-token",
    }
    const result = detectWopiParams()
    expect(result).not.toBeNull()
    expect(result!.wopiAccessToken).toBe("url-token")
    expect(result!.wopiFileId).toBe("url-file")
  })

  it("handles empty string params", () => {
    setUrl("?access_token=&file_id=")
    const result = detectWopiParams()
    // Empty strings are falsy, so should fall through to config or null
    delete (window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__
    expect(result).toBeNull()
  })

  it("handles special characters in token", () => {
    setUrl("?access_token=abc%20def%2B&file_id=doc123")
    const result = detectWopiParams()
    expect(result).not.toBeNull()
    // URLSearchParams decodes %20 as space and %2B as +
    expect(result!.wopiAccessToken).toBe("abc def+")
  })
})
