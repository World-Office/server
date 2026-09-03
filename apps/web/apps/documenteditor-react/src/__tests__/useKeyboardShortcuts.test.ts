// @vitest-environment jsdom
/**
 * useKeyboardShortcuts — global document keydown bindings.
 *
 * Pins the actual binding table from the hook source (useKeyboardShortcuts.ts):
 *  - ctrl/meta + s → save: WOPI upload first, else desktop file write, else save-as
 *  - ctrl/meta + o → open file (desktop only)
 *  - ctrl/meta + p → print (desktop only)
 *  - ctrl/meta + = or + → zoom in
 *  - ctrl/meta + - → zoom out
 *  - ctrl/meta + 0 → reset zoom to 100
 *  - metaKey behaves identically to ctrlKey (the guard is `e.ctrlKey || e.metaKey`)
 *  - unbound keys, missing modifiers and case-mismatched keys are ignored and
 *    NOT preventDefault'ed
 *  - the document keydown listener is removed when the hook unmounts
 */
import type { WopiConnection } from "@world-office/wopi-client"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { openFile, saveFileToPath } from "../bridge/file-operations"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { documentStore } from "../stores/DocumentStore"

// Mock the native file bridge so no Tauri code path is touched.
vi.mock("../bridge/file-operations", () => ({
  openFile: vi.fn(),
  saveFileToPath: vi.fn(),
}))

const mockedOpenFile = vi.mocked(openFile)
const mockedSaveFileToPath = vi.mocked(saveFileToPath)

/** jsdom's Blob has no .text() — hand the handler a blob-alike that does. */
function fakeTextBlob(text: string): Blob {
  return { text: async () => text } as unknown as Blob
}

function makeConnection(): WopiConnection {
  return {
    wopiFileId: "file-1",
    wopiAccessToken: "token-1",
    docserverBase: "https://wopi.test",
  }
}

// ────────────────────────────────────────────────────────────────────────
// Minimal hook harness: no @testing-library — a probe component mounts the
// hook; the real KeyboardEvent is dispatched at `document`.
// ────────────────────────────────────────────────────────────────────────

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []

function mountHook(): void {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  function Probe() {
    useKeyboardShortcuts()
    return null
  }
  act(() => {
    root.render(createElement(Probe))
  })
  mounted.push({ root, container })
}

function unmountAll(): void {
  for (const m of mounted.splice(0)) {
    act(() => {
      m.root.unmount()
    })
    document.body.removeChild(m.container)
  }
}

function pressKey(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  document.dispatchEvent(event)
  return event
}

/** Let async handlers (handleSave/handleOpen) settle. */
async function flushAsync(): Promise<void> {
  await act(async () => {})
  await Promise.resolve()
}

let originalPrint: typeof window.print

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  originalPrint = window.print
  vi.restoreAllMocks()
  vi.clearAllMocks()
  // Reset the shared singleton store to a known baseline.
  documentStore.wopiConnection = null
  documentStore.isDesktop = false
  documentStore.filePath = null
  documentStore.fileName = "Untitled Document"
  documentStore.zoomLevel = 100
  documentStore.fitToPage = false
  documentStore.fitToWidth = false
  documentStore.activeTab = null
  documentStore.activeFileMenuPanel = null
  documentStore.isDirty = false
  documentStore.isModified = false
})

afterEach(() => {
  unmountAll()
  window.print = originalPrint
})

describe("useKeyboardShortcuts — save (ctrl/meta + s)", () => {
  it("uploads via WOPI when a WOPI connection is active and prevents default", async () => {
    documentStore.wopiConnection = makeConnection()
    const saveSpy = vi.spyOn(documentStore, "saveToWopi").mockResolvedValue(undefined)
    mountHook()

    const event = pressKey("s", { ctrlKey: true })
    await flushAsync()

    expect(event.defaultPrevented).toBe(true)
    expect(saveSpy).toHaveBeenCalledTimes(1)
    // WOPI path wins over the desktop file bridge.
    expect(mockedSaveFileToPath).not.toHaveBeenCalled()
  })

  it("writes the serialized document to the current file path on desktop", async () => {
    documentStore.isDesktop = true
    documentStore.filePath = "/home/user/doc.txt"
    vi.spyOn(documentStore, "buildDocumentBlob").mockResolvedValue(fakeTextBlob("hello world"))
    const markSavedSpy = vi.spyOn(documentStore, "markSaved")
    mountHook()

    pressKey("s", { ctrlKey: true })
    await flushAsync()

    expect(mockedSaveFileToPath).toHaveBeenCalledTimes(1)
    expect(mockedSaveFileToPath).toHaveBeenCalledWith("/home/user/doc.txt", "hello world")
    expect(markSavedSpy).toHaveBeenCalledTimes(1)
    // Not the save-as fallback.
    expect(documentStore.activeTab).not.toBe("file")
    expect(documentStore.activeFileMenuPanel).not.toBe("saveas")
  })

  it("opens the save-as panel on desktop when no file path is set", async () => {
    documentStore.isDesktop = true
    documentStore.filePath = null
    mountHook()

    pressKey("s", { ctrlKey: true })
    await flushAsync()

    expect(documentStore.activeTab).toBe("file")
    expect(documentStore.activeFileMenuPanel).toBe("saveas")
    expect(mockedSaveFileToPath).not.toHaveBeenCalled()
  })

  it("is a no-op outside the desktop runtime with no WOPI connection", async () => {
    documentStore.isDesktop = false
    documentStore.wopiConnection = null
    const saveSpy = vi.spyOn(documentStore, "saveToWopi")
    mountHook()

    pressKey("s", { ctrlKey: true })
    await flushAsync()

    expect(saveSpy).not.toHaveBeenCalled()
    expect(mockedSaveFileToPath).not.toHaveBeenCalled()
    expect(documentStore.activeTab).toBeNull()
  })

  it("logs a failing desktop write without crashing or marking saved", async () => {
    documentStore.isDesktop = true
    documentStore.filePath = "/tmp/x.txt"
    vi.spyOn(documentStore, "buildDocumentBlob").mockResolvedValue(fakeTextBlob("data"))
    mockedSaveFileToPath.mockRejectedValueOnce(new Error("disk full"))
    const markSavedSpy = vi.spyOn(documentStore, "markSaved")
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    mountHook()
    pressKey("s", { ctrlKey: true })
    await flushAsync()

    expect(errSpy).toHaveBeenCalledWith("Desktop save failed:", expect.any(Error))
    expect(markSavedSpy).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it("logs a failing WOPI save without throwing out of the handler", async () => {
    documentStore.wopiConnection = makeConnection()
    vi.spyOn(documentStore, "saveToWopi").mockRejectedValue(new Error("wopi down"))
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    mountHook()
    pressKey("s", { ctrlKey: true })
    await flushAsync()

    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe("useKeyboardShortcuts — open (ctrl/meta + o)", () => {
  it("opens a file on desktop and applies the picked path, clearing dirty", async () => {
    documentStore.isDesktop = true
    documentStore.isDirty = true
    mockedOpenFile.mockResolvedValue({
      path: "/tmp/note.txt",
      name: "note.txt",
      content: "hi",
      mimeType: "text/plain",
    })
    mountHook()

    pressKey("o", { ctrlKey: true })
    await flushAsync()

    expect(mockedOpenFile).toHaveBeenCalledTimes(1)
    expect(documentStore.filePath).toBe("/tmp/note.txt")
    expect(documentStore.isDirty).toBe(false)
  })

  it("is ignored outside the desktop runtime", async () => {
    documentStore.isDesktop = false
    mountHook()

    pressKey("o", { ctrlKey: true })
    await flushAsync()

    expect(mockedOpenFile).not.toHaveBeenCalled()
  })

  it("leaves the store untouched when the file picker is cancelled", async () => {
    documentStore.isDesktop = true
    documentStore.filePath = "/keep.txt"
    documentStore.isDirty = true
    mockedOpenFile.mockResolvedValue(null)
    mountHook()

    pressKey("o", { ctrlKey: true })
    await flushAsync()

    expect(mockedOpenFile).toHaveBeenCalledTimes(1)
    expect(documentStore.filePath).toBe("/keep.txt")
    expect(documentStore.isDirty).toBe(true)
  })
})

describe("useKeyboardShortcuts — print (ctrl/meta + p)", () => {
  it("prints via window.print on desktop", () => {
    documentStore.isDesktop = true
    const printSpy = vi.fn()
    window.print = printSpy
    mountHook()

    const event = pressKey("p", { ctrlKey: true })

    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it("is ignored in web mode", () => {
    documentStore.isDesktop = false
    const printSpy = vi.fn()
    window.print = printSpy
    mountHook()

    pressKey("p", { ctrlKey: true })

    expect(printSpy).not.toHaveBeenCalled()
  })
})

describe("useKeyboardShortcuts — zoom", () => {
  it("ctrl+plus zooms in and prevents default", () => {
    mountHook()
    const event = pressKey("+", { ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(documentStore.zoomLevel).toBe(150)
  })

  it("ctrl+equals (unshifted plus key) also zooms in", () => {
    mountHook()
    const event = pressKey("=", { ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(documentStore.zoomLevel).toBe(150)
  })

  it("ctrl+minus zooms out", () => {
    mountHook()
    pressKey("-", { ctrlKey: true })
    expect(documentStore.zoomLevel).toBe(75)
  })

  it("ctrl+0 resets zoom back to 100", () => {
    documentStore.zoomLevel = 150
    mountHook()
    pressKey("0", { ctrlKey: true })
    expect(documentStore.zoomLevel).toBe(100)
  })
})

describe("useKeyboardShortcuts — modifier handling", () => {
  it("meta+save behaves identically to ctrl+save", async () => {
    documentStore.wopiConnection = makeConnection()
    const saveSpy = vi.spyOn(documentStore, "saveToWopi").mockResolvedValue(undefined)
    mountHook()

    pressKey("s", { metaKey: true })
    await flushAsync()

    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  it("meta+equals zooms in like ctrl+equals", () => {
    mountHook()
    const event = pressKey("=", { metaKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(documentStore.zoomLevel).toBe(150)
  })

  it("an unbound key with a modifier does nothing and is not intercepted", () => {
    mountHook()
    const event = pressKey("b", { ctrlKey: true })
    expect(event.defaultPrevented).toBe(false)
    expect(documentStore.zoomLevel).toBe(100)
    expect(mockedSaveFileToPath).not.toHaveBeenCalled()
  })

  it("a bound key without any modifier is ignored", () => {
    mountHook()
    const evtS = pressKey("s")
    const evtMinus = pressKey("-")
    const evtPlus = pressKey("=")
    const evtZero = pressKey("0")
    expect(evtS.defaultPrevented).toBe(false)
    expect(evtMinus.defaultPrevented).toBe(false)
    expect(evtPlus.defaultPrevented).toBe(false)
    expect(evtZero.defaultPrevented).toBe(false)
    expect(documentStore.zoomLevel).toBe(100)
    expect(mockedSaveFileToPath).not.toHaveBeenCalled()
  })

  it("uppercase S with ctrl is not treated as ctrl+s (case-sensitive binding)", async () => {
    documentStore.isDesktop = true
    documentStore.filePath = "/tmp/x.txt"
    vi.spyOn(documentStore, "buildDocumentBlob").mockResolvedValue(fakeTextBlob("x"))
    mountHook()

    const event = pressKey("S", { ctrlKey: true })
    await flushAsync()

    expect(event.defaultPrevented).toBe(false)
    expect(mockedSaveFileToPath).not.toHaveBeenCalled()
  })
})

describe("useKeyboardShortcuts — lifecycle", () => {
  it("removes the document keydown listener when the hook unmounts", async () => {
    documentStore.wopiConnection = makeConnection()
    const saveSpy = vi.spyOn(documentStore, "saveToWopi").mockResolvedValue(undefined)
    mountHook()

    unmountAll()

    pressKey("s", { ctrlKey: true })
    await flushAsync()

    expect(saveSpy).not.toHaveBeenCalled()
  })
})
