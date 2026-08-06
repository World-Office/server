/**
 * LocalStorage utility tests — traditional unit tests for the ILocalStorage
 * implementation with in-memory fallback.
 */
import { beforeEach, describe, expect, it } from "vitest"
import { localStorage } from "../utils/local-storage"

describe("LocalStorage", () => {
  beforeEach(() => {
    // Clear all items before each test
    const keys = ["test-key-1", "test-key-2", "test-key-3", "test-bool", "test-int"]
    for (const key of keys) {
      localStorage.removeItem(key)
    }
  })

  it("setItem and getItem roundtrip", () => {
    localStorage.setItem("test-key-1", "hello")
    expect(localStorage.getItem("test-key-1")).toBe("hello")
  })

  it("getItem returns null for missing key", () => {
    expect(localStorage.getItem("nonexistent-key")).toBeNull()
  })

  it("setItem overwrites existing value", () => {
    localStorage.setItem("test-key-1", "first")
    localStorage.setItem("test-key-1", "second")
    expect(localStorage.getItem("test-key-1")).toBe("second")
  })

  it("setBool and getBool roundtrip", () => {
    localStorage.setBool("test-bool", true)
    expect(localStorage.getBool("test-bool")).toBe(true)
    localStorage.setBool("test-bool", false)
    expect(localStorage.getBool("test-bool")).toBe(false)
  })

  it("getBool returns default for missing key", () => {
    expect(localStorage.getBool("nonexistent-bool")).toBe(false)
    expect(localStorage.getBool("nonexistent-bool", true)).toBe(true)
  })

  it("getItemAsInt returns parsed integer", () => {
    localStorage.setItem("test-int", "42")
    expect(localStorage.getItemAsInt("test-int")).toBe(42)
  })

  it("getItemAsInt returns default for missing key", () => {
    expect(localStorage.getItemAsInt("nonexistent-int")).toBe(0)
    expect(localStorage.getItemAsInt("nonexistent-int", 99)).toBe(99)
  })

  it("removeItem deletes key", () => {
    localStorage.setItem("test-key-1", "value")
    localStorage.removeItem("test-key-1")
    expect(localStorage.getItem("test-key-1")).toBeNull()
  })

  it("removeItem on nonexistent key does not throw", () => {
    expect(() => localStorage.removeItem("nonexistent")).not.toThrow()
  })

  it("itemExists returns true for existing key", () => {
    localStorage.setItem("test-key-1", "value")
    expect(localStorage.itemExists("test-key-1")).toBe(true)
  })

  it("itemExists returns false for missing key", () => {
    expect(localStorage.itemExists("nonexistent")).toBe(false)
  })

  it("setBool stores as '1' or '0'", () => {
    localStorage.setBool("test-bool", true)
    expect(localStorage.getItem("test-bool")).toBe("1")
    localStorage.setBool("test-bool", false)
    expect(localStorage.getItem("test-bool")).toBe("0")
  })

  it("handles empty string value", () => {
    localStorage.setItem("test-key-1", "")
    expect(localStorage.getItem("test-key-1")).toBe("")
    expect(localStorage.itemExists("test-key-1")).toBe(true)
  })

  it("handles special characters in value", () => {
    localStorage.setItem("test-key-1", 'hello <world> & "friends"')
    expect(localStorage.getItem("test-key-1")).toBe('hello <world> & "friends"')
  })

  it("handles JSON string value", () => {
    const json = JSON.stringify({ a: 1, b: [2, 3] })
    localStorage.setItem("test-key-1", json)
    expect(localStorage.getItem("test-key-1")).toBe(json)
    const stored = localStorage.getItem("test-key-1")
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored ?? "{}")).toEqual({ a: 1, b: [2, 3] })
  })

  it("getItemAsInt handles invalid integer", () => {
    localStorage.setItem("test-int", "not-a-number")
    expect(Number.isNaN(localStorage.getItemAsInt("test-int"))).toBe(true)
  })

  it("sync() does not throw", () => {
    expect(() => localStorage.sync()).not.toThrow()
  })

  it("save() does not throw", () => {
    expect(() => localStorage.save()).not.toThrow()
  })
})
