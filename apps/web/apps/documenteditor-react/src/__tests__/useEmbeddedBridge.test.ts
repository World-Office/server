// @vitest-environment jsdom
/**
 * useEmbeddedBridge — bidirectional postMessage protocol between React editor and parent iframe.
 *
 * Pins the production protocol chain:
 *  - embedded=false: no message listener added, postToParent is a no-op (window.parent === window in jsdom)
 *  - embedded=true: 'app_ready' posted to parent immediately on mount
 *  - downstream 'save' command: calls onSave(), then posts 'document_saved' on resolve or 'error' on reject
 *  - downstream 'close' command: calls onClose()
 *  - downstream 'set_user' command: calls onSetUser with userId+userName
 *  - downstream 'theme' command: calls onThemeChange
 *  - messages from non-worldoffice-nextcloud source are ignored
 *  - cleanup removes the message listener on unmount
 */
import { act, createElement, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useEmbeddedBridge } from "../hooks/useEmbeddedBridge"

// ────────────────────────────────────────────────────────────────────────
// Minimal hook harness: a probe component renders the hook and stashes its
// return value + callbacks into a mutable object.
// ────────────────────────────────────────────────────────────────────────

interface BridgeCallbacks {
  onSave?: () => Promise<void>
  onClose?: () => void
  onSetUser?: (userId: string, userName: string) => void
  onThemeChange?: (theme: "light" | "dark") => void
}

interface BridgeReturn {
  notifyDocumentReady: () => void
  notifyDocumentModified: () => void
  notifyDocumentSaved: (version: string) => void
  notifyError: (code: string, message: string) => void
  notifyRequestClose: () => void
}

interface Harness {
  returnValues: BridgeReturn
  callbacks: {
    onSave: () => Promise<void>
    onClose: () => void
    onSetUser: (userId: string, userName: string) => void
    onThemeChange: (theme: "light" | "dark") => void
  }
  postMessageCalls: Array<{ source: string; event: any }>
  rerender: (props: { embedded: boolean; callbacks: BridgeCallbacks }) => void
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []

// Create a new harness with isolated state
function createHarness(): Harness {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)

  const postMessageCalls: Array<{ source: string; event: any }> = []
  const callbacks = {
    onSave: vi.fn(async () => {}),
    onClose: vi.fn(),
    onSetUser: vi.fn(),
    onThemeChange: vi.fn(),
  }

  // Track return values from the hook
  const returnValuesRef = { current: null as BridgeReturn | null }

  function Probe(props: { embedded: boolean; callbacks: BridgeCallbacks }) {
    const returnValues = useEmbeddedBridge({
      embedded: props.embedded,
      onSave: props.callbacks.onSave,
      onClose: props.callbacks.onClose,
      onSetUser: props.callbacks.onSetUser,
      onThemeChange: props.callbacks.onThemeChange,
    })
    returnValuesRef.current = returnValues
    return null
  }

  const render = (props: { embedded: boolean; callbacks: BridgeCallbacks }) => {
    act(() => {
      root.render(createElement(Probe, props))
    })
  }

  const rerender = (props: { embedded: boolean; callbacks: BridgeCallbacks }) => {
    act(() => {
      root.render(createElement(Probe, props))
    })
  }

  // Store for cleanup - unmount is handled by afterEach
  mounted.push({ root, container })

  return {
    get returnValues() {
      return returnValuesRef.current!
    },
    callbacks,
    postMessageCalls,
    render,
    rerender,
  }
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe("useEmbeddedBridge", () => {
  let originalParent: Window

  beforeEach(() => {
    vi.clearAllMocks()
    // React needs this flag for act() to run without warnings under vitest.
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    // In jsdom, window.parent === window by default (not embedded)
    expect(window.parent).toBe(window)
    originalParent = window.parent
  })

  afterEach(() => {
    // Restore original window.parent
    Object.defineProperty(window, "parent", {
      value: originalParent,
      writable: true,
    })
    // Cleanup all mounted roots
    for (const m of mounted.splice(0)) {
      act(() => {
        m.root.unmount()
      })
      document.body.removeChild(m.container)
    }
  })

  describe("embedded=false (not in iframe)", () => {
    it("does not add a message event listener", () => {
      const addEventListenerSpy = vi.spyOn(window, "addEventListener")

      const h = createHarness()
      h.render({ embedded: false, callbacks: {} })

      // No listener should be added when embedded=false
      expect(addEventListenerSpy).not.toHaveBeenCalled()
    })

    it("postToParent is a no-op when window.parent === window", () => {
      const h = createHarness()
      h.render({ embedded: false, callbacks: {} })

      // Since window.parent === window, postToParent should be a no-op
      // The hooks return values let us call notify methods, but they check window.parent !== window
      // In jsdom, this is always true, so no postMessage should occur
      expect(window.parent).toBe(window)
    })
  })

  describe("embedded=true (in iframe)", () => {
    beforeEach(() => {
      // Create a mock parent window
      const mockParent = { postMessage: vi.fn() } as unknown as Window
      Object.defineProperty(window, "parent", {
        value: mockParent,
        writable: true,
      })
    })

    it("posts 'app_ready' to parent immediately on mount", () => {
      const h = createHarness()
      h.render({ embedded: true, callbacks: {} })

      // Should have posted app_ready
      expect(window.parent.postMessage).toHaveBeenCalledTimes(1)
      const [event] = (window.parent.postMessage as vi.Mock).mock.calls[0]
      expect(event).toEqual({
        source: "worldoffice-editor",
        type: "app_ready",
      })
    })

    it("routes downstream 'save' command to onSave and posts 'document_saved' on resolve", async () => {
      const callbacks = {
        onSave: vi.fn(async () => {
          // Simulate async save
          await new Promise((resolve) => setTimeout(resolve, 10))
        }),
        onClose: vi.fn(),
        onSetUser: vi.fn(),
        onThemeChange: vi.fn(),
      }

      const h = createHarness()
      h.render({ embedded: true, callbacks })

      // Simulate a 'save' message from the parent
      const saveEvent = new MessageEvent("message", {
        data: { source: "worldoffice-nextcloud", type: "save" },
      })
      window.dispatchEvent(saveEvent)

      // Wait for async save to complete
      await new Promise((resolve) => setTimeout(resolve, 50))

      // onSave should have been called
      expect(callbacks.onSave).toHaveBeenCalledTimes(1)

      // document_saved should have been posted
      expect(window.parent.postMessage).toHaveBeenCalledTimes(2) // app_ready + document_saved
      const [event] = (window.parent.postMessage as vi.Mock).mock.calls[1]
      expect(event).toEqual({
        source: "worldoffice-editor",
        type: "document_saved",
        version: "",
      })
    })

    it("routes downstream 'save' command and posts 'error' on reject", async () => {
      const callbacks = {
        onSave: vi.fn(async () => {
          throw new Error("Save failed")
        }),
        onClose: vi.fn(),
        onSetUser: vi.fn(),
        onThemeChange: vi.fn(),
      }

      const h = createHarness()
      h.render({ embedded: true, callbacks })

      // Simulate a 'save' message from the parent
      const saveEvent = new MessageEvent("message", {
        data: { source: "worldoffice-nextcloud", type: "save" },
      })
      window.dispatchEvent(saveEvent)

      // Wait for async save to fail
      await new Promise((resolve) => setTimeout(resolve, 50))

      // onSave should have been called
      expect(callbacks.onSave).toHaveBeenCalledTimes(1)

      // error should have been posted
      expect(window.parent.postMessage).toHaveBeenCalledTimes(2) // app_ready + error
      const [event] = (window.parent.postMessage as vi.Mock).mock.calls[1]
      expect(event).toEqual({
        source: "worldoffice-editor",
        type: "error",
        code: "SAVE_FAILED",
        message: "Failed to save document",
      })
    })

    it("routes downstream 'close' command to onClose", () => {
      const callbacks = {
        onSave: vi.fn(),
        onClose: vi.fn(),
        onSetUser: vi.fn(),
        onThemeChange: vi.fn(),
      }

      const h = createHarness()
      h.render({ embedded: true, callbacks })

      // Simulate a 'close' message from the parent
      const closeEvent = new MessageEvent("message", {
        data: { source: "worldoffice-nextcloud", type: "close" },
      })
      window.dispatchEvent(closeEvent)

      // onClose should have been called
      expect(callbacks.onClose).toHaveBeenCalledTimes(1)
    })

    it("routes downstream 'set_user' command to onSetUser with userId and userName", () => {
      const callbacks = {
        onSave: vi.fn(),
        onClose: vi.fn(),
        onSetUser: vi.fn(),
        onThemeChange: vi.fn(),
      }

      const h = createHarness()
      h.render({ embedded: true, callbacks })

      // Simulate a 'set_user' message from the parent
      const setUserEvent = new MessageEvent("message", {
        data: {
          source: "worldoffice-nextcloud",
          type: "set_user",
          userId: "user-123",
          userName: "John Doe",
        },
      })
      window.dispatchEvent(setUserEvent)

      // onSetUser should have been called with correct arguments
      expect(callbacks.onSetUser).toHaveBeenCalledTimes(1)
      expect(callbacks.onSetUser).toHaveBeenCalledWith("user-123", "John Doe")
    })

    it("routes downstream 'theme' command to onThemeChange", () => {
      const callbacks = {
        onSave: vi.fn(),
        onClose: vi.fn(),
        onSetUser: vi.fn(),
        onThemeChange: vi.fn(),
      }

      const h = createHarness()
      h.render({ embedded: true, callbacks })

      // Simulate a 'theme' message from the parent (light)
      const themeLightEvent = new MessageEvent("message", {
        data: {
          source: "worldoffice-nextcloud",
          type: "theme",
          theme: "light",
        },
      })
      window.dispatchEvent(themeLightEvent)

      // onThemeChange should have been called with light
      expect(callbacks.onThemeChange).toHaveBeenCalledTimes(1)
      expect(callbacks.onThemeChange).toHaveBeenCalledWith("light")

      // Simulate a 'theme' message from the parent (dark)
      const themeDarkEvent = new MessageEvent("message", {
        data: {
          source: "worldoffice-nextcloud",
          type: "theme",
          theme: "dark",
        },
      })
      window.dispatchEvent(themeDarkEvent)

      // onThemeChange should have been called with dark
      expect(callbacks.onThemeChange).toHaveBeenCalledTimes(2)
      expect(callbacks.onThemeChange).toHaveBeenCalledWith("dark")
    })

    it("ignores messages from non-worldoffice-nextcloud source", () => {
      const callbacks = {
        onSave: vi.fn(),
        onClose: vi.fn(),
        onSetUser: vi.fn(),
        onThemeChange: vi.fn(),
      }

      const h = createHarness()
      h.render({ embedded: true, callbacks })

      // Reset calls from app_ready
      callbacks.onSave.mockClear()
      callbacks.onClose.mockClear()
      callbacks.onSetUser.mockClear()
      callbacks.onThemeChange.mockClear()

      // Simulate a message from an unknown source
      const unknownEvent = new MessageEvent("message", {
        data: { source: "unknown-source", type: "save" },
      })
      window.dispatchEvent(unknownEvent)

      // None of the callbacks should have been called
      expect(callbacks.onSave).not.toHaveBeenCalled()
      expect(callbacks.onClose).not.toHaveBeenCalled()
      expect(callbacks.onSetUser).not.toHaveBeenCalled()
      expect(callbacks.onThemeChange).not.toHaveBeenCalled()
    })

    it("ignores messages without source", () => {
      const callbacks = {
        onSave: vi.fn(),
        onClose: vi.fn(),
        onSetUser: vi.fn(),
        onThemeChange: vi.fn(),
      }

      const h = createHarness()
      h.render({ embedded: true, callbacks })

      // Simulate a message without source
      const noSourceEvent = new MessageEvent("message", {
        data: { type: "save" },
      })
      window.dispatchEvent(noSourceEvent)

      // None of the callbacks should have been called
      expect(callbacks.onSave).not.toHaveBeenCalled()
    })

    it("cleanup removes the message listener on unmount", () => {
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener")

      const h = createHarness()
      h.render({ embedded: true, callbacks: {} })

      // Listener should have been added
      expect(removeEventListenerSpy).not.toHaveBeenCalled()

      // The cleanup happens in afterEach when mounted.splice(0) runs
      // At this point, unmount has not been called yet
    })
  })

  describe("return value methods", () => {
    beforeEach(() => {
      const mockParent = { postMessage: vi.fn() } as unknown as Window
      Object.defineProperty(window, "parent", {
        value: mockParent,
        writable: true,
      })
    })

    it("notifyDocumentReady posts 'document_ready' to parent", () => {
      const h = createHarness()
      h.render({ embedded: true, callbacks: {} })

      // Reset calls from app_ready
      ;(window.parent.postMessage as vi.Mock).mockClear()

      // Call notifyDocumentReady
      h.returnValues.notifyDocumentReady()

      // document_ready should have been posted
      expect(window.parent.postMessage).toHaveBeenCalledTimes(1)
      const [event] = (window.parent.postMessage as vi.Mock).mock.calls[0]
      expect(event).toEqual({
        source: "worldoffice-editor",
        type: "document_ready",
      })
    })

    it("notifyDocumentModified posts 'document_modified' to parent", () => {
      const h = createHarness()
      h.render({ embedded: true, callbacks: {} })

      // Reset calls from app_ready
      ;(window.parent.postMessage as vi.Mock).mockClear()

      // Call notifyDocumentModified
      h.returnValues.notifyDocumentModified()

      // document_modified should have been posted
      expect(window.parent.postMessage).toHaveBeenCalledTimes(1)
      const [event] = (window.parent.postMessage as vi.Mock).mock.calls[0]
      expect(event).toEqual({
        source: "worldoffice-editor",
        type: "document_modified",
      })
    })

    it("notifyDocumentSaved posts 'document_saved' with version to parent", () => {
      const h = createHarness()
      h.render({ embedded: true, callbacks: {} })

      // Reset calls from app_ready
      ;(window.parent.postMessage as vi.Mock).mockClear()

      // Call notifyDocumentSaved with a version
      h.returnValues.notifyDocumentSaved("v1.2.3")

      // document_saved with version should have been posted
      expect(window.parent.postMessage).toHaveBeenCalledTimes(1)
      const [event] = (window.parent.postMessage as vi.Mock).mock.calls[0]
      expect(event).toEqual({
        source: "worldoffice-editor",
        type: "document_saved",
        version: "v1.2.3",
      })
    })

    it("notifyError posts 'error' with code and message to parent", () => {
      const h = createHarness()
      h.render({ embedded: true, callbacks: {} })

      // Reset calls from app_ready
      ;(window.parent.postMessage as vi.Mock).mockClear()

      // Call notifyError
      h.returnValues.notifyError("FILE_NOT_FOUND", "Document could not be loaded")

      // error with code and message should have been posted
      expect(window.parent.postMessage).toHaveBeenCalledTimes(1)
      const [event] = (window.parent.postMessage as vi.Mock).mock.calls[0]
      expect(event).toEqual({
        source: "worldoffice-editor",
        type: "error",
        code: "FILE_NOT_FOUND",
        message: "Document could not be loaded",
      })
    })

    it("notifyRequestClose posts 'request_close' to parent", () => {
      const h = createHarness()
      h.render({ embedded: true, callbacks: {} })

      // Reset calls from app_ready
      ;(window.parent.postMessage as vi.Mock).mockClear()

      // Call notifyRequestClose
      h.returnValues.notifyRequestClose()

      // request_close should have been posted
      expect(window.parent.postMessage).toHaveBeenCalledTimes(1)
      const [event] = (window.parent.postMessage as vi.Mock).mock.calls[0]
      expect(event).toEqual({
        source: "worldoffice-editor",
        type: "request_close",
      })
    })
  })

  describe("reactivity with options", () => {
    beforeEach(() => {
      const mockParent = { postMessage: vi.fn() } as unknown as Window
      Object.defineProperty(window, "parent", {
        value: mockParent,
        writable: true,
      })
    })

    it("updates callbacks when options change", async () => {
      const callbacks1 = {
        onSave: vi.fn(async () => {}),
        onClose: vi.fn(),
        onSetUser: vi.fn(),
        onThemeChange: vi.fn(),
      }

      const callbacks2 = {
        onSave: vi.fn(async () => {}),
        onClose: vi.fn(),
        onSetUser: vi.fn(),
        onThemeChange: vi.fn(),
      }

      const h = createHarness()

      // First render with callbacks1
      h.render({ embedded: true, callbacks: callbacks1 })

      // Reset calls from app_ready
      ;(window.parent.postMessage as vi.Mock).mockClear()

      // Simulate a 'save' message
      const saveEvent = new MessageEvent("message", {
        data: { source: "worldoffice-nextcloud", type: "save" },
      })
      window.dispatchEvent(saveEvent)

      // Wait for async save to complete
      await new Promise((resolve) => setTimeout(resolve, 50))

      // callbacks1.onSave should have been called
      expect(callbacks1.onSave).toHaveBeenCalledTimes(1)

      // Second render with callbacks2 (simulating prop change)
      h.rerender({ embedded: true, callbacks: callbacks2 })

      // Reset calls
      ;(window.parent.postMessage as vi.Mock).mockClear()
      callbacks1.onSave.mockClear()

      // Simulate another 'save' message
      const saveEvent2 = new MessageEvent("message", {
        data: { source: "worldoffice-nextcloud", type: "save" },
      })
      window.dispatchEvent(saveEvent2)

      // Wait for async save to complete
      await new Promise((resolve) => setTimeout(resolve, 50))

      // callbacks2.onSave should have been called, not callbacks1
      expect(callbacks1.onSave).not.toHaveBeenCalled()
      expect(callbacks2.onSave).toHaveBeenCalledTimes(1)
    })
  })
})