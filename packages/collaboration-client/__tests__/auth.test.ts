import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthClient } from "../src/auth"

describe("AuthClient", () => {
  let auth: AuthClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    auth = new AuthClient({ baseUrl: "http://localhost:8005" })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("createSession", () => {
    it("should POST to /sessions and return tokens", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session_id: "sess-1",
          access_token: "access-tok",
          refresh_token: "refresh-tok",
          expires_in: 86400,
        }),
      })

      const result = await auth.createSession({ userId: "u1", username: "alice" })

      expect(fetchMock).toHaveBeenCalledWith("http://localhost:8005/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "u1", username: "alice" }),
      })
      expect(result.sessionId).toBe("sess-1")
      expect(result.accessToken).toBe("access-tok")
      expect(result.refreshToken).toBe("refresh-tok")
      expect(result.expiresIn).toBe(86400)
    })

    it("should throw on non-OK response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: "user_id and username are required", code: 400 }),
      })

      await expect(auth.createSession({ userId: "", username: "" })).rejects.toThrow(
        "Auth error 400: user_id and username are required",
      )
    })
  })

  describe("refreshToken", () => {
    it("should POST to /sessions/refresh and return new access token", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "new-access-tok",
          expires_in: 900,
        }),
      })

      const result = await auth.refreshToken("old-refresh-tok")

      expect(fetchMock).toHaveBeenCalledWith("http://localhost:8005/sessions/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: "old-refresh-tok" }),
      })
      expect(result.accessToken).toBe("new-access-tok")
      expect(result.expiresIn).toBe(900)
    })

    it("should throw on 401 (expired refresh token)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "Invalid or expired refresh token", code: 401 }),
      })

      await expect(auth.refreshToken("expired")).rejects.toThrow(
        "Auth error 401: Invalid or expired refresh token",
      )
    })
  })

  describe("token storage", () => {
    it("should store and retrieve the access token", () => {
      auth.setTokens({ accessToken: "tok-1", refreshToken: "ref-1" })
      expect(auth.getAccessToken()).toBe("tok-1")
      expect(auth.getRefreshToken()).toBe("ref-1")
    })

    it("should clear tokens", () => {
      auth.setTokens({ accessToken: "tok-1", refreshToken: "ref-1" })
      auth.clearTokens()
      expect(auth.getAccessToken()).toBeNull()
      expect(auth.getRefreshToken()).toBeNull()
    })

    it("should report hasToken correctly", () => {
      expect(auth.hasToken()).toBe(false)
      auth.setTokens({ accessToken: "tok", refreshToken: "ref" })
      expect(auth.hasToken()).toBe(true)
      auth.clearTokens()
      expect(auth.hasToken()).toBe(false)
    })
  })
})
