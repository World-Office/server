/**
 * Color conversion utilities — RGBColor class and color format conversions.
 */

/**
 * RGB color representation with conversion methods.
 */
export class RGBColor {
  r: number
  g: number
  b: number

  constructor(colorString: string) {
    let r = 0
    let g = 0
    let b = 0

    let normalizedColor = colorString
    if (normalizedColor.charAt(0) === "#") {
      normalizedColor = normalizedColor.substring(1, 7)
    }

    normalizedColor = normalizedColor.replace(/ /g, "").toLowerCase()

    const colorDefinitions = [
      {
        re: /^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/,
        process: (bits: RegExpExecArray) => [
          Number.parseInt(bits[1], 10),
          Number.parseInt(bits[2], 10),
          Number.parseInt(bits[3], 10),
        ],
      },
      {
        re: /^hsb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/,
        process: (bits: RegExpExecArray) => {
          const rgb: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }
          const h = Math.round(Number.parseFloat(bits[1]))
          const s = Math.round((Number.parseFloat(bits[2]) * 255) / 100)
          const v = Math.round((Number.parseFloat(bits[3]) * 255) / 100)
          if (s === 0) {
            rgb.r = rgb.g = rgb.b = v
          } else {
            const t1 = v
            const t2 = ((255 - s) * v) / 255
            const t3 = ((t1 - t2) * (h % 60)) / 60

            if (h === 360 || h < 60) {
              rgb.r = t1
              rgb.b = t2
              rgb.g = t2 + t3
            } else if (h < 120) {
              rgb.g = t1
              rgb.b = t2
              rgb.r = t1 - t3
            } else if (h < 180) {
              rgb.g = t1
              rgb.r = t2
              rgb.b = t2 + t3
            } else if (h < 240) {
              rgb.b = t1
              rgb.r = t2
              rgb.g = t1 - t3
            } else if (h < 300) {
              rgb.b = t1
              rgb.g = t2
              rgb.r = t2 + t3
            } else if (h < 360) {
              rgb.r = t1
              rgb.g = t2
              rgb.b = t1 - t3
            } else {
              rgb.r = 0
              rgb.g = 0
              rgb.b = 0
            }
          }
          return [Math.round(rgb.r), Math.round(rgb.g), Math.round(rgb.b)]
        },
      },
      {
        re: /^(\w{2})(\w{2})(\w{2})$/,
        process: (bits: RegExpExecArray) => [
          Number.parseInt(bits[1], 16),
          Number.parseInt(bits[2], 16),
          Number.parseInt(bits[3], 16),
        ],
      },
      {
        re: /^(\w{1})(\w{1})(\w{1})$/,
        process: (bits: RegExpExecArray) => [
          Number.parseInt(`${bits[1]}${bits[1]}`, 16),
          Number.parseInt(`${bits[2]}${bits[2]}`, 16),
          Number.parseInt(`${bits[3]}${bits[3]}`, 16),
        ],
      },
    ]

    for (const def of colorDefinitions) {
      const bits = def.re.exec(normalizedColor)
      if (bits) {
        const channels = def.process(bits)
        r = channels[0]
        g = channels[1]
        b = channels[2]
        break
      }
    }

    this.r = r < 0 || Number.isNaN(r) ? 0 : r > 255 ? 255 : r
    this.g = g < 0 || Number.isNaN(g) ? 0 : g > 255 ? 255 : g
    this.b = b < 0 || Number.isNaN(b) ? 0 : b > 255 ? 255 : b
  }

  /**
   * Check if this color equals another RGBColor.
   */
  isEqual(color: RGBColor): boolean {
    return this.r === color.r && this.g === color.g && this.b === color.b
  }

  /**
   * Convert to CSS rgb() string.
   */
  toRGB(): string {
    return `rgb(${this.r}, ${this.g}, ${this.b})`
  }

  /**
   * Convert to CSS rgba() string with optional alpha.
   */
  toRGBA(alfa = 1): string {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${alfa})`
  }

  /**
   * Convert to CSS hex string (#RRGGBB).
   */
  toHex(): string {
    const rStr = this.r.toString(16)
    const gStr = this.g.toString(16)
    const bStr = this.b.toString(16)
    const rPad = rStr.length === 1 ? "0" : ""
    const gPad = gStr.length === 1 ? "0" : ""
    const bPad = bStr.length === 1 ? "0" : ""
    return `#${rPad}${rStr}${gPad}${gStr}${bPad}${bStr}`
  }

  /**
   * Convert to HSB (hue, saturation, brightness) object.
   */
  toHSB(): { h: number; s: number; b: number } {
    const hsb = { h: 0, s: 0, b: 0 }

    const min = Math.min(this.r, this.g, this.b)
    const max = Math.max(this.r, this.g, this.b)
    const delta = max - min

    hsb.b = max
    hsb.s = max !== 0 ? (255 * delta) / max : 0

    if (hsb.s !== 0) {
      if (this.r === max) {
        hsb.h = (this.g - this.b) / delta
      } else if (this.g === max) {
        hsb.h = 2 + (this.b - this.r) / delta
      } else {
        hsb.h = 4 + (this.r - this.g) / delta
      }
    } else {
      hsb.h = 0
    }

    hsb.h *= 60
    if (hsb.h < 0) {
      hsb.h += 360
    }

    hsb.s = Math.round(hsb.s * 100) / 255
    hsb.b = Math.round(hsb.b * 100) / 255
    hsb.h = Math.round(hsb.h)
    hsb.s = Math.round(hsb.s)
    hsb.b = Math.round(hsb.b)

    return hsb
  }

  /**
   * Check if color is dark (for determining text color).
   * Uses luminance formula: sqrt(0.299*R² + 0.587*G² + 0.114*B²)
   */
  isDark(): boolean {
    return (
      Math.sqrt(0.299 * this.r * this.r + 0.587 * this.g * this.g + 0.114 * this.b * this.b) < 140
    )
  }
}

/**
 * HSB (Hue, Saturation, Brightness) color representation.
 */
export interface HSBColor {
  h: number
  s: number
  b: number
}

/**
 * Theme color interface with effect information.
 */
export interface ThemeColor {
  color: string
  effectId?: number
  effectValue?: number
  tip?: string
}

/**
 * Convert RGB to hex string (#RRGGBB).
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const rStr = r.toString(16)
  const gStr = g.toString(16)
  const bStr = b.toString(16)
  const rPad = rStr.length === 1 ? "0" : ""
  const gPad = gStr.length === 1 ? "0" : ""
  const bPad = bStr.length === 1 ? "0" : ""
  return `#${rPad}${rStr}${gPad}${gStr}${bPad}${bStr}`
}

/**
 * Parse hex string to RGB object.
 */
export function hexToRgb(hexInput: string): { r: number; g: number; b: number } | null {
  let hex = hexInput.replace(/^#/, "")
  if (hex.length === 3) {
    hex = hex.replace(/(.)/g, "$1$1")
  }
  if (hex.length !== 6) {
    return null
  }
  const color = Number.parseInt(hex, 16)
  return {
    r: color >> 16,
    g: (color & 0xff00) >> 8,
    b: color & 0xff,
  }
}

/**
 * Convert HSB to RGB.
 */
export function hsbToRgb(
  h: number,
  s: number,
  b: number,
): {
  r: number
  g: number
  b: number
} {
  const rgb = { r: 0, g: 0, b: 0 }
  const sScaled = Math.round(s * 2.55)
  const bScaled = Math.round(b * 2.55)

  if (sScaled === 0) {
    rgb.r = rgb.g = rgb.b = bScaled
  } else {
    const t1 = bScaled
    const t2 = ((255 - sScaled) * bScaled) / 255
    const t3 = ((t1 - t2) * (h % 60)) / 60

    if (h < 60) {
      rgb.r = t1
      rgb.b = t2
      rgb.g = t2 + t3
    } else if (h < 120) {
      rgb.g = t1
      rgb.b = t2
      rgb.r = t1 - t3
    } else if (h < 180) {
      rgb.g = t1
      rgb.r = t2
      rgb.b = t2 + t3
    } else if (h < 240) {
      rgb.b = t1
      rgb.r = t2
      rgb.g = t1 - t3
    } else if (h < 300) {
      rgb.b = t1
      rgb.g = t2
      rgb.r = t2 + t3
    } else if (h < 360) {
      rgb.r = t1
      rgb.g = t2
      rgb.b = t1 - t3
    }
  }

  return {
    r: Math.round(rgb.r),
    g: Math.round(rgb.g),
    b: Math.round(rgb.b),
  }
}

/**
 * Convert RGB to HSB.
 */
export function rgbToHsb(r: number, g: number, b: number): HSBColor {
  const hsb: HSBColor = { h: 0, s: 0, b: 0 }

  const min = Math.min(r, g, b)
  const max = Math.max(r, g, b)
  const delta = max - min

  hsb.b = max
  hsb.s = max !== 0 ? (255 * delta) / max : 0

  if (hsb.s !== 0) {
    if (r === max) {
      hsb.h = (g - b) / delta
    } else if (g === max) {
      hsb.h = 2 + (b - r) / delta
    } else {
      hsb.h = 4 + (r - g) / delta
    }
  }

  hsb.h *= 60
  if (hsb.h < 0) {
    hsb.h += 360
  }

  hsb.s = (hsb.s * 100) / 255
  hsb.b = (hsb.b * 100) / 255

  hsb.h = Math.round(hsb.h)
  hsb.s = Math.round(hsb.s)
  hsb.b = Math.round(hsb.b)

  return hsb
}

/**
 * Check if a color is dark based on RGB values.
 */
export function isDark(r: number, g: number, b: number): boolean {
  return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b) < 140
}
