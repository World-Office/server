import { describe, it, expect } from "vitest"

describe("Plugin Settings", () => {
  it("should have the required plugin fields", () => {
    const plugin = {
      id: "test-plugin",
      name: "Test Plugin",
      description: "A test plugin",
      enabled: true,
      source: "local"
    }

    expect(plugin).toHaveProperty("id")
    expect(plugin).toHaveProperty("name")
    expect(plugin).toHaveProperty("description")
    expect(plugin).toHaveProperty("enabled")
    expect(plugin).toHaveProperty("source")

    expect(typeof plugin.id).toBe("string")
    expect(typeof plugin.name).toBe("string")
    expect(typeof plugin.description).toBe("string")
    expect(typeof plugin.enabled).toBe("boolean")
    expect(typeof plugin.source).toBe("string")
  })
})