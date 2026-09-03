import { act } from "react"
import React from "react"
import { createRoot } from "react-dom/client"
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useSpellchecker } from "../hooks/useSpellchecker"

/**
 * The WASM spell engine (`wo-renderer-wasm/pkg/wo_renderer_wasm`) is a
 * wasm-pack artifact that does not exist in fresh worktrees. `loadWasm()`
 * in useSpellchecker.ts dynamic-imports it, so we replace the whole module
 * with a mock. The mocks are hoisted so assertions can inspect call records
 * directly (no fragile dynamic imports in tests).
 */
const wasmMocks = vi.hoisted(() => ({
  default: vi.fn(), // wasm-bindgen loader
  init: vi.fn(),
  spell_load_dictionary: vi.fn(),
  spell_check_word: vi.fn(() => true),
  spell_suggest: vi.fn(() => "[]"),
  spell_check_text: vi.fn(() => "[]"),
  spell_add_to_user_dict: vi.fn(),
  spell_load_hyphenation: vi.fn(),
  spell_hyphenate: vi.fn(() => "[]"),
  spell_release: vi.fn(),
}))

vi.mock("../../../../../..//core/crates/wo-renderer-wasm/pkg/wo_renderer_wasm", () => wasmMocks)

/** Global fetch stub — the hook fetches dictionary files through `fetch`. */
const mockFetch = vi.fn<typeof fetch>()

/** Minimal hook harness: createRoot + act, captures the latest return value. */
function setupHookHarness() {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)

  let hookResult: ReturnType<typeof useSpellchecker> | null = null
  const Probe = () => {
    hookResult = useSpellchecker()
    return null
  }

  return {
    // (Re)render and return the freshest hook result.
    render: () => {
      act(() => {
        root.render(React.createElement(Probe))
      })
      return hookResult
    },
    unmount: () => {
      act(() => {
        root.unmount()
      })
      document.body.removeChild(container)
    },
  }
}

/** A fetch Response-lookalike with an async arrayBuffer of a few bytes. */
function okResponse(): { arrayBuffer: () => Promise<ArrayBuffer> } {
  return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
}

/** Signal a successful dictionary load for the given (already-started) fetches. */
function resolvePendingFetches(pending: Array<(value: unknown) => void>): void {
  for (const resolve of pending.splice(0)) {
    resolve(okResponse())
  }
}

describe("useSpellchecker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Every dictionary fetch succeeds by default (tests that need the
    // failure path override this per test).
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(okResponse() as never)
    vi.stubGlobal("fetch", mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    mockFetch.mockReset()
  })

  // ── Initial state ──────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts with language en-US", () => {
      const { render, unmount } = setupHookHarness()
      const state = render()
      expect(state.language).toBe("en-US")
      unmount()
    })

    it("starts with the spellchecker enabled", () => {
      const { render, unmount } = setupHookHarness()
      const state = render()
      expect(state.enabled).toBe(true)
      unmount()
    })

    it("exposes no spellchecker until the dictionary has loaded", () => {
      const { render, unmount } = setupHookHarness()
      const state = render()
      // Load is async (effect), so the very first render has no checker.
      expect(state.spellchecker).toBeNull()
      unmount()
    })

    it("exposes the bundled availableLanguages", () => {
      const { render, unmount } = setupHookHarness()
      const state = render()
      expect(state.availableLanguages).toEqual(["en-US", "de-DE"])
      unmount()
    })

    it("exposes switchLanguage, toggleEnabled and addToDictionary callbacks", () => {
      const { render, unmount } = setupHookHarness()
      const state = render()
      expect(typeof state.switchLanguage).toBe("function")
      expect(typeof state.toggleEnabled).toBe("function")
      expect(typeof state.addToDictionary).toBe("function")
      unmount()
    })
  })

  // ── Dictionary loading (initial and per-language) ──────────────────────

  describe("dictionary loading", () => {
    it("loads the en-US dictionary (aff, dic, hyphenation) on mount", async () => {
      const { render, unmount } = setupHookHarness()
      render()
      await vi.waitFor(() => expect(wasmMocks.spell_load_dictionary).toHaveBeenCalled())

      expect(wasmMocks.spell_load_dictionary).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.any(Uint8Array),
        "en-US",
      )
      // en-US ships hyphenation patterns, so they are loaded too.
      expect(wasmMocks.spell_load_hyphenation).toHaveBeenCalledWith(expect.any(Uint8Array), "en-US")
      // Dictionary bytes are fetched by URL.
      const fetchedUrls = mockFetch.mock.calls.map((c) => String(c[0]))
      expect(fetchedUrls).toContain("/dictionaries/en-US.aff")
      expect(fetchedUrls).toContain("/dictionaries/en-US.dic")
      expect(fetchedUrls).toContain("/dictionaries/en-US/hyph_en_US.dic")
      unmount()
    })

    it("sets loading true while a dictionary loads and false when done", async () => {
      const pendingFetches: Array<(value: unknown) => void> = []
      mockFetch.mockImplementation(
        () => new Promise((resolve) => pendingFetches.push(resolve as never)),
      )

      const { render, unmount } = setupHookHarness()
      render()
      // The mount effect kicked off, fetch is in flight → loading.
      await vi.waitFor(() => expect(pendingFetches.length).toBeGreaterThan(0))
      expect(render().loading).toBe(true)

      // Let the en-US load finish. Fetches cascade (aff, dic, then hyph),
      // so keep resolving whatever is pending until loading settles.
      await vi.waitFor(() => {
        resolvePendingFetches(pendingFetches)
        expect(render().loading).toBe(false)
      })

      // Switching language starts a fresh load → loading true again.
      act(() => render().switchLanguage("de-DE"))
      await vi.waitFor(() => expect(pendingFetches.length).toBeGreaterThan(0))
      expect(render().loading).toBe(true)

      await vi.waitFor(() => {
        resolvePendingFetches(pendingFetches)
        expect(render().loading).toBe(false)
      })
      unmount()
    })

    it("releases the old dictionary before loading a new one", async () => {
      const pendingFetches: Array<(value: unknown) => void> = []
      mockFetch.mockImplementation(
        () => new Promise((resolve) => pendingFetches.push(resolve as never)),
      )

      const { render, unmount } = setupHookHarness()
      render()
      // Let the initial en-US load complete.
      await vi.waitFor(() => {
        resolvePendingFetches(pendingFetches)
        expect(wasmMocks.spell_load_dictionary).toHaveBeenCalled()
      })

      // Switching to de-DE triggers its own load, which releases de-DE
      // before re-loading its dictionary.
      act(() => render().switchLanguage("de-DE"))
      await vi.waitFor(() => {
        resolvePendingFetches(pendingFetches)
        expect(wasmMocks.spell_release).toHaveBeenCalledWith("de-DE")
      })
      unmount()
    })

    it("does not reload when setLanguage is called with the current language", async () => {
      const { render, unmount } = setupHookHarness()
      render()
      await vi.waitFor(() => expect(wasmMocks.spell_load_dictionary).toHaveBeenCalled())

      const callsAfterInitialLoad = wasmMocks.spell_load_dictionary.mock.calls.length

      act(() => render().switchLanguage("en-US"))
      act(() => render().switchLanguage("en-US"))
      await new Promise((r) => setTimeout(r, 20))

      // Same-language switch is a no-op: no additional dictionary load.
      expect(wasmMocks.spell_load_dictionary.mock.calls.length).toBe(callsAfterInitialLoad)
      unmount()
    })

    it("sets language state when switching to a bundled language", async () => {
      const { render, unmount } = setupHookHarness()
      render()
      act(() => render().switchLanguage("de-DE"))
      expect(render().language).toBe("de-DE")
      unmount()
    })

    it("does not load a dictionary for an unbundled language", async () => {
      const { render, unmount } = setupHookHarness()
      render()
      await vi.waitFor(() => expect(wasmMocks.spell_load_dictionary).toHaveBeenCalled())

      const calls = wasmMocks.spell_load_dictionary.mock.calls.length
      const fetches = mockFetch.mock.calls.length

      act(() => render().switchLanguage("fr-FR"))
      await new Promise((r) => setTimeout(r, 20))

      // fr-FR has no bundle → no extra dictionary load and no extra fetches.
      expect(wasmMocks.spell_load_dictionary.mock.calls.length).toBe(calls)
      expect(mockFetch.mock.calls.length).toBe(fetches)
      expect(render().language).toBe("fr-FR")
      unmount()
    })
  })

  // ── Toggling enabled ───────────────────────────────────────────────────

  describe("toggling enabled", () => {
    it("flips enabled from true to false", async () => {
      const { render, unmount } = setupHookHarness()
      render()
      // Wait so the toggle happens on a settled snapshot.
      await vi.waitFor(() => expect(wasmMocks.spell_load_dictionary).toHaveBeenCalled())

      act(() => render().toggleEnabled())
      expect(render().enabled).toBe(false)
      unmount()
    })

    it("flips enabled from false back to true", async () => {
      const { render, unmount } = setupHookHarness()
      render()
      act(() => render().toggleEnabled())
      expect(render().enabled).toBe(false)
      act(() => render().toggleEnabled())
      expect(render().enabled).toBe(true)
      unmount()
    })

    it("tears down checking when disabled and restarts it when re-enabled", async () => {
      const { render, unmount } = setupHookHarness()
      render()
      await vi.waitFor(() => expect(wasmMocks.spell_load_dictionary).toHaveBeenCalled())

      // Enabled: checking consults the engine.
      wasmMocks.spell_check_word.mockReturnValue(false) // treat as misspelled
      let state = render()
      expect(state.spellchecker?.check("helo")).toBe(false)
      expect(wasmMocks.spell_check_word).toHaveBeenCalledWith("helo", "en-US")

      // Disable: after the reload the checker ignores words without the engine.
      wasmMocks.spell_check_word.mockClear()
      wasmMocks.spell_load_dictionary.mockClear()
      act(() => state.toggleEnabled())
      await vi.waitFor(() => expect(wasmMocks.spell_load_dictionary).toHaveBeenCalled())
      await vi.waitFor(() => expect(render().loading).toBe(false))

      state = render()
      expect(state.enabled).toBe(false)
      expect(state.spellchecker?.check("helo")).toBe(true)
      expect(wasmMocks.spell_check_word).not.toHaveBeenCalled()

      // Re-enable: engine consultation is restored.
      wasmMocks.spell_load_dictionary.mockClear()
      act(() => state.toggleEnabled())
      await vi.waitFor(() => expect(wasmMocks.spell_load_dictionary).toHaveBeenCalled())
      await vi.waitFor(() => expect(render().loading).toBe(false))

      state = render()
      expect(state.enabled).toBe(true)
      wasmMocks.spell_check_word.mockClear()
      expect(state.spellchecker?.check("helo")).toBe(false)
      expect(wasmMocks.spell_check_word).toHaveBeenCalledWith("helo", "en-US")
      unmount()
    })
  })

  // ── Failure handling ───────────────────────────────────────────────────

  describe("failure handling", () => {
    it("surfaces a failed dictionary load without crashing the hook", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
      mockFetch.mockReset()
      mockFetch.mockRejectedValue(new Error("network down") as never)

      const { render, unmount } = setupHookHarness()
      render()
      await vi.waitFor(() => expect(render().loading).toBe(false))

      // Hook stays alive with sane defaults; only the error was logged.
      const state = render()
      expect(state.language).toBe("en-US")
      expect(state.enabled).toBe(true)
      expect(state.spellchecker).toBeNull()
      expect(consoleError).toHaveBeenCalled()
      consoleError.mockRestore()
      unmount()
    })

    it("keeps spellchecking when hyphenation patterns fail to load", async () => {
      mockFetch.mockReset()
      mockFetch.mockImplementation(async (url: unknown) => {
        if (String(url).includes("hyph")) {
          throw new Error("hyph not found")
        }
        return okResponse() as never
      })

      const { render, unmount } = setupHookHarness()
      render()
      // aff + dic loaded (dictionary call succeeds) despite the hyph failure.
      await vi.waitFor(() => expect(wasmMocks.spell_load_dictionary).toHaveBeenCalled())
      await vi.waitFor(() => expect(render().loading).toBe(false))

      const state = render()
      expect(state.spellchecker).not.toBeNull()
      unmount()
    })
  })

  // ── Spellchecker method delegation ─────────────────────────────────────

  describe("spellchecker delegation", () => {
    const load = async () => {
      const { render, unmount } = setupHookHarness()
      render()
      await vi.waitFor(() => expect(wasmMocks.spell_load_dictionary).toHaveBeenCalled())
      await vi.waitFor(() => expect(render().loading).toBe(false))
      const state = render()
      if (!state.spellchecker) {
        throw new Error("expected the spellchecker to be loaded")
      }
      return { checker: state.spellchecker, render, unmount }
    }

    it("spellchecker.check delegates to spell_check_word", async () => {
      wasmMocks.spell_check_word.mockReturnValue(true)
      const { checker, unmount } = await load()
      expect(checker.check("hello")).toBe(true)
      expect(wasmMocks.spell_check_word).toHaveBeenCalledWith("hello", "en-US")
      unmount()
    })

    it("spellchecker.suggest parses the JSON from spell_suggest", async () => {
      wasmMocks.spell_suggest.mockReturnValue('["helo","hell"]')
      const { checker, unmount } = await load()
      expect(checker.suggest("helo")).toEqual(["helo", "hell"])
      expect(wasmMocks.spell_suggest).toHaveBeenCalledWith("helo", "en-US")
      unmount()
    })

    it("spellchecker.suggest returns [] when the engine returns invalid JSON", async () => {
      wasmMocks.spell_suggest.mockReturnValue("not json")
      const { checker, unmount } = await load()
      expect(checker.suggest("helo")).toEqual([])
      unmount()
    })

    it("spellchecker.checkText delegates to spell_check_text", async () => {
      wasmMocks.spell_check_text.mockReturnValue(
        JSON.stringify([{ word: "helo", offset: 0, suggestions: ["hello"] }]),
      )
      const { checker, unmount } = await load()
      const results = checker.checkText("helo world")
      expect(results).toHaveLength(1)
      expect(results[0].word).toBe("helo")
      expect(wasmMocks.spell_check_text).toHaveBeenCalledWith("helo world", "en-US")
      unmount()
    })

    it("spellchecker.addToDictionary delegates to spell_add_to_user_dict", async () => {
      const { checker, unmount } = await load()
      checker.addToDictionary("customword")
      expect(wasmMocks.spell_add_to_user_dict).toHaveBeenCalledWith("customword", "en-US")
      unmount()
    })

    it("the addToDictionary callback delegates to the loaded checker", async () => {
      const { unmount, render } = await load()
      render().addToDictionary("customword2")
      expect(wasmMocks.spell_add_to_user_dict).toHaveBeenCalledWith("customword2", "en-US")
      unmount()
    })

    it("addToDictionary is a no-op before any dictionary has loaded", () => {
      const { render, unmount } = setupHookHarness()
      render()
      // No checker yet, so no engine call and no throw.
      expect(() => render().addToDictionary("word")).not.toThrow()
      expect(wasmMocks.spell_add_to_user_dict).not.toHaveBeenCalled()
      unmount()
    })

    it("hyphenate delegates to spell_hyphenate", async () => {
      wasmMocks.spell_hyphenate.mockReturnValue("[2,8]")
      const { checker, unmount } = await load()
      expect(checker.hyphenate("dictionary")).toEqual([2, 8])
      expect(wasmMocks.spell_hyphenate).toHaveBeenCalledWith("dictionary", "en-US")
      unmount()
    })
  })
})
