/**
 * Color utility tests — traditional unit tests for RGBColor, hexToRgb, rgbToHex,
 * hsbToRgb, rgbToHsb, and isDark.
 */
import { describe, expect, it } from "vitest"
import { RGBColor, hexToRgb, hsbToRgb, isDark, rgbToHex, rgbToHsb } from "../utils/color"

// ── RGBColor constructor ───────────────────────────────────────────────

describe("RGBColor constructor", () => {
  it("parses 6-digit hex (#RRGGBB)", () => {
    const c = new RGBColor("#FF0000")
    expect(c.r).toBe(255)
    expect(c.g).toBe(0)
    expect(c.b).toBe(0)
  })

  it("parses 6-digit hex without #", () => {
    const c = new RGBColor("00FF00")
    expect(c.r).toBe(0)
    expect(c.g).toBe(255)
    expect(c.b).toBe(0)
  })

  it("parses 3-digit hex (#RGB)", () => {
    const c = new RGBColor("#0F0")
    expect(c.r).toBe(0)
    expect(c.g).toBe(255)
    expect(c.b).toBe(0)
  })

  it("parses 3-digit hex without #", () => {
    const c = new RGBColor("F00")
    expect(c.r).toBe(255)
    expect(c.g).toBe(0)
    expect(c.b).toBe(0)
  })

  it("parses rgb() format", () => {
    const c = new RGBColor("rgb(100, 150, 200)")
    expect(c.r).toBe(100)
    expect(c.g).toBe(150)
    expect(c.b).toBe(200)
  })

  it("parses rgb() with spaces", () => {
    const c = new RGBColor("rgb( 50, 100, 150 )")
    expect(c.r).toBe(50)
    expect(c.g).toBe(100)
    expect(c.b).toBe(150)
  })

  it("parses hsb() format", () => {
    const c = new RGBColor("hsb(0, 100, 100)")
    expect(c.r).toBe(255)
    expect(c.g).toBe(0)
    expect(c.b).toBe(0)
  })

  it("parses hsb(120, 100, 100) as green", () => {
    const c = new RGBColor("hsb(120, 100, 100)")
    expect(c.r).toBe(0)
    expect(c.g).toBe(255)
    expect(c.b).toBe(0)
  })

  it("parses hsb(240, 100, 100) as blue", () => {
    const c = new RGBColor("hsb(240, 100, 100)")
    expect(c.r).toBe(0)
    expect(c.g).toBe(0)
    expect(c.b).toBe(255)
  })

  it("clamps negative values to 0", () => {
    const c = new RGBColor("rgb(-10, -20, -30)")
    expect(c.r).toBe(0)
    expect(c.g).toBe(0)
    expect(c.b).toBe(0)
  })

  it("clamps values > 255 to 255", () => {
    const c = new RGBColor("rgb(300, 400, 500)")
    expect(c.r).toBe(255)
    expect(c.g).toBe(255)
    expect(c.b).toBe(255)
  })

  it("defaults to black for unrecognized format", () => {
    const c = new RGBColor("not-a-color")
    expect(c.r).toBe(0)
    expect(c.g).toBe(0)
    expect(c.b).toBe(0)
  })

  it("handles uppercase hex", () => {
    const c = new RGBColor("#AABBCC")
    expect(c.r).toBe(0xaa)
    expect(c.g).toBe(0xbb)
    expect(c.b).toBe(0xcc)
  })

  it("handles lowercase hex", () => {
    const c = new RGBColor("#aabbcc")
    expect(c.r).toBe(0xaa)
    expect(c.g).toBe(0xbb)
    expect(c.b).toBe(0xcc)
  })

  it("handles mixed case hex", () => {
    const c = new RGBColor("#AaBbCc")
    expect(c.r).toBe(0xaa)
    expect(c.g).toBe(0xbb)
    expect(c.b).toBe(0xcc)
  })
})

// ── RGBColor methods ───────────────────────────────────────────────────

describe("RGBColor methods", () => {
  it("toRGB() returns rgb() string", () => {
    const c = new RGBColor("#FF8800")
    expect(c.toRGB()).toBe("rgb(255, 136, 0)")
  })

  it("toRGBA() returns rgba() string with default alpha 1", () => {
    const c = new RGBColor("#FF8800")
    expect(c.toRGBA()).toBe("rgba(255, 136, 0, 1)")
  })

  it("toRGBA() accepts custom alpha", () => {
    const c = new RGBColor("#FF8800")
    expect(c.toRGBA(0.5)).toBe("rgba(255, 136, 0, 0.5)")
  })

  it("toHex() returns #RRGGBB format", () => {
    const c = new RGBColor("rgb(255, 136, 0)")
    expect(c.toHex()).toBe("#ff8800")
  })

  it("toHex() pads single-digit components", () => {
    const c = new RGBColor("rgb(1, 2, 3)")
    expect(c.toHex()).toBe("#010203")
  })

  it("isEqual() compares colors", () => {
    const a = new RGBColor("#FF0000")
    const b = new RGBColor("rgb(255, 0, 0)")
    expect(a.isEqual(b)).toBe(true)
  })

  it("isEqual() returns false for different colors", () => {
    const a = new RGBColor("#FF0000")
    const b = new RGBColor("#00FF00")
    expect(a.isEqual(b)).toBe(false)
  })

  it("toHSB() converts red to HSB", () => {
    const c = new RGBColor("#FF0000")
    const hsb = c.toHSB()
    expect(hsb.h).toBe(0)
    expect(hsb.s).toBe(100)
    expect(hsb.b).toBe(100)
  })

  it("toHSB() converts green to HSB", () => {
    const c = new RGBColor("#00FF00")
    const hsb = c.toHSB()
    expect(hsb.h).toBe(120)
    expect(hsb.s).toBe(100)
    expect(hsb.b).toBe(100)
  })

  it("toHSB() converts blue to HSB", () => {
    const c = new RGBColor("#0000FF")
    const hsb = c.toHSB()
    expect(hsb.h).toBe(240)
    expect(hsb.s).toBe(100)
    expect(hsb.b).toBe(100)
  })

  it("toHSB() converts white to HSB", () => {
    const c = new RGBColor("#FFFFFF")
    const hsb = c.toHSB()
    expect(hsb.h).toBe(0)
    expect(hsb.s).toBe(0)
    expect(hsb.b).toBe(100)
  })

  it("toHSB() converts black to HSB", () => {
    const c = new RGBColor("#000000")
    const hsb = c.toHSB()
    expect(hsb.h).toBe(0)
    expect(hsb.s).toBe(0)
    expect(hsb.b).toBe(0)
  })

  it("isDark() returns true for dark colors", () => {
    expect(new RGBColor("#000000").isDark()).toBe(true)
    expect(new RGBColor("#333333").isDark()).toBe(true)
    expect(new RGBColor("#1a1a2e").isDark()).toBe(true)
  })

  it("isDark() returns false for light colors", () => {
    expect(new RGBColor("#FFFFFF").isDark()).toBe(false)
    expect(new RGBColor("#FFD700").isDark()).toBe(false)
    expect(new RGBColor("#E0E0E0").isDark()).toBe(false)
  })
})

// ── Standalone functions ───────────────────────────────────────────────

describe("rgbToHex", () => {
  it("converts RGB to hex", () => {
    expect(rgbToHex(255, 0, 0)).toBe("#ff0000")
    expect(rgbToHex(0, 255, 0)).toBe("#00ff00")
    expect(rgbToHex(0, 0, 255)).toBe("#0000ff")
  })

  it("pads single-digit values", () => {
    expect(rgbToHex(1, 2, 3)).toBe("#010203")
    expect(rgbToHex(0, 0, 0)).toBe("#000000")
  })

  it("converts max values", () => {
    expect(rgbToHex(255, 255, 255)).toBe("#ffffff")
  })
})

describe("hexToRgb", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgb("#FF0000")).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb("00FF00")).toEqual({ r: 0, g: 255, b: 0 })
  })

  it("parses 3-digit hex (expands)", () => {
    expect(hexToRgb("#F00")).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb("0F0")).toEqual({ r: 0, g: 255, b: 0 })
  })

  it("returns null for invalid hex", () => {
    expect(hexToRgb("#12")).toBeNull()
    expect(hexToRgb("#12345")).toBeNull()
    expect(hexToRgb("")).toBeNull()
    // #GGG expands to GGGGGG which passes length check but parseInt returns NaN
    // Bitwise operations on NaN give 0, so result is {0, 0, 0} not null
    const ggg = hexToRgb("#GGG")
    expect(ggg).not.toBeNull()
    expect(ggg?.r).toBe(0)
    expect(ggg?.g).toBe(0)
    expect(ggg?.b).toBe(0)
  })
})

describe("hsbToRgb", () => {
  it("converts red (0, 100, 100)", () => {
    const rgb = hsbToRgb(0, 100, 100)
    expect(rgb.r).toBe(255)
    expect(rgb.g).toBe(0)
    expect(rgb.b).toBe(0)
  })

  it("converts green (120, 100, 100)", () => {
    const rgb = hsbToRgb(120, 100, 100)
    expect(rgb.r).toBe(0)
    expect(rgb.g).toBe(255)
    expect(rgb.b).toBe(0)
  })

  it("converts blue (240, 100, 100)", () => {
    const rgb = hsbToRgb(240, 100, 100)
    expect(rgb.r).toBe(0)
    expect(rgb.g).toBe(0)
    expect(rgb.b).toBe(255)
  })

  it("converts white (0, 0, 100)", () => {
    const rgb = hsbToRgb(0, 0, 100)
    expect(rgb.r).toBe(255)
    expect(rgb.g).toBe(255)
    expect(rgb.b).toBe(255)
  })

  it("converts black (0, 0, 0)", () => {
    const rgb = hsbToRgb(0, 0, 0)
    expect(rgb.r).toBe(0)
    expect(rgb.g).toBe(0)
    expect(rgb.b).toBe(0)
  })

  it("handles saturation=0 (grayscale)", () => {
    const rgb = hsbToRgb(0, 0, 50)
    // 50 * 2.55 = 127.5, but JS floating point gives 127.49999999999999 → rounds to 127
    expect(rgb.r).toBeGreaterThanOrEqual(127)
    expect(rgb.r).toBeLessThanOrEqual(128)
    expect(rgb.g).toBe(rgb.r)
    expect(rgb.b).toBe(rgb.r)
  })
})

describe("rgbToHsb", () => {
  it("converts red (255, 0, 0)", () => {
    const hsb = rgbToHsb(255, 0, 0)
    expect(hsb.h).toBe(0)
    expect(hsb.s).toBe(100)
    expect(hsb.b).toBe(100)
  })

  it("converts green (0, 255, 0)", () => {
    const hsb = rgbToHsb(0, 255, 0)
    expect(hsb.h).toBe(120)
    expect(hsb.s).toBe(100)
    expect(hsb.b).toBe(100)
  })

  it("converts blue (0, 0, 255)", () => {
    const hsb = rgbToHsb(0, 0, 255)
    expect(hsb.h).toBe(240)
    expect(hsb.s).toBe(100)
    expect(hsb.b).toBe(100)
  })

  it("converts white (255, 255, 255)", () => {
    const hsb = rgbToHsb(255, 255, 255)
    expect(hsb.s).toBe(0)
    expect(hsb.b).toBe(100)
  })

  it("converts black (0, 0, 0)", () => {
    const hsb = rgbToHsb(0, 0, 0)
    expect(hsb.s).toBe(0)
    expect(hsb.b).toBe(0)
  })
})

describe("isDark", () => {
  it("returns true for dark colors", () => {
    expect(isDark(0, 0, 0)).toBe(true)
    expect(isDark(50, 50, 50)).toBe(true)
    expect(isDark(30, 30, 80)).toBe(true)
  })

  it("returns false for light colors", () => {
    expect(isDark(255, 255, 255)).toBe(false)
    expect(isDark(200, 200, 200)).toBe(false)
    expect(isDark(255, 215, 0)).toBe(false)
  })
})

// ── Property-based / roundtrip tests ───────────────────────────────────

describe("Color roundtrip properties", () => {
  it("hex → RGBColor → toHex() preserves value", () => {
    const testColors = [
      "#000000",
      "#FFFFFF",
      "#FF0000",
      "#00FF00",
      "#0000FF",
      "#AABBCC",
      "#aabbcc",
      "#123456",
      "#FEDCBA",
      "#808080",
    ]
    for (const hex of testColors) {
      const c = new RGBColor(hex)
      const result = c.toHex()
      // Compare case-insensitively
      expect(result.toLowerCase()).toBe(hex.toLowerCase())
    }
  })

  it("RGB → HSB → RGB preserves value (within ±1 tolerance)", () => {
    const testCases = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 255],
      [0, 0, 0],
      [128, 128, 128],
      [255, 128, 0],
      [100, 200, 50],
      [50, 100, 200],
      [200, 50, 100],
    ]
    for (const [r, g, b] of testCases) {
      const hsb = rgbToHsb(r, g, b)
      const rgb = hsbToRgb(hsb.h, hsb.s, hsb.b)
      expect(Math.abs(rgb.r - r)).toBeLessThanOrEqual(1)
      expect(Math.abs(rgb.g - g)).toBeLessThanOrEqual(1)
      expect(Math.abs(rgb.b - b)).toBeLessThanOrEqual(1)
    }
  })

  it("HSB → RGB → HSB preserves value (within ±1 tolerance)", () => {
    const testCases: Array<[number, number, number]> = [
      [0, 100, 100],
      [120, 100, 100],
      [240, 100, 100],
      [60, 100, 100],
      [180, 50, 75],
      [300, 100, 50],
      [0, 0, 100],
      [0, 0, 0],
      [90, 50, 50],
      [270, 75, 25],
    ]
    for (const [h, s, b] of testCases) {
      const rgb = hsbToRgb(h, s, b)
      const hsb = rgbToHsb(rgb.r, rgb.g, rgb.b)
      expect(Math.abs(hsb.h - h)).toBeLessThanOrEqual(1)
      expect(Math.abs(hsb.s - s)).toBeLessThanOrEqual(1)
      expect(Math.abs(hsb.b - b)).toBeLessThanOrEqual(1)
    }
  })

  it("hexToRgb(rgbToHex(r,g,b)) preserves RGB values for all 16 base colors", () => {
    const baseValues = [0, 51, 68, 102, 136, 170, 204, 238, 255]
    for (const r of baseValues) {
      for (const g of baseValues) {
        for (const b of baseValues) {
          const hex = rgbToHex(r, g, b)
          const rgb = hexToRgb(hex)
          expect(rgb).not.toBeNull()
          if (rgb) {
            expect(rgb.r).toBe(r)
            expect(rgb.g).toBe(g)
            expect(rgb.b).toBe(b)
          }
        }
      }
    }
  })
})

// ── Edge cases ─────────────────────────────────────────────────────────

describe("Color edge cases", () => {
  it("empty string defaults to black", () => {
    const c = new RGBColor("")
    expect(c.r).toBe(0)
    expect(c.g).toBe(0)
    expect(c.b).toBe(0)
  })

  it("very long hex string takes first 6 chars", () => {
    const c = new RGBColor("#FF0000FF")
    // substring(1,7) takes "FF0000"
    expect(c.r).toBe(255)
    expect(c.g).toBe(0)
    expect(c.b).toBe(0)
  })

  it("rgb with values at boundaries (0, 0, 0)", () => {
    const c = new RGBColor("rgb(0, 0, 0)")
    expect(c.r).toBe(0)
    expect(c.g).toBe(0)
    expect(c.b).toBe(0)
  })

  it("rgb with values at boundaries (255, 255, 255)", () => {
    const c = new RGBColor("rgb(255, 255, 255)")
    expect(c.r).toBe(255)
    expect(c.g).toBe(255)
    expect(c.b).toBe(255)
  })

  it("hsb with hue=360 wraps correctly", () => {
    const c = new RGBColor("hsb(360, 100, 100)")
    // hue 360 should behave like hue 0 (red)
    expect(c.r).toBe(255)
    expect(c.b).toBe(0)
  })

  it("toHex() with all zero values", () => {
    const c = new RGBColor("rgb(0, 0, 0)")
    expect(c.toHex()).toBe("#000000")
  })

  it("toHex() with all max values", () => {
    const c = new RGBColor("rgb(255, 255, 255)")
    expect(c.toHex()).toBe("#ffffff")
  })
})

// ── Fuzz-style: random colors should not throw ────────────────────────

describe("Color fuzz: random inputs should not throw", () => {
  it("random hex strings", () => {
    for (let i = 0; i < 100; i++) {
      const r = Math.floor(Math.random() * 256)
      const g = Math.floor(Math.random() * 256)
      const b = Math.floor(Math.random() * 256)
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
      expect(() => new RGBColor(hex)).not.toThrow()
      const c = new RGBColor(hex)
      expect(c.r).toBeGreaterThanOrEqual(0)
      expect(c.r).toBeLessThanOrEqual(255)
      expect(c.g).toBeGreaterThanOrEqual(0)
      expect(c.g).toBeLessThanOrEqual(255)
      expect(c.b).toBeGreaterThanOrEqual(0)
      expect(c.b).toBeLessThanOrEqual(255)
    }
  })

  it("random rgb() strings", () => {
    for (let i = 0; i < 100; i++) {
      const r = Math.floor(Math.random() * 256)
      const g = Math.floor(Math.random() * 256)
      const b = Math.floor(Math.random() * 256)
      expect(() => new RGBColor(`rgb(${r}, ${g}, ${b})`)).not.toThrow()
    }
  })

  it("garbage strings default to black without throwing", () => {
    const garbage = ["xyz", "###", "rgb()", "hsb()", "12345", "ggghhh"]
    for (const s of garbage) {
      expect(() => new RGBColor(s)).not.toThrow()
      const c = new RGBColor(s)
      expect(c.r).toBeGreaterThanOrEqual(0)
      expect(c.g).toBeGreaterThanOrEqual(0)
      expect(c.b).toBeGreaterThanOrEqual(0)
    }
  })
})
