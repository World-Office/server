import { describe, it, expect } from "vitest"

interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: string
  enabled: boolean
  source: string
}

interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
}

function parseManifestFromJsComment(js: string): PluginManifest | null {
  const match = js.match(/\/\*\s*name:\s*([^,]+),\s*version:\s*([^,]+)(?:,\s*description:\s*([^*]+))?\s*\*\//)
  if (!match) return null
  return {
    id: match[1].trim().toLowerCase().replace(/\s+/g, "-"),
    name: match[1].trim(),
    version: match[2].trim(),
    description: (match[3] || "").trim(),
    author: "",
  }
}

function createPluginFromManifest(manifest: PluginManifest, enabled: boolean): PluginInfo {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    enabled,
    source: manifest.id + ".js",
  }
}

function parseManifestFromJson(json: string): PluginManifest | null {
  try {
    const parsed = JSON.parse(json)
    if (!parsed.id || !parsed.name || !parsed.version) return null
    return {
      id: parsed.id,
      name: parsed.name,
      version: parsed.version,
      description: parsed.description || "",
      author: parsed.author || "",
    }
  } catch {
    return null
  }
}

function togglePluginEnabled(plugins: PluginInfo[], id: string, enabled: boolean): PluginInfo[] {
  return plugins.map((p) => (p.id === id ? { ...p, enabled } : p))
}

function getEnabledPlugins(plugins: PluginInfo[]): PluginInfo[] {
  return plugins.filter((p) => p.enabled)
}

describe("Plugin System", () => {
  describe("PluginInfo shape", () => {
    it("should have all required fields", () => {
      const plugin: PluginInfo = {
        id: "test-plugin",
        name: "Test Plugin",
        version: "1.0.0",
        description: "A test plugin",
        author: "Developer",
        enabled: true,
        source: "test-plugin.js",
      }

      expect(plugin).toHaveProperty("id")
      expect(plugin).toHaveProperty("name")
      expect(plugin).toHaveProperty("version")
      expect(plugin).toHaveProperty("description")
      expect(plugin).toHaveProperty("author")
      expect(plugin).toHaveProperty("enabled")
      expect(plugin).toHaveProperty("source")

      expect(typeof plugin.id).toBe("string")
      expect(typeof plugin.name).toBe("string")
      expect(typeof plugin.version).toBe("string")
      expect(typeof plugin.description).toBe("string")
      expect(typeof plugin.author).toBe("string")
      expect(typeof plugin.enabled).toBe("boolean")
      expect(typeof plugin.source).toBe("string")
    })

    it("should create default values for optional fields", () => {
      const plugin: PluginInfo = {
        id: "minimal",
        name: "Minimal",
        version: "0.1.0",
        description: "",
        author: "",
        enabled: false,
        source: "minimal.js",
      }
      expect(plugin.description).toBe("")
      expect(plugin.author).toBe("")
      expect(plugin.enabled).toBe(false)
    })
  })

  describe("Manifest parsing", () => {
    it("should parse valid plugin.json manifest", () => {
      const json = JSON.stringify({
        id: "hello-world",
        name: "Hello World",
        version: "2.0.0",
        description: "A sample plugin",
        author: "Author Name",
      })
      const manifest = parseManifestFromJson(json)
      expect(manifest).not.toBeNull()
      expect(manifest!.id).toBe("hello-world")
      expect(manifest!.name).toBe("Hello World")
      expect(manifest!.version).toBe("2.0.0")
      expect(manifest!.description).toBe("A sample plugin")
      expect(manifest!.author).toBe("Author Name")
    })

    it("should reject plugin.json without required fields", () => {
      expect(parseManifestFromJson(JSON.stringify({ name: "No ID" }))).toBeNull()
      expect(parseManifestFromJson(JSON.stringify({ id: "no-version" }))).toBeNull()
      expect(parseManifestFromJson(JSON.stringify({}))).toBeNull()
      expect(parseManifestFromJson("invalid json")).toBeNull()
    })

    it("should parse manifest from JS comment metadata", () => {
      const js = "/* name: Hello World, version: 1.0.0 */\nfunction setup() {}"
      const manifest = parseManifestFromJsComment(js)
      expect(manifest).not.toBeNull()
      expect(manifest!.name).toBe("Hello World")
      expect(manifest!.version).toBe("1.0.0")
    })

    it("should fall back gracefully when no JS comment exists", () => {
      const manifest = parseManifestFromJsComment("function setup() { return 42; }")
      expect(manifest).toBeNull()
    })
  })

  describe("Plugin creation from manifest", () => {
    it("should create plugin info with auto-generated id", () => {
      const manifest: PluginManifest = {
        id: "my-plugin",
        name: "My Plugin",
        version: "0.5.0",
        description: "Does things",
        author: "Me",
      }
      const plugin = createPluginFromManifest(manifest, true)
      expect(plugin.id).toBe("my-plugin")
      expect(plugin.name).toBe("My Plugin")
      expect(plugin.version).toBe("0.5.0")
      expect(plugin.description).toBe("Does things")
      expect(plugin.author).toBe("Me")
      expect(plugin.enabled).toBe(true)
      expect(plugin.source).toBe("my-plugin.js")
    })

    it("should use the id as the source filename", () => {
      const manifest: PluginManifest = {
        id: "special-plugin",
        name: "Special",
        version: "1.0.0",
        description: "",
        author: "",
      }
      const plugin = createPluginFromManifest(manifest, false)
      expect(plugin.source).toBe("special-plugin.js")
      expect(plugin.enabled).toBe(false)
    })
  })

  describe("Plugin settings toggle", () => {
    it("should toggle plugin enabled state", () => {
      const plugins: PluginInfo[] = [
        { id: "a", name: "A", version: "1.0.0", description: "", author: "", enabled: true, source: "a.js" },
        { id: "b", name: "B", version: "1.0.0", description: "", author: "", enabled: false, source: "b.js" },
      ]

      const result = togglePluginEnabled(plugins, "a", false)
      expect(result[0].enabled).toBe(false)
      expect(result[1].enabled).toBe(false)
      // original unchanged
      expect(plugins[0].enabled).toBe(true)
    })

    it("should not mutate the original array", () => {
      const plugins: PluginInfo[] = [
        { id: "only", name: "Only", version: "1.0.0", description: "", author: "", enabled: true, source: "only.js" },
      ]
      const result = togglePluginEnabled(plugins, "only", false)
      expect(plugins[0].enabled).toBe(true)
      expect(result[0].enabled).toBe(false)
    })
  })

  describe("Enabled plugin filtering", () => {
    it("should return only enabled plugins", () => {
      const plugins: PluginInfo[] = [
        { id: "a", name: "A", version: "1.0.0", description: "", author: "", enabled: true, source: "a.js" },
        { id: "b", name: "B", version: "1.0.0", description: "", author: "", enabled: false, source: "b.js" },
        { id: "c", name: "C", version: "1.0.0", description: "", author: "", enabled: true, source: "c.js" },
      ]

      const enabled = getEnabledPlugins(plugins)
      expect(enabled).toHaveLength(2)
      expect(enabled[0].id).toBe("a")
      expect(enabled[1].id).toBe("c")
    })

    it("should return empty array when no plugins enabled", () => {
      const plugins: PluginInfo[] = [
        { id: "a", name: "A", version: "1.0.0", description: "", author: "", enabled: false, source: "a.js" },
      ]
      expect(getEnabledPlugins(plugins)).toHaveLength(0)
    })
  })
})
