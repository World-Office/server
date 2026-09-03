// @vitest-environment jsdom
/**
 * useEmbeddedAutoSave — embedded WOPI auto-save debounce hook.
 *
 * Pins the production typing-persistence chain:
 *  - an isModified flip schedules exactly one debounced putFile (default 3000ms)
 *  - rapid consecutive flips coalesce into a single save
 *  - embedded=false / wopiConnection=null disable saving entirely
 *  - putFile receives the exact blob produced by getDocumentBlob
 *  - onSaved fires after a successful save so the modified flag can reset and
 *    auto-save can fire again (without it, auto-save fires at most once/session)
 *  - a putFile rejection surfaces notifyError("AUTOSAVE_FAILED", msg) and does
 *    NOT report the document as saved
 *  - a second save while one is in flight is skipped (savingRef guard)
 *  - forceSave cancels the pending debounce and saves immediately
 */
import { act, createElement, useCallback, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { WopiConnection } from "@world-office/wopi-client"
import { putFile } from "@world-office/wopi-client"

import { useEmbeddedAutoSave } from "../hooks/useEmbeddedAutoSave"

// Mock the WOPI transport so no network is touched.
vi.mock("@world-office/wopi-client", () => ({
  putFile: vi.fn(),
}))

const mockedPutFile = vi.mocked(putFile)

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

type BlobSource = () => Promise<Blob>
type VersionSink = (version: string) => void
type ErrorSink = (code: string, message: string) => void
type SavedSink = () => void

interface HarnessProps {
  embedded: boolean
  wopiConnection: WopiConnection | null
  isModified: boolean
  debounceMs?: number
  getDocumentBlob?: BlobSource
  notifyDocumentSaved?: VersionSink
  notifyError?: ErrorSink
  onSaved?: SavedSink
}

interface Harness {
  captures: {
    forceSave: (() => Promise<void>) | null
    getDocumentBlob: BlobSource
    notifyDocumentSaved: VersionSink
    notifyError: ErrorSink
    onSaved: SavedSink
  }
  rerender: (props: HarnessProps) => void
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []

function mountHook(props: HarnessProps): Harness {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)

  const captures = {
    forceSave: null as (() => Promise<void>) | null,
    getDocumentBlob: props.getDocumentBlob ?? vi.fn(async () => new Blob()),
    notifyDocumentSaved: props.notifyDocumentSaved ?? vi.fn(),
    notifyError: props.notifyError ?? vi.fn(),
    onSaved: props.onSaved ?? vi.fn(),
  }

  function Probe(p: HarnessProps) {
    const { forceSave } = useEmbeddedAutoSave(
      p.embedded,
      p.wopiConnection,
      p.isModified,
      captures.getDocumentBlob,
      captures.notifyDocumentSaved,
      captures.notifyError,
      // Omit debounceMs to exercise the hook's 3000ms default.
      p.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      captures.onSaved,
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
    // Default transport behavior: every putFile succeeds.
    mockedPutFile.mockResolvedValue(undefined)
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
      expect(mockedPutFile).not.toHaveBeenCalled()

      // Flip modified; the save must not fire before the debounce elapses.
      h.rerender({ embedded: true, wopiConnection: conn, isModified: true })
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS - 1)
      })
      expect(mockedPutFile).not.toHaveBeenCalled()

      // And exactly once when it does.
      await act(async () => {
        vi.advanceTimersByTime(1)
      })
      expect(mockedPutFile).toHaveBeenCalledTimes(1)
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
      expect(mockedPutFile).not.toHaveBeenCalled()
      await act(async () => {
        vi.advanceTimersByTime(1)
      })
      expect(mockedPutFile).toHaveBeenCalledTimes(1)
    })

    it("rapid consecutive isModified flips coalesce into a single putFile", async () => {
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
      expect(mockedPutFile).not.toHaveBeenCalled()

      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(mockedPutFile).toHaveBeenCalledTimes(1)
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
      expect(mockedPutFile).not.toHaveBeenCalled()
      expect(h.captures.getDocumentBlob).not.toHaveBeenCalled()
      expect(h.captures.notifyDocumentSaved).not.toHaveBeenCalled()
      expect(h.captures.onSaved).not.toHaveBeenCalled()
    })

    it("never saves when wopiConnection is null", async () => {
      const h = mountHook({ embedded: true, wopiConnection: null, isModified: true })
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(mockedPutFile).not.toHaveBeenCalled()
      expect(h.captures.getDocumentBlob).not.toHaveBeenCalled()
      expect(h.captures.notifyDocumentSaved).not.toHaveBeenCalled()
    })

    it("skips a second save while one is already in flight (savingRef guard)", async () => {
      let release: (() => void) | undefined
      mockedPutFile.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          }),
      )

      const conn = makeConnection()
      const h = mountHook({ embedded: true, wopiConnection: conn, isModified: true })

      // First save fires and stays in flight.
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(mockedPutFile).toHaveBeenCalledTimes(1)

      // While in flight, another edit window completes — the second debounce
      // fires but must be swallowed by the savingRef guard.
      h.rerender({ embedded: true, wopiConnection: conn, isModified: false })
      h.rerender({ embedded: true, wopiConnection: conn, isModified: true })
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(mockedPutFile).toHaveBeenCalledTimes(1)

      // Let the first save finish: still exactly one save, one notification.
      await act(async () => {
        release?.()
      })
      expect(mockedPutFile).toHaveBeenCalledTimes(1)
      expect(h.captures.notifyDocumentSaved).toHaveBeenCalledTimes(1)
    })
  })

  describe("success path", () => {
    it("passes the blob from getDocumentBlob to putFile", async () => {
      const conn = makeConnection()
      const blob = new Blob(["hello world"], { type: "application/octet-stream" })
      const getDocumentBlob = vi.fn(async () => blob)
      const h = mountHook({
        embedded: true,
        wopiConnection: conn,
        isModified: true,
        getDocumentBlob,
      })

      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })

      expect(getDocumentBlob).toHaveBeenCalledTimes(1)
      expect(mockedPutFile).toHaveBeenCalledTimes(1)
      expect(mockedPutFile).toHaveBeenCalledWith(conn, blob)
    })

    it("calls onSaved and reports a saved version after a successful save", async () => {
      const conn = makeConnection()
      const onSaved = vi.fn()
      const notifyDocumentSaved = vi.fn()
      const h = mountHook({
        embedded: true,
        wopiConnection: conn,
        isModified: true,
        onSaved,
        notifyDocumentSaved,
      })

      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })

      expect(onSaved).toHaveBeenCalledTimes(1)
      expect(notifyDocumentSaved).toHaveBeenCalledTimes(1)
      // Version is a timestamp string.
      expect(notifyDocumentSaved).toHaveBeenCalledWith(expect.stringMatching(/^\d+$/))
    })

    it("a later edit auto-saves again once onSaved has reset the modified flag", async () => {
      // Without the onSaved reset, isModified stays true forever and auto-save
      // fires at most once per session (see source comment). A stateful parent
      // mirrors production usage: onSaved clears the dirty flag.
      const getDocumentBlob = vi.fn(async () => new Blob())
      const notifyDocumentSaved = vi.fn()
      const notifyError = vi.fn()

      let touch: (() => void) | null = null

      function StatefulProbe({ conn }: { conn: WopiConnection }) {
        const [isModified, setIsModified] = useState(false)
        const resetModified = useCallback(() => setIsModified(false), [])
        const { forceSave } = useEmbeddedAutoSave(
          true,
          conn,
          isModified,
          getDocumentBlob,
          notifyDocumentSaved,
          notifyError,
          DEFAULT_DEBOUNCE_MS,
          resetModified,
        )
        void forceSave
        touch = () => setIsModified(true)
        return null
      }

      const container = document.createElement("div")
      document.body.appendChild(container)
      const root = createRoot(container)
      act(() => {
        root.render(createElement(StatefulProbe, { conn: makeConnection() }))
      })
      mounted.push({ root, container })

      // First edit → one save, modified resets via onSaved.
      act(() => touch?.())
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(mockedPutFile).toHaveBeenCalledTimes(1)
      expect(notifyDocumentSaved).toHaveBeenCalledTimes(1)

      // Second edit → auto-save fires again (not stuck at "once per session").
      act(() => touch?.())
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(mockedPutFile).toHaveBeenCalledTimes(2)
      expect(notifyDocumentSaved).toHaveBeenCalledTimes(2)
    })
  })

  describe("failure path", () => {
    it("a putFile rejection surfaces notifyError('AUTOSAVE_FAILED', msg) and does NOT report the save", async () => {
      mockedPutFile.mockRejectedValueOnce(new Error("boom"))
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      const conn = makeConnection()
      const h = mountHook({ embedded: true, wopiConnection: conn, isModified: true })

      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })

      expect(h.captures.notifyError).toHaveBeenCalledTimes(1)
      expect(h.captures.notifyError).toHaveBeenCalledWith("AUTOSAVE_FAILED", "boom")
      expect(h.captures.notifyDocumentSaved).not.toHaveBeenCalled()
      expect(h.captures.onSaved).not.toHaveBeenCalled()
      stderr.mockRestore()
    })

    it("a getDocumentBlob rejection surfaces AUTOSAVE_FAILED and does NOT report the save", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      const conn = makeConnection()
      const getDocumentBlob = vi.fn(async () => {
        throw new Error("blob failed")
      })
      const h = mountHook({
        embedded: true,
        wopiConnection: conn,
        isModified: true,
        getDocumentBlob,
      })

      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })

      expect(h.captures.notifyError).toHaveBeenCalledTimes(1)
      expect(h.captures.notifyError).toHaveBeenCalledWith("AUTOSAVE_FAILED", "blob failed")
      expect(h.captures.notifyDocumentSaved).not.toHaveBeenCalled()
      stderr.mockRestore()
    })

    it("the savingRef guard releases so a later edit can still save after a failure", async () => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
      const conn = makeConnection()
      mockedPutFile.mockRejectedValueOnce(new Error("first attempt fails"))
      const h = mountHook({ embedded: true, wopiConnection: conn, isModified: true })

      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(h.captures.notifyError).toHaveBeenCalledTimes(1)

      // Next edit succeeds: savedRef is false again, so auto-save may proceed.
      h.rerender({ embedded: true, wopiConnection: conn, isModified: false })
      h.rerender({ embedded: true, wopiConnection: conn, isModified: true })
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(mockedPutFile).toHaveBeenCalledTimes(2)
      expect(h.captures.notifyDocumentSaved).toHaveBeenCalledTimes(1)
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
      expect(mockedPutFile).not.toHaveBeenCalled()

      // forceSave bypasses the remaining debounce time.
      await act(async () => {
        await h.captures.forceSave?.()
      })
      expect(mockedPutFile).toHaveBeenCalledTimes(1)
      expect(h.captures.notifyDocumentSaved).toHaveBeenCalledTimes(1)

      // The originally scheduled timer was cancelled — no second save.
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
      })
      expect(mockedPutFile).toHaveBeenCalledTimes(1)
    })

    it("is a no-op when embedded is false", async () => {
      const h = mountHook({ embedded: false, wopiConnection: makeConnection(), isModified: true })
      await act(async () => {
        await h.captures.forceSave?.()
      })
      expect(mockedPutFile).not.toHaveBeenCalled()
      expect(h.captures.getDocumentBlob).not.toHaveBeenCalled()
    })
  })
})
