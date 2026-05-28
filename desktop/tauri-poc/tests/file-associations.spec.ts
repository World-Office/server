import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { resolve } from "path"

describe("File Associations", () => {
  const tauriConfPath = resolve(__dirname, "../src-tauri/tauri.conf.json")
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"))

  it("should have withGlobalTauri set to true", () => {
    expect(tauriConf.app.withGlobalTauri).toBe(true)
  })

  it("should have bundle.active set to true", () => {
    expect(tauriConf.bundle.active).toBe(true)
  })

  it("should have Office as bundle category", () => {
    expect(tauriConf.bundle.category).toBe("Office")
  })
})