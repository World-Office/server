import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { spawn, type ChildProcess } from "child_process"
import { resolve } from "path"
import { existsSync } from "fs"

const APP_PATH = resolve(__dirname, "../src-tauri/target/release/world-office-desktop")
const HAS_DISPLAY = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)

if (!existsSync(APP_PATH) || !HAS_DISPLAY) {
  describe.skip("Desktop App", () => {
    // Placeholder test to keep the describe block valid
    it("should be skipped", () => {
      // This test will be skipped because the describe is skipped.
    });
  });
} else {
  let app: ChildProcess
  describe("Desktop App", () => {
    beforeAll(async () => {
      app = spawn(APP_PATH, [], {
        env: { ...process.env, WINIT_UNIX_BACKEND: "x11" },
      })

      await new Promise((r) => setTimeout(r, 3000))
    }, 15000)

    afterAll(() => {
      if (app && !app.killed) {
        app.kill()
      }
    })

    it("should launch without crashing", () => {
      expect(app.exitCode).toBeNull()
    })

    it("should have a running process", () => {
      expect(app.pid).toBeDefined()
    })
  });
}
