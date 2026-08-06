/**
 * Caption node tests — tests CAPTION_LABELS, CAPTION_COLORS, and CaptionType.
 */
import { describe, expect, it } from "vitest"
import { CAPTION_COLORS, CAPTION_LABELS, type CaptionType } from "../lib/caption"

// ── CAPTION_LABELS ─────────────────────────────────────────────────────

describe("CAPTION_LABELS", () => {
  it("figure → Figure", () => {
    expect(CAPTION_LABELS.figure).toBe("Figure")
  })

  it("table → Table", () => {
    expect(CAPTION_LABELS.table).toBe("Table")
  })

  it("equation → Equation", () => {
    expect(CAPTION_LABELS.equation).toBe("Equation")
  })

  it("listing → Listing", () => {
    expect(CAPTION_LABELS.listing).toBe("Listing")
  })

  it("has exactly 4 caption types", () => {
    expect(Object.keys(CAPTION_LABELS)).toHaveLength(4)
  })

  it("all labels are non-empty strings", () => {
    for (const key of Object.keys(CAPTION_LABELS)) {
      const label = CAPTION_LABELS[key as CaptionType]
      expect(typeof label).toBe("string")
      expect(label.length).toBeGreaterThan(0)
    }
  })
})

// ── CAPTION_COLORS ─────────────────────────────────────────────────────

describe("CAPTION_COLORS", () => {
  it("figure has a color", () => {
    expect(CAPTION_COLORS.figure).toBeDefined()
    expect(CAPTION_COLORS.figure).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it("table has a color", () => {
    expect(CAPTION_COLORS.table).toBeDefined()
    expect(CAPTION_COLORS.table).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it("equation has a color", () => {
    expect(CAPTION_COLORS.equation).toBeDefined()
    expect(CAPTION_COLORS.equation).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it("listing has a color", () => {
    expect(CAPTION_COLORS.listing).toBeDefined()
    expect(CAPTION_COLORS.listing).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it("each type has a distinct color", () => {
    const colors = new Set(Object.values(CAPTION_COLORS))
    expect(colors.size).toBe(4)
  })
})

// ── CaptionType ────────────────────────────────────────────────────────

describe("CaptionType", () => {
  it("all caption types are valid string literals", () => {
    const types: CaptionType[] = ["figure", "table", "equation", "listing"]
    for (const t of types) {
      expect(typeof t).toBe("string")
    }
  })
})
