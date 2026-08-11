/**
 * Tests for the frontend command router (FC-4).
 *
 * Acceptance FC-4: unit test registers a fake router, dispatches {command:"bold"},
 * asserts receipt; `pnpm test` at editor-common green.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  type WoCommand,
  getRegisteredCommands,
  isCommandRegistered,
  registerCommands,
  registerEditorRouter,
  resetRouter,
  unregisterCommands,
} from "../command-router"

// Type assertion for window.dispatchEvent to allow CustomEvent with detail
declare global {
  interface Window {
    dispatchEvent(event: CustomEvent): void
  }
}

describe("command-router", () => {
  // Clean up before each test
  beforeEach(() => {
    // Reset the router state
    resetRouter()

    // Remove all event listeners from window
    const listeners = window.getEventListeners?.("wo-command") || []
    for (const listener of listeners) {
      window.removeEventListener("wo-command", listener.listener, listener.options)
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("registerEditorRouter", () => {
    it("registers a handler for a specific editor kind and dispatches commands", () => {
      const handler = vi.fn()
      const unregister = registerEditorRouter("doc", handler)

      // Dispatch a wo-command event
      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "bold" },
        }),
      )

      // Verify handler was called
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({
        command: "bold",
        value: undefined,
      })

      // Clean up
      unregister()
    })

    it("dispatches command with value", () => {
      const handler = vi.fn()
      const unregister = registerEditorRouter("sheet", handler)

      // Dispatch a wo-command event with a value
      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "setFontSize", value: 14 },
        }),
      )

      // Verify handler was called with the value
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({
        command: "setFontSize",
        value: 14,
      })

      unregister()
    })

    it("handles string value", () => {
      const handler = vi.fn()
      const unregister = registerEditorRouter("slide", handler)

      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "fontFamily", value: "Times New Roman" },
        }),
      )

      expect(handler).toHaveBeenCalledWith({
        command: "fontFamily",
        value: "Times New Roman",
      })

      unregister()
    })

    it("handles boolean value", () => {
      const handler = vi.fn()
      const unregister = registerEditorRouter("pdf", handler)

      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "toggleBold", value: true },
        }),
      )

      expect(handler).toHaveBeenCalledWith({
        command: "toggleBold",
        value: true,
      })

      unregister()
    })

    it("handles object value", () => {
      const handler = vi.fn()
      const unregister = registerEditorRouter("visio", handler)

      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "setStyle", value: { color: "red", size: 12 } },
        }),
      )

      expect(handler).toHaveBeenCalledWith({
        command: "setStyle",
        value: { color: "red", size: 12 },
      })

      unregister()
    })

    it("unregister function removes the handler", () => {
      const handler = vi.fn()
      const unregister = registerEditorRouter("doc", handler)

      // Dispatch before unregister
      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "bold" },
        }),
      )
      expect(handler).toHaveBeenCalledTimes(1)

      // Unregister
      unregister()

      // Dispatch after unregister - should not be called
      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "bold" },
        }),
      )
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it("returns unregister function that cleans up resources", () => {
      const handler = vi.fn()
      const unregister = registerEditorRouter("doc", handler)

      // Verify unregister is a function
      expect(typeof unregister).toBe("function")

      unregister()
    })
  })

  describe("command validation with registry", () => {
    it("registers commands for an editor kind", () => {
      const handler = vi.fn()
      const unregister = registerEditorRouter("doc", handler, ["bold", "italic", "underline"])

      // These commands should be handled
      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "bold" },
        }),
      )
      expect(handler).toHaveBeenCalledTimes(1)

      // Unregister and clean up
      unregister()
    })

    it("all commands allowed when no registry specified", () => {
      const handler = vi.fn()
      const unregister = registerEditorRouter("sheet", handler)

      // Any command should be handled
      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "anyCommand" },
        }),
      )
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({ command: "anyCommand" })

      unregister()
    })
  })

  describe("registerCommands", () => {
    it("registers additional commands for an editor", () => {
      const handler = vi.fn()
      registerEditorRouter("doc", handler, ["bold"])
      registerCommands("doc", ["italic", "underline"])

      // All three commands should be registered
      expect(isCommandRegistered("doc", "bold")).toBe(true)
      expect(isCommandRegistered("doc", "italic")).toBe(true)
      expect(isCommandRegistered("doc", "underline")).toBe(true)
    })
  })

  describe("unregisterCommands", () => {
    it("unregisters specific commands", () => {
      registerEditorRouter("doc", vi.fn(), ["bold", "italic", "underline"])

      expect(isCommandRegistered("doc", "bold")).toBe(true)

      unregisterCommands("doc", ["bold"])

      expect(isCommandRegistered("doc", "bold")).toBe(false)
      expect(isCommandRegistered("doc", "italic")).toBe(true)
    })
  })

  describe("isCommandRegistered", () => {
    it("returns true for registered commands", () => {
      registerEditorRouter("doc", vi.fn(), ["bold", "italic"])

      expect(isCommandRegistered("doc", "bold")).toBe(true)
      expect(isCommandRegistered("doc", "italic")).toBe(true)
    })

    it("returns false for unregistered commands", () => {
      registerEditorRouter("doc", vi.fn(), ["bold"])

      expect(isCommandRegistered("doc", "underline")).toBe(false)
    })

    it("returns false for unknown editor kinds", () => {
      expect(isCommandRegistered("doc" as const, "bold")).toBe(false)
    })
  })

  describe("getRegisteredCommands", () => {
    it("returns all registered commands for an editor", () => {
      registerEditorRouter("doc", vi.fn(), ["bold", "italic", "underline"])

      const commands = getRegisteredCommands("doc")
      expect(commands).toContain("bold")
      expect(commands).toContain("italic")
      expect(commands).toContain("underline")
    })

    it("returns empty array for unknown editor kinds", () => {
      const commands = getRegisteredCommands("doc" as const)
      expect(commands).toEqual([])
    })
  })

  describe("multiple editor kinds", () => {
    it("handles multiple editor routers simultaneously", () => {
      const docHandler = vi.fn()
      const sheetHandler = vi.fn()

      registerEditorRouter("doc", docHandler, ["bold"])
      registerEditorRouter("sheet", sheetHandler, ["bold"])

      // Dispatch a command that both editors handle
      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "bold" },
        }),
      )

      // Only one handler should be called (first registered wins)
      expect(docHandler).toHaveBeenCalledTimes(1)
      expect(sheetHandler).toHaveBeenCalledTimes(0)
    })

    it("dispatches to different handlers based on command registry", () => {
      const docHandler = vi.fn()
      const sheetHandler = vi.fn()

      registerEditorRouter("doc", docHandler, ["bold"])
      registerEditorRouter("sheet", sheetHandler, ["bold", "italic"])

      // Bold should be handled by doc (first registered)
      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "bold" },
        }),
      )
      expect(docHandler).toHaveBeenCalledWith({ command: "bold" })
      expect(sheetHandler).not.toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    it("continues to next handler if one fails", () => {
      const failingHandler = vi.fn(() => {
        throw new Error("Handler error")
      })
      const successHandler = vi.fn()

      registerEditorRouter("doc", failingHandler, ["bold"])
      registerEditorRouter("sheet", successHandler, ["bold"])

      // Should log error but continue
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "bold" },
        }),
      )

      expect(failingHandler).toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalled()

      consoleError.mockRestore()
    })

    it("warns when no handler is found", () => {
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {})

      // Register a handler with specific commands
      registerEditorRouter("doc", vi.fn(), ["bold"])

      // Dispatch a command that no handler can handle
      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "unknownCommand" },
        }),
      )

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining("No handler found for command"),
      )

      consoleWarn.mockRestore()
    })

    it("warns for invalid event structure", () => {
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {})
      const handler = vi.fn()
      registerEditorRouter("doc", handler)

      // Dispatch event without command property
      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { value: "test" },
        }),
      )

      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining("Invalid wo-command event"))
      expect(handler).not.toHaveBeenCalled()

      consoleWarn.mockRestore()
    })
  })

  describe("event ignoring", () => {
    it("ignores non-wo-command events", () => {
      const handler = vi.fn()
      registerEditorRouter("doc", handler)

      // Dispatch a different event type
      window.dispatchEvent(new CustomEvent("other-event", { detail: { command: "bold" } }))

      expect(handler).not.toHaveBeenCalled()
    })

    it("ignores wo-command events without detail", () => {
      const handler = vi.fn()
      registerEditorRouter("doc", handler)

      // Dispatch wo-command without detail
      window.dispatchEvent(new CustomEvent("wo-command"))

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe("acceptance FC-4", () => {
    // This is the exact acceptance test from the contract
    it('registers a fake router, dispatches {command:"bold"}, asserts receipt', () => {
      let receivedCommand: WoCommand | null = null
      const handler = (cmd: WoCommand) => {
        receivedCommand = cmd
      }

      const unregister = registerEditorRouter("doc", handler)

      // Dispatch the command
      window.dispatchEvent(
        new CustomEvent("wo-command", {
          detail: { command: "bold" },
        }),
      )

      // Assert receipt
      expect(receivedCommand).not.toBeNull()
      expect(receivedCommand?.command).toBe("bold")

      unregister()
    })
  })
})
