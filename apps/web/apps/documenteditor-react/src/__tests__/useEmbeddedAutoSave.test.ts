// @vitest-environment jsdom
/**
 * useEmbeddedAutoSave — embedded WOPI auto-save debounce hook.
 *
 * The hook no longer talks to putFile directly: a parallel PUT here raced the
 * store's own save (412/502, historically file truncation). It now debounces
 * and delegates to ONE guarded save function (the store's saveToWopi).
 *
 * Pins:
 *  - an isModified flip schedules exactly one debounced save() (default 3000ms)
 *  - rapid consecutive flips coalesce into a single save()
 *  - embedded=false / wopiConnection=null disable saving entirely
 *  - save() receives no arguments and is awaited before notifying
 *  - a save() rejection surfaces notifyError("AUTOSAVE_FAILED", msg) and does
 *    NOT report the document as saved
 *  - forceSave cancels the pending debounce and saves immediately
 */
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { WopiConnection } from "@world-office/wopi-client"

import { useEmbeddedAutoSave } from "../hooks/useEmbeddedAutoSave"

const DEFAULT_DEBOUNCE_MS = 3000

function makeConnection(): WopiConnection {
  return {
    wopiFileId: "file-1",
    wopiAccessToken: "token-1",
    docserverBase: "https://wopi.test",
  }
}

// ────────────────────────────────────────────────────────────────────────
// Minimal hook harness: no @testing-library — a probe component renders the
// hook and stashes its return value + callbacks into a mutable object.
// ────────────────────────────────────────────────────────────────────────

type SaveFn = () => Promise<void>
type VersionSink = (version: string) => void
type ErrorSink = (code: string, message: string) => void

interface HarnessProps {
  embedded: boolean
  wopiConnection: WopiConnection | null
  isModified: boolean
  debounceMs?: number
}

interface Harness {
  captures: {
    forceSave: (() => Promise<void>) | null
    save: ReturnType<typeof vi.fn>
    notifyDocumentSaved: VersionSink
    notifyError: ErrorSink
  }
  rerender: (props: HarnessProps) => void
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []

function mountHook(props: HarnessProps): Harness {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)

  const save = vi.fn(async () => {})

  const captures = {
    forceSave: null as (() => Promise<void>) | null,
    save,
    notifyDocumentSaved: vi.fn(),
    notifyError: vi.fn(),
  }

  function Probe(p: HarnessProps) {
    const { forceSave } = useEmbeddedAutoSave(
      p.embedded,
      p.wopiConnection,
      p.isModified,
      captures.save,
      captures.notifyDocumentSaved,
      captures.notifyError,
      // Omit debounceMs to exercise the hook's 3000ms default.
      p.debounceMs ?? DEFAULT_DEBOUNCE_MS,
    )
    captures.forceSave = forceSave
    return null
  }

  const render = () => {
    act(() => {
      root.render(createElement(Probe, props))
    })
  }
  render()

  mounted.push({ root, container })

  return {
    captures,
    rerender: (next: HarnessProps) => {
      act(() => {
        root.render(createElement(Probe, next))
      })
    },
  }
}

// ────────────────────────────────────────────────────────────────────────

describe("useEmbeddedAutoSave", () => {
  beforeEach(() => {
    // React needs this flag for act() to run without warnings under vitest.
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    for (const m of mounted.splice(0)) {
      act(() => {
        m.root.unmount()
      })
      document.body.removeChild(m.container)
    }
    vi.useRealTimers()
  })

  describe("debounce scheduling", () => {
    it("an isModified flip schedules exactly one save after the default 3000ms", async () => {
      const conn = makeConnection()
      const h = mountHook({ embedded: true, wopiConnection: conn, isModified: false })

      // Nothing before the flip.
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(h.captures.save).not.toHaveBeenCalled()

      // Flip modified; the save must not fire before the debounce elapses.
      h.rerender({ embedded: true, wopiConnection: conn, isModified: true })
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS - 1)
      })
      expect(h.captures.save).not.toHaveBeenCalled()

      // And exactly once when it does.
      await act(async () => {
        vi.advanceTimersByTime(1)
      })
      expect(h.captures.save).toHaveBeenCalledTimes(1)
      expect(h.captures.notifyDocumentSaved).toHaveBeenCalledTimes(1)
    })

    it("honors a custom debounceMs", async () => {
      const conn = makeConnection()
      const h = mountHook({
        embedded: true,
        wopiConnection: conn,
        isModified: true,
        debounceMs: 500,
      })
      await act(async () => {
        vi.advanceTimersByTime(499)
      })
      expect(h.captures.save).not.toHaveBeenCalled()
      await act(async () => {
        vi.advanceTimersByTime(1)
      })
      expect(h.captures.save).toHaveBeenCalledTimes(1)
    })

    it("rapid consecutive isModified flips coalesce into a single save", async () => {
      const conn = makeConnection()
      const h = mountHook({ embedded: true, wopiConnection: conn, isModified: false })

      // Flip true → false → true quickly inside one debounce window.
      h.rerender({ embedded: true, wopiConnection: conn, isModified: true })
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
      h.rerender({ embedded: true, wopiConnection: conn, isModified: false })
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
      h.rerender({ embedded: true, wopiConnection: conn, isModified: true })
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      // Each flip reset the timer, so the window has not expired yet.
      expect(h.captures.save).not.toHaveBeenCalled()

      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(h.captures.save).toHaveBeenCalledTimes(1)
      expect(h.captures.notifyDocumentSaved).toHaveBeenCalledTimes(1)
    })
  })

  describe("guard conditions", () => {
    it("never saves when embedded is false", async () => {
      const h = mountHook({
        embedded: false,
        wopiConnection: makeConnection(),
        isModified: true,
      })
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(h.captures.save).not.toHaveBeenCalled()
      expect(h.captures.notifyDocumentSaved).not.toHaveBeenCalled()
      expect(h.captures.notifyError).not.toHaveBeenCalled()
    })

    it("never saves when wopiConnection is null", async () => {
      const h = mountHook({ embedded: true, wopiConnection: null, isModified: true })
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(h.captures.save).not.toHaveBeenCalled()
      expect(h.captures.notifyDocumentSaved).not.toHaveBeenCalled()
    })
  })

  describe("failure path", () => {
    it("a save() rejection surfaces notifyError('AUTOSAVE_FAILED', msg) and does NOT report the save", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      const conn = makeConnection()
      const h = mountHook({ embedded: true, wopiConnection: conn, isModified: true })
      h.captures.save.mockRejectedValueOnce(new Error("boom"))

      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })

      expect(h.captures.notifyError).toHaveBeenCalledTimes(1)
      expect(h.captures.notifyError).toHaveBeenCalledWith("AUTOSAVE_FAILED", "boom")
      expect(h.captures.notifyDocumentSaved).not.toHaveBeenCalled()
      stderr.mockRestore()
    })
  })

  describe("forceSave", () => {
    it("cancels a pending debounce and saves immediately", async () => {
      const conn = makeConnection()
      const h = mountHook({ embedded: true, wopiConnection: conn, isModified: true })

      // Debounce is still pending.
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS - 500)
      })
      expect(h.captures.save).not.toHaveBeenCalled()

      // forceSave bypasses the remaining debounce time.
      await act(async () => {
        await h.captures.forceSave?.()
      })
      expect(h.captures.save).toHaveBeenCalledTimes(1)
      expect(h.captures.notifyDocumentSaved).toHaveBeenCalledTimes(1)

      // The originally scheduled timer was cancelled — no second save.
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(h.captures.save).toHaveBeenCalledTimes(1)
    })

    it("is a no-op when embedded is false", async () => {
      const h = mountHook({ embedded: false, wopiConnection: makeConnection(), isModified: true })
      await act(async () => {
        await h.captures.forceSave?.()
      })
      expect(h.captures.save).not.toHaveBeenCalled()
    })
  })
})
