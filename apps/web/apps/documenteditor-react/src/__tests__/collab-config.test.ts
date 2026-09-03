// @vitest-environment jsdom
// Operator-written suite (WO-R7-COLLABCFG-1, gateway-starved 3×).
// Pins lib/collaboration-config.ts config derivation + truth table and
// the collaboration.ts singletons.
import { afterEach, describe, expect, it, vi } from "vitest"

async function importWithEnv(
  windowPatch: Record<string, unknown> | null,
  ws?: string,
  api?: string,
): Promise<typeof import("../lib/collaboration-config")> {
  vi.resetModules()
  vi.unstubAllEnvs()
  // Fresh window object so previous tests' overrides never leak.
  const newWindow = { ...(windowPatch ?? {}) } as unknown as Window & typeof globalThis
  vi.stubGlobal("window", newWindow)
  if (ws === undefined) vi.stubEnv("VITE_COAUTHORING_WS_URL", "")
  else vi.stubEnv("VITE_COAUTHORING_WS_URL", ws)
  if (api === undefined) vi.stubEnv("VITE_COAUTHORING_API_URL", "")
  else vi.stubEnv("VITE_COAUTHORING_API_URL", api)
  return await import("../lib/collaboration-config")
}

describe("collaboration-config", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("window.__COAUTHORING_* overrides win over env and defaults", async () => {
    const mod = await importWithEnv(
      {
        __COAUTHORING_WS_URL: "wss://real.example/ws",
        __COAUTHORING_API_URL: "https://real.example",
      },
      "",
      "",
    )
    expect(mod.COAUTHORING_WS_URL).toBe("wss://real.example/ws")
    expect(mod.COAUTHORING_API_URL).toBe("https://real.example")
  })

  it("env vars are used when no window override exists", async () => {
    const mod = await importWithEnv(null, "wss://env.example/ws", "https://env.example")
    expect(mod.COAUTHORING_WS_URL).toBe("wss://env.example/ws")
    expect(mod.COAUTHORING_API_URL).toBe("https://env.example")
  })

  it("falls back to localhost placeholders when nothing is configured", async () => {
    const mod = await importWithEnv(null, "", "")
    expect(mod.COAUTHORING_WS_URL).toBe("ws://localhost:8004/ws/{session_id}")
    expect(mod.COAUTHORING_API_URL).toBe("http://localhost:8004")
  })

  it("isCollaborationConfigured: window override counts as configured", async () => {
    const mod = await importWithEnv({ __COAUTHORING_WS_URL: "wss://real.example/ws" }, "", "")
    expect(mod.isCollaborationConfigured()).toBe(true)
  })

  it("isCollaborationConfigured: real env URLs count as configured", async () => {
    const mod = await importWithEnv(null, "wss://env.example/ws", "https://env.example")
    expect(mod.isCollaborationConfigured()).toBe(true)
  })

  it("isCollaborationConfigured: localhost placeholders on both = not configured", async () => {
    const mod = await importWithEnv(
      null,
      "ws://localhost:8004/ws/{session_id}",
      "http://localhost:8004",
    )
    expect(mod.isCollaborationConfigured()).toBe(false)
  })

  it("isCollaborationConfigured: empty env on both = not configured", async () => {
    const mod = await importWithEnv(null, "", "")
    expect(mod.isCollaborationConfigured()).toBe(false)
  })

  it("isCollaborationConfigured: one real endpoint is enough", async () => {
    const mod = await importWithEnv(null, "wss://env.example/ws", "")
    expect(mod.isCollaborationConfigured()).toBe(true)
  })

  it("collaboration.ts exposes singleton store, null-able send refs, and currentUser", async () => {
    vi.resetModules()
    const mod = await import("../lib/collaboration")
    expect(mod.collaborationStore).toBeDefined()
    expect(mod.collabSendRef.send).toBeNull()
    expect(mod.collabSendCommentRef.send).toBeNull()
    expect(mod.currentUser).toEqual({ id: "", username: "" })
    // The refs are mutable holders — assigning and clearing works.
    const fn = (_u: unknown) => undefined
    mod.collabSendRef.send = fn
    expect(mod.collabSendRef.send).toBe(fn)
    mod.collabSendRef.send = null
    expect(mod.collabSendRef.send).toBeNull()
  })
})
