// @vitest-environment jsdom
// Pins the WOPI-vs-chrome semantics of useEmbeddedMode:
// a plain WOPI session (OpenCloud web iframe) is an embedded editing session
// (autosave/Ctrl+S armed) but must KEEP the editor chrome — the host renders
// no toolbar of its own. Chrome is hidden only on explicit opt-in.
import { afterEach, describe, expect, it, vi } from "vitest"

type Hook = typeof import("../hooks/useEmbeddedMode")

async function importWithSearch(search: string, config?: { embedded?: boolean }): Promise<Hook> {
  vi.resetModules()
  const fakeWindow = {
    location: { search },
    __WORLD_OFFICE_CONFIG__: config,
  } as unknown as Window & typeof globalThis
  vi.stubGlobal("window", fakeWindow)
  return import("../hooks/useEmbeddedMode")
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("useEmbeddedMode truth table", () => {
  it("plain WOPI session: embedded (autosave armed), chrome visible", async () => {
    const m = await importWithSearch("?WOPISrc=http%3A%2F%2Fx&access_token=tok&file_id=f1")
    expect(m.isEmbeddedMode()).toBe(true)
    expect(m.explicitlyEmbedded()).toBe(false)
  })

  it("explicit embedded=true: chrome hidden", async () => {
    const m = await importWithSearch("?embedded=true")
    expect(m.isEmbeddedMode()).toBe(true)
    expect(m.explicitlyEmbedded()).toBe(true)
  })

  it("explicit embedded=true wins even without WOPI params", async () => {
    const m = await importWithSearch("?embedded=true&access_token=tok&file_id=f1")
    expect(m.explicitlyEmbedded()).toBe(true)
  })

  it("config embedded=true: chrome hidden", async () => {
    const m = await importWithSearch("", { embedded: true })
    expect(m.isEmbeddedMode()).toBe(true)
    expect(m.explicitlyEmbedded()).toBe(true)
  })

  it("no params: plain standalone session", async () => {
    const m = await importWithSearch("")
    expect(m.isEmbeddedMode()).toBe(false)
    expect(m.explicitlyEmbedded()).toBe(false)
  })
})
