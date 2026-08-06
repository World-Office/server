/**
 * Metric unit conversion tests — traditional + property-based roundtrip tests.
 */
import { describe, expect, it } from "vitest"
import {
  MetricUnit,
  cmToMm,
  fromMillimeters,
  inchToMm,
  mmToCm,
  mmToInch,
  mmToPt,
  mmToTwip,
  ptToMm,
  ptToTwip,
  toMillimeters,
  twipToMm,
  twipToPt,
} from "../utils/metric"

// ── toMillimeters ──────────────────────────────────────────────────────

describe("toMillimeters", () => {
  it("converts centimeters to millimeters", () => {
    expect(toMillimeters(1, MetricUnit.Centimeter)).toBe(10)
    expect(toMillimeters(2.5, MetricUnit.Centimeter)).toBe(25)
    expect(toMillimeters(0, MetricUnit.Centimeter)).toBe(0)
  })

  it("converts points to millimeters", () => {
    expect(toMillimeters(72, MetricUnit.Point)).toBeCloseTo(25.4, 5)
    expect(toMillimeters(36, MetricUnit.Point)).toBeCloseTo(12.7, 5)
    expect(toMillimeters(0, MetricUnit.Point)).toBe(0)
  })

  it("converts inches to millimeters", () => {
    expect(toMillimeters(1, MetricUnit.Inch)).toBeCloseTo(25.4, 5)
    expect(toMillimeters(2, MetricUnit.Inch)).toBeCloseTo(50.8, 5)
    expect(toMillimeters(0, MetricUnit.Inch)).toBe(0)
  })

  it("returns value as-is for unknown unit", () => {
    expect(toMillimeters(42, 99 as MetricUnit)).toBe(42)
  })
})

// ── fromMillimeters ────────────────────────────────────────────────────

describe("fromMillimeters", () => {
  it("converts millimeters to centimeters", () => {
    expect(fromMillimeters(10, MetricUnit.Centimeter)).toBe(1)
    expect(fromMillimeters(25, MetricUnit.Centimeter)).toBe(2.5)
    expect(fromMillimeters(0, MetricUnit.Centimeter)).toBe(0)
  })

  it("converts millimeters to points", () => {
    expect(fromMillimeters(25.4, MetricUnit.Point)).toBeCloseTo(72, 1)
    expect(fromMillimeters(12.7, MetricUnit.Point)).toBeCloseTo(36, 1)
    expect(fromMillimeters(0, MetricUnit.Point)).toBe(0)
  })

  it("converts millimeters to inches", () => {
    expect(fromMillimeters(25.4, MetricUnit.Inch)).toBeCloseTo(1, 3)
    expect(fromMillimeters(50.8, MetricUnit.Inch)).toBeCloseTo(2, 3)
    expect(fromMillimeters(0, MetricUnit.Inch)).toBe(0)
  })

  it("returns value as-is for unknown unit", () => {
    expect(fromMillimeters(42, 99 as MetricUnit)).toBe(42)
  })
})

// ── Direct conversion functions ────────────────────────────────────────

describe("cmToMm", () => {
  it("converts cm to mm", () => {
    expect(cmToMm(1)).toBe(10)
    expect(cmToMm(5)).toBe(50)
    expect(cmToMm(0)).toBe(0)
  })
})

describe("mmToCm", () => {
  it("converts mm to cm", () => {
    expect(mmToCm(10)).toBe(1)
    expect(mmToCm(50)).toBe(5)
    expect(mmToCm(0)).toBe(0)
  })
})

describe("ptToMm", () => {
  it("converts pt to mm", () => {
    expect(ptToMm(72)).toBeCloseTo(25.4, 5)
    expect(ptToMm(1)).toBeCloseTo(0.3528, 3)
    expect(ptToMm(0)).toBe(0)
  })
})

describe("mmToPt", () => {
  it("converts mm to pt", () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 1)
    expect(mmToPt(1)).toBeCloseTo(2.835, 2)
    expect(mmToPt(0)).toBe(0)
  })
})

describe("inchToMm", () => {
  it("converts inch to mm", () => {
    expect(inchToMm(1)).toBeCloseTo(25.4, 5)
    expect(inchToMm(8.5)).toBeCloseTo(215.9, 1)
    expect(inchToMm(0)).toBe(0)
  })
})

describe("mmToInch", () => {
  it("converts mm to inch", () => {
    expect(mmToInch(25.4)).toBeCloseTo(1, 3)
    expect(mmToInch(215.9)).toBeCloseTo(8.5, 1)
    expect(mmToInch(0)).toBe(0)
  })
})

describe("twipToPt", () => {
  it("converts twips to points (1 twip = 1/20 pt)", () => {
    expect(twipToPt(20)).toBe(1)
    expect(twipToPt(1440)).toBe(72)
    expect(twipToPt(0)).toBe(0)
  })
})

describe("ptToTwip", () => {
  it("converts points to twips (1 pt = 20 twips)", () => {
    expect(ptToTwip(1)).toBe(20)
    expect(ptToTwip(72)).toBe(1440)
    expect(ptToTwip(0)).toBe(0)
  })
})

describe("twipToMm", () => {
  it("converts twips to mm", () => {
    expect(twipToMm(1440)).toBeCloseTo(25.4, 5)
    expect(twipToMm(0)).toBe(0)
  })
})

describe("mmToTwip", () => {
  it("converts mm to twips", () => {
    expect(mmToTwip(25.4)).toBeCloseTo(1440, 0)
    expect(mmToTwip(0)).toBe(0)
  })
})

// ── Property-based roundtrip tests ─────────────────────────────────────

describe("Metric roundtrip properties", () => {
  it("mm → cm → mm preserves value", () => {
    for (let i = 0; i < 100; i++) {
      const mm = Math.random() * 1000
      const cm = mmToCm(mm)
      const back = cmToMm(cm)
      expect(Math.abs(back - mm)).toBeLessThan(0.0001)
    }
  })

  it("mm → pt → mm preserves value (within tolerance)", () => {
    for (let i = 0; i < 100; i++) {
      const mm = Math.random() * 1000
      const pt = mmToPt(mm)
      const back = ptToMm(pt)
      expect(Math.abs(back - mm)).toBeLessThan(0.001)
    }
  })

  it("mm → inch → mm preserves value (within tolerance)", () => {
    for (let i = 0; i < 100; i++) {
      const mm = Math.random() * 1000
      const inch = mmToInch(mm)
      const back = inchToMm(inch)
      expect(Math.abs(back - mm)).toBeLessThan(0.001)
    }
  })

  it("mm → twip → mm preserves value (within tolerance)", () => {
    for (let i = 0; i < 100; i++) {
      const mm = Math.random() * 1000
      const twip = mmToTwip(mm)
      const back = twipToMm(twip)
      expect(Math.abs(back - mm)).toBeLessThan(0.01)
    }
  })

  it("pt → twip → pt preserves value exactly", () => {
    for (let i = 0; i < 100; i++) {
      const pt = Math.random() * 1000
      const twip = ptToTwip(pt)
      const back = twipToPt(twip)
      expect(Math.abs(back - pt)).toBeLessThan(0.0001)
    }
  })

  it("toMillimeters → fromMillimeters roundtrip for cm", () => {
    for (let i = 0; i < 100; i++) {
      const cm = Math.random() * 100
      const mm = toMillimeters(cm, MetricUnit.Centimeter)
      const back = fromMillimeters(mm, MetricUnit.Centimeter)
      expect(Math.abs(back - cm)).toBeLessThan(0.0001)
    }
  })

  it("toMillimeters → fromMillimeters roundtrip for pt", () => {
    for (let i = 0; i < 100; i++) {
      const pt = Math.random() * 100
      const mm = toMillimeters(pt, MetricUnit.Point)
      const back = fromMillimeters(mm, MetricUnit.Point)
      expect(Math.abs(back - pt)).toBeLessThan(0.001)
    }
  })

  it("toMillimeters → fromMillimeters roundtrip for inch", () => {
    for (let i = 0; i < 100; i++) {
      const inch = Math.random() * 10
      const mm = toMillimeters(inch, MetricUnit.Inch)
      const back = fromMillimeters(mm, MetricUnit.Inch)
      expect(Math.abs(back - inch)).toBeLessThan(0.001)
    }
  })
})

// ── Edge cases ─────────────────────────────────────────────────────────

describe("Metric edge cases", () => {
  it("handles zero for all conversions", () => {
    expect(toMillimeters(0, MetricUnit.Centimeter)).toBe(0)
    expect(toMillimeters(0, MetricUnit.Point)).toBe(0)
    expect(toMillimeters(0, MetricUnit.Inch)).toBe(0)
    expect(fromMillimeters(0, MetricUnit.Centimeter)).toBe(0)
    expect(fromMillimeters(0, MetricUnit.Point)).toBe(0)
    expect(fromMillimeters(0, MetricUnit.Inch)).toBe(0)
  })

  it("handles negative values", () => {
    expect(toMillimeters(-1, MetricUnit.Centimeter)).toBe(-10)
    expect(toMillimeters(-72, MetricUnit.Point)).toBeCloseTo(-25.4, 5)
    expect(fromMillimeters(-25.4, MetricUnit.Inch)).toBeCloseTo(-1, 3)
  })

  it("handles very large values", () => {
    expect(toMillimeters(1000, MetricUnit.Centimeter)).toBe(10000)
    expect(fromMillimeters(10000, MetricUnit.Centimeter)).toBe(1000)
  })

  it("handles very small values (fractional)", () => {
    expect(toMillimeters(0.1, MetricUnit.Centimeter)).toBeCloseTo(1, 10)
    expect(toMillimeters(0.5, MetricUnit.Point)).toBeCloseTo(0.1764, 3)
  })

  it("standard paper sizes round-trip correctly", () => {
    // A4: 210mm × 297mm
    const a4WidthMm = 210
    const a4HeightMm = 297
    // Convert to inches and back
    const wInch = mmToInch(a4WidthMm)
    const hInch = mmToInch(a4HeightMm)
    expect(inchToMm(wInch)).toBeCloseTo(a4WidthMm, 1)
    expect(inchToMm(hInch)).toBeCloseTo(a4HeightMm, 1)
    // Convert to points and back
    const wPt = mmToPt(a4WidthMm)
    const hPt = mmToPt(a4HeightMm)
    expect(ptToMm(wPt)).toBeCloseTo(a4WidthMm, 1)
    expect(ptToMm(hPt)).toBeCloseTo(a4HeightMm, 1)
  })
})
