// @vitest-environment jsdom
/**
 * usePlugins — desktop plugin bootstrap hook.
 *
 * Pins the actual behavior from the hook source (usePlugins.ts):
 *  - without a Tauri runtime (no window.__TAURI__) the hook skips plugin
 *    loading entirely and installs no window listeners
 *  - in the desktop runtime get_plugins is invoked on mount and every plugin
 *    with enabled=true AND a non-empty source is executed via
 *    sandboxExecutePlugin, each receiving the plugin API from getPluginAPI()
 *  - disabled plugins and plugins without a source are skipped
 *  - getPluginAPI() is resolved once per load
 *  - the window "plugin-changed" event re-runs the full load (re-invoke +
 *    re-execute)
 *  - the event listener is removed when the hook unmounts
 *  - a failed load surfaces as a console warning without crashing the page
 */
import { invoke } from "@tauri-apps/api/core"
import { getPluginAPI, sandboxExecutePlugin } from "@world-office/editor-common"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePlugins } from "../hooks/usePlugins"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

vi.mock("@world-office/editor-common", () => ({
  getPluginAPI: vi.fn(),
  sandboxExecutePlugin: vi.fn(),
}))

const mockedInvoke = vi.mocked(invoke)
const mockedGetPluginAPI = vi.mocked(getPluginAPI)
const mockedSandboxExecutePlugin = vi.mocked(sandboxExecutePlugin)

interface Plugin {
  id: string
  name: string
  enabled: boolean
  source: string
}

function plugin(overrides: Partial<Plugin>): Plugin {
  return {
    id: "p1",
    name: "Plugin One",
    enabled: true,
    source: "api.ui.showToast('hi')",
    ...overrides,
  }
}

// ────────────────────────────────────────────────────────────────────────
// Minimal hook harness: no @testing-library — a probe component mounts the
// hook so its effect (and the window listeners) are installed.
// ────────────────────────────────────────────────────────────────────────

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []

function mountHook(): void {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  function Probe() {
    usePlugins()
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

/** Let the dynamic import + invoke promise chains settle. */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  ;(window as unknown as Record<string, unknown>).__TAURI__ = undefined
  vi.clearAllMocks()
})

afterEach(() => {
  unmountAll()
  ;(window as unknown as Record<string, unknown>).__TAURI__ = undefined
})

describe("usePlugins — web context guard", () => {
  it("skips plugin loading entirely without a Tauri runtime", async () => {
    mountHook()
    await flushAsync()

    expect(mockedInvoke).not.toHaveBeenCalled()
    expect(mockedGetPluginAPI).not.toHaveBeenCalled()
    expect(mockedSandboxExecutePlugin).not.toHaveBeenCalled()
  })

  it("installs no plugin-changed listener without a Tauri runtime", async () => {
    mountHook()
    await flushAsync()

    window.dispatchEvent(new Event("plugin-changed"))
    await flushAsync()

    expect(mockedInvoke).not.toHaveBeenCalled()
    expect(mockedSandboxExecutePlugin).not.toHaveBeenCalled()
  })
})

describe("usePlugins — desktop load lifecycle", () => {
  it("invokes get_plugins and executes every enabled plugin with a source", async () => {
    ;(window as unknown as Record<string, unknown>).__TAURI__ = true
    const api = { marker: "api" } as never
    mockedGetPluginAPI.mockReturnValue(api)
    mockedInvoke.mockResolvedValue([
      plugin({ id: "a", source: "source-a" }),
      plugin({ id: "b", source: "source-b" }),
    ])

    mountHook()
    await flushAsync()

    expect(mockedInvoke).toHaveBeenCalledTimes(1)
    expect(mockedInvoke).toHaveBeenCalledWith("get_plugins")
    expect(mockedGetPluginAPI).toHaveBeenCalledTimes(1)
    expect(mockedSandboxExecutePlugin).toHaveBeenCalledTimes(2)
    expect(mockedSandboxExecutePlugin).toHaveBeenCalledWith("source-a", api)
    expect(mockedSandboxExecutePlugin).toHaveBeenCalledWith("source-b", api)
  })

  it("skips disabled plugins and plugins without a source", async () => {
    ;(window as unknown as Record<string, unknown>).__TAURI__ = true
    mockedInvoke.mockResolvedValue([
      plugin({ id: "on", enabled: true, source: "s-on" }),
      plugin({ id: "off", enabled: false, source: "s-off" }),
      plugin({ id: "nosrc", enabled: true, source: "" }),
      plugin({ id: "off-nosrc", enabled: false, source: "" }),
    ])

    mountHook()
    await flushAsync()

    expect(mockedSandboxExecutePlugin).toHaveBeenCalledTimes(1)
    expect(mockedSandboxExecutePlugin).toHaveBeenCalledWith("s-on", expect.anything())
  })

  it("executes nothing for an empty plugin list but still resolves the API", async () => {
    ;(window as unknown as Record<string, unknown>).__TAURI__ = true
    mockedInvoke.mockResolvedValue([])

    mountHook()
    await flushAsync()

    expect(mockedInvoke).toHaveBeenCalledWith("get_plugins")
    expect(mockedGetPluginAPI).toHaveBeenCalledTimes(1)
    expect(mockedSandboxExecutePlugin).not.toHaveBeenCalled()
  })

  it("reloads plugins when the window plugin-changed event fires", async () => {
    ;(window as unknown as Record<string, unknown>).__TAURI__ = true
    mockedInvoke.mockResolvedValue([plugin({ id: "a", source: "src-a" })])

    mountHook()
    await flushAsync()
    expect(mockedInvoke).toHaveBeenCalledTimes(1)
    expect(mockedSandboxExecutePlugin).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event("plugin-changed"))
    await flushAsync()

    expect(mockedInvoke).toHaveBeenCalledTimes(2)
    expect(mockedSandboxExecutePlugin).toHaveBeenCalledTimes(2)
  })

  it("removes the plugin-changed listener on unmount", async () => {
    ;(window as unknown as Record<string, unknown>).__TAURI__ = true
    mockedInvoke.mockResolvedValue([plugin({ id: "a", source: "src-a" })])

    mountHook()
    await flushAsync()
    expect(mockedInvoke).toHaveBeenCalledTimes(1)

    unmountAll()

    window.dispatchEvent(new Event("plugin-changed"))
    await flushAsync()

    expect(mockedInvoke).toHaveBeenCalledTimes(1)
    expect(mockedSandboxExecutePlugin).toHaveBeenCalledTimes(1)
  })

  it("turns a backend failure into a console warning without crashing", async () => {
    ;(window as unknown as Record<string, unknown>).__TAURI__ = true
    mockedInvoke.mockRejectedValue(new Error("get_plugins failed"))
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    mountHook()
    await flushAsync()

    expect(warnSpy).toHaveBeenCalled()
    expect(mockedSandboxExecutePlugin).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
