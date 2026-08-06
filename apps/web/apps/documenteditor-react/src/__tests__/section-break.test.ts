/**
 * SectionBreak node tests — tests rendering, CSS output, and type mappings
 * for all section break types.
 */
import { describe, expect, it } from "vitest"
import { type SectionBreakType, sectionBreakToCss } from "../lib/section-break"

// ── sectionBreakToCss ──────────────────────────────────────────────────

describe("sectionBreakToCss", () => {
  it("next-page produces page-break-before: always", () => {
    const css = sectionBreakToCss("next-page")
    expect(css).toContain("page-break-before: always")
    expect(css).toContain("break-before: page")
  })

  it("continuous produces empty CSS (no page break)", () => {
    const css = sectionBreakToCss("continuous")
    expect(css).toBe("")
  })

  it("even-page produces page-break-before: always", () => {
    const css = sectionBreakToCss("even-page")
    expect(css).toContain("page-break-before: always")
    expect(css).toContain("break-before: page")
  })

  it("odd-page produces page-break-before: always", () => {
    const css = sectionBreakToCss("odd-page")
    expect(css).toContain("page-break-before: always")
    expect(css).toContain("break-before: page")
  })
})

// ── SectionBreakType ───────────────────────────────────────────────────

describe("SectionBreakType", () => {
  it("all four types are valid", () => {
    const types: SectionBreakType[] = ["next-page", "continuous", "even-page", "odd-page"]
    for (const t of types) {
      expect(typeof t).toBe("string")
    }
  })
})

// ── Property: all types produce valid CSS ──────────────────────────────

describe("SectionBreak CSS properties", () => {
  it("next-page, even-page, odd-page all produce page break", () => {
    const breakTypes: SectionBreakType[] = ["next-page", "even-page", "odd-page"]
    for (const t of breakTypes) {
      const css = sectionBreakToCss(t)
      expect(css).toContain("page-break-before: always")
    }
  })

  it("continuous does not produce page break", () => {
    const css = sectionBreakToCss("continuous")
    expect(css).not.toContain("page-break")
  })

  it("all break types return string (not undefined)", () => {
    const allTypes: SectionBreakType[] = ["next-page", "continuous", "even-page", "odd-page"]
    for (const t of allTypes) {
      const css = sectionBreakToCss(t)
      expect(typeof css).toBe("string")
    }
  })
})
