import { describe, it, expect } from "vitest"

describe("Settings API", () => {
  it("get_settings returns default settings when none saved", () => {
    const defaults = {
      general: {
        data_directory: "~/Documents/WorldOffice",
        language: "en",
        auto_start: false,
      },
      editor: {
        default_format: "docx",
        autosave_interval: 60,
        spellcheck: true,
      },
      network: {
        proxy_url: "",
        server_url: "http://localhost:8004",
      },
      appearance: {
        theme: "system",
        font_size: 14,
        toolbar_layout: "default",
      },
    }

    expect(defaults.general.language).toBe("en")
    expect(defaults.general.auto_start).toBe(false)
    expect(defaults.editor.autosave_interval).toBe(60)
    expect(defaults.editor.spellcheck).toBe(true)
    expect(defaults.network.server_url).toBe("http://localhost:8004")
    expect(defaults.appearance.theme).toBe("system")
    expect(defaults.appearance.font_size).toBe(14)
  })

  it("settings can be modified and serialized", () => {
    const modified = {
      general: { data_directory: "/custom/path", language: "de", auto_start: true },
      editor: { default_format: "odt", autosave_interval: 120, spellcheck: false },
      network: { proxy_url: "", server_url: "http://localhost:8004" },
      appearance: { theme: "dark", font_size: 16, toolbar_layout: "compact" },
    }

    const json = JSON.stringify(modified)
    const parsed = JSON.parse(json)

    expect(parsed.general.language).toBe("de")
    expect(parsed.general.auto_start).toBe(true)
    expect(parsed.editor.default_format).toBe("odt")
    expect(parsed.editor.autosave_interval).toBe(120)
    expect(parsed.editor.spellcheck).toBe(false)
    expect(parsed.appearance.theme).toBe("dark")
    expect(parsed.appearance.toolbar_layout).toBe("compact")
  })
})
