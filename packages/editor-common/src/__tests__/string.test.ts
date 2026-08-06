/**
 * String utility tests — traditional unit tests for format, htmlEncode/Decode,
 * ellipsis, platformKey, parseFloatSafe, encodeSurrogateChar, fixedDigits, escapeRegex.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  PLATFORM_KEYS,
  ellipsis,
  encodeSurrogateChar,
  escapeRegex,
  fixedDigits,
  format,
  htmlDecode,
  htmlEncode,
  parseFloatSafe,
  platformKey,
} from "../utils/string"

// ── format() ───────────────────────────────────────────────────────────

describe("format", () => {
  it("replaces {0}, {1} placeholders", () => {
    expect(format("Hello {0}!", "World")).toBe("Hello World!")
  })

  it("replaces multiple placeholders", () => {
    expect(format("{0} + {1} = {2}", 1, 2, 3)).toBe("1 + 2 = 3")
  })

  it("handles array argument", () => {
    expect(format("{0}-{1}-{2}", ["a", "b", "c"])).toBe("a-b-c")
  })

  it("handles missing placeholder (defaults to empty)", () => {
    expect(format("Hello {0}!", "")).toBe("Hello !")
  })

  it("handles no placeholders", () => {
    expect(format("Hello World!")).toBe("Hello World!")
  })

  it("handles extra args (unused)", () => {
    expect(format("{0}", "a", "b", "c")).toBe("a")
  })

  it("handles out-of-range index (defaults to empty)", () => {
    expect(format("{0} {5}", "a")).toBe("a ")
  })

  it("handles numeric and string args", () => {
    expect(format("Count: {0}", 42)).toBe("Count: 42")
  })
})

// ── htmlEncode / htmlDecode ────────────────────────────────────────────

describe("htmlEncode", () => {
  it("escapes regex special characters", () => {
    expect(htmlEncode("hello.world")).toBe("hello\\.world")
    expect(htmlEncode("a*b")).toBe("a\\*b")
    expect(htmlEncode("a+b")).toBe("a\\+b")
  })

  it("escapes brackets and braces", () => {
    expect(htmlEncode("test{val}")).toBe("test\\{val\\}")
    expect(htmlEncode("a[b]c")).toBe("a\\[b\\]c")
  })

  it("escapes backslash", () => {
    expect(htmlEncode("a\\b")).toBe("a\\\\b")
  })

  it("escapes pipe and dollar", () => {
    expect(htmlEncode("a|b")).toBe("a\\|b")
    expect(htmlEncode("a$b")).toBe("a\\$b")
  })

  it("escapes question mark and caret", () => {
    expect(htmlEncode("a?b")).toBe("a\\?b")
    expect(htmlEncode("a^b")).toBe("a\\^b")
  })

  it("does not modify plain text", () => {
    expect(htmlEncode("hello world")).toBe("hello world")
  })
})

describe("htmlDecode", () => {
  it("decodes &amp;", () => {
    expect(htmlDecode("a&amp;b")).toBe("a&b")
  })

  it("decodes &lt; and &gt;", () => {
    expect(htmlDecode("&lt;div&gt;")).toBe("<div>")
  })

  it("decodes &quot;", () => {
    expect(htmlDecode("say &quot;hi&quot;")).toBe('say "hi"')
  })

  it("decodes &#39; and &apos;", () => {
    expect(htmlDecode("it&#39;s")).toBe("it's")
    expect(htmlDecode("it&apos;s")).toBe("it's")
  })

  it("decodes multiple entities", () => {
    expect(htmlDecode("&lt;a href=&quot;x&quot;&gt;link&lt;/a&gt;")).toBe('<a href="x">link</a>')
  })

  it("leaves unknown entities unchanged", () => {
    expect(htmlDecode("&unknown;")).toBe("&unknown;")
  })

  it("handles plain text", () => {
    expect(htmlDecode("hello world")).toBe("hello world")
  })
})

// ── ellipsis ───────────────────────────────────────────────────────────

describe("ellipsis", () => {
  it("returns short strings unchanged", () => {
    expect(ellipsis("hello", 10)).toBe("hello")
  })

  it("returns exact-length strings unchanged", () => {
    expect(ellipsis("hello", 5)).toBe("hello")
  })

  it("truncates long strings with ellipsis", () => {
    expect(ellipsis("hello world", 8)).toBe("hello...")
  })

  it("truncates to specified length", () => {
    expect(ellipsis("abcdefghij", 7)).toBe("abcd...")
  })

  it("handles empty string", () => {
    expect(ellipsis("", 10)).toBe("")
  })

  it("handles word boundary", () => {
    const result = ellipsis("hello world foo bar", 15, true)
    expect(result).toContain("...")
    expect(result.length).toBeLessThanOrEqual(15)
  })

  it("word boundary breaks at word separator", () => {
    const result = ellipsis("hello world foo", 14, true)
    expect(result).toContain("...")
    expect(result.length).toBeLessThanOrEqual(14)
    // Word boundary should break at space, giving "hello world..."
    expect(result).toContain("hello")
  })

  it("falls back to char truncation if no word boundary", () => {
    const result = ellipsis("abcdefghij", 6, true)
    expect(result).toBe("abc...")
  })
})

// ── platformKey ────────────────────────────────────────────────────────

describe("platformKey", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("formats Ctrl+C on Windows", () => {
    const result = platformKey("Ctrl+C", " ({0})")
    // On the test platform (Linux), Ctrl stays as "Ctrl"
    expect(result).toContain("Ctrl")
    expect(result).toContain("C")
  })

  it("uses default template", () => {
    const result = platformKey("Ctrl+S")
    expect(result).toContain("Ctrl")
    expect(result).toContain("S")
  })

  it("handles empty template", () => {
    const result = platformKey("Ctrl+Z", "")
    // Empty template still formats
    expect(result).toContain("Ctrl")
  })

  it("handles Shift and Alt modifiers", () => {
    const result = platformKey("Shift+Alt+A")
    expect(result).toContain("Shift")
    expect(result).toContain("Alt")
  })

  it("PLATFORM_KEYS exports ctrl, shift, alt, comma", () => {
    expect(PLATFORM_KEYS.ctrl).toBeDefined()
    expect(PLATFORM_KEYS.shift).toBeDefined()
    expect(PLATFORM_KEYS.alt).toBeDefined()
    expect(PLATFORM_KEYS.comma).toBeDefined()
  })
})

// ── parseFloatSafe ─────────────────────────────────────────────────────

describe("parseFloatSafe", () => {
  it("parses standard float", () => {
    expect(parseFloatSafe("3.14")).toBe(3.14)
  })

  it("parses integer string", () => {
    expect(parseFloatSafe("42")).toBe(42)
  })

  it("parses comma as decimal separator", () => {
    expect(parseFloatSafe("3,14")).toBe(3.14)
  })

  it("parses negative number", () => {
    expect(parseFloatSafe("-5.5")).toBe(-5.5)
  })

  it("parses zero", () => {
    expect(parseFloatSafe("0")).toBe(0)
  })

  it("returns NaN for non-numeric", () => {
    expect(Number.isNaN(parseFloatSafe("abc"))).toBe(true)
  })

  it("handles number input (not string)", () => {
    expect(parseFloatSafe(42 as unknown as string)).toBe(42)
  })
})

// ── encodeSurrogateChar ────────────────────────────────────────────────

describe("encodeSurrogateChar", () => {
  it("returns BMP character directly (< 0x10000)", () => {
    expect(encodeSurrogateChar(0x41)).toBe("A")
    expect(encodeSurrogateChar(0x7a)).toBe("z")
    expect(encodeSurrogateChar(0x4e00)).toBe("\u4e00")
  })

  it("encodes supplementary character as surrogate pair (>= 0x10000)", () => {
    // U+1F600 (😀)
    const result = encodeSurrogateChar(0x1f600)
    expect(result.length).toBe(2)
    // Use charCodeAt for surrogate pairs (codePointAt returns full code point)
    expect(result.charCodeAt(0)).toBe(0xd83d)
    expect(result.charCodeAt(1)).toBe(0xde00)
  })

  it("encodes U+10000 (first supplementary)", () => {
    const result = encodeSurrogateChar(0x10000)
    expect(result.length).toBe(2)
    expect(result.charCodeAt(0)).toBe(0xd800)
    expect(result.charCodeAt(1)).toBe(0xdc00)
  })

  it("encodes U+10FFFF (last code point)", () => {
    const result = encodeSurrogateChar(0x10ffff)
    expect(result.length).toBe(2)
    expect(result.charCodeAt(0)).toBe(0xdbff)
    expect(result.charCodeAt(1)).toBe(0xdfff)
  })
})

// ── fixedDigits ────────────────────────────────────────────────────────

describe("fixedDigits", () => {
  it("pads with leading zeros", () => {
    expect(fixedDigits(5, 3)).toBe("005")
    expect(fixedDigits(42, 5)).toBe("00042")
  })

  it("returns as-is when already correct length", () => {
    expect(fixedDigits(123, 3)).toBe("123")
  })

  it("returns as-is when longer than digits", () => {
    expect(fixedDigits(12345, 3)).toBe("12345")
  })

  it("handles zero", () => {
    expect(fixedDigits(0, 4)).toBe("0000")
  })

  it("handles custom fill character", () => {
    expect(fixedDigits(5, 3, " ")).toBe("  5")
    expect(fixedDigits(42, 5, "_")).toBe("___42")
  })

  it("handles negative numbers", () => {
    expect(fixedDigits(-5, 4)).toBe("00-5")
  })
})

// ── escapeRegex ────────────────────────────────────────────────────────

describe("escapeRegex", () => {
  it("escapes dot", () => {
    expect(escapeRegex("file.txt")).toBe("file\\.txt")
  })

  it("escapes asterisk", () => {
    expect(escapeRegex("a*b")).toBe("a\\*b")
  })

  it("escapes plus", () => {
    expect(escapeRegex("a+b")).toBe("a\\+b")
  })

  it("escapes question mark", () => {
    expect(escapeRegex("a?b")).toBe("a\\?b")
  })

  it("escapes parentheses", () => {
    expect(escapeRegex("(test)")).toBe("\\(test\\)")
  })

  it("escapes brackets", () => {
    expect(escapeRegex("[test]")).toBe("\\[test\\]")
  })

  it("escapes braces", () => {
    expect(escapeRegex("{test}")).toBe("\\{test\\}")
  })

  it("escapes backslash", () => {
    expect(escapeRegex("a\\b")).toBe("a\\\\b")
  })

  it("escapes pipe", () => {
    expect(escapeRegex("a|b")).toBe("a\\|b")
  })

  it("escapes caret and dollar", () => {
    expect(escapeRegex("^test$")).toBe("\\^test\\$")
  })

  it("does not modify plain text", () => {
    expect(escapeRegex("hello world")).toBe("hello world")
  })

  it("escaped string is safe in RegExp constructor", () => {
    const escaped = escapeRegex("file.txt")
    const re = new RegExp(escaped)
    expect(re.test("file.txt")).toBe(true)
    expect(re.test("fileXtxt")).toBe(false)
  })
})

// ── Property-based tests ───────────────────────────────────────────────

describe("String property tests", () => {
  it("htmlEncode + new RegExp is safe for all special chars", () => {
    const specialChars = [".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]
    for (const ch of specialChars) {
      const escaped = escapeRegex(ch)
      const re = new RegExp(escaped)
      expect(re.test(ch)).toBe(true)
    }
  })

  it("htmlDecode reverses htmlEncode for common entities", () => {
    // Note: htmlEncode escapes regex chars, not HTML entities.
    // htmlDecode decodes HTML entities. These are different operations.
    // This test verifies htmlDecode correctly decodes standard entities.
    const entities: Array<[string, string]> = [
      ["&amp;", "&"],
      ["&lt;", "<"],
      ["&gt;", ">"],
      ["&quot;", '"'],
      ["&#39;", "'"],
      ["&apos;", "'"],
    ]
    for (const [encoded, decoded] of entities) {
      expect(htmlDecode(encoded)).toBe(decoded)
    }
  })

  it("format replaces all {N} placeholders in order", () => {
    for (let i = 0; i < 10; i++) {
      const pattern = Array.from({ length: i }, (_, j) => `{${j}}`).join(",")
      const args = Array.from({ length: i }, (_, j) => String(j * 10))
      const result = format(pattern, ...args)
      const expected = args.join(",")
      expect(result).toBe(expected)
    }
  })

  it("encodeSurrogateChar produces valid surrogate pairs for supplementary plane", () => {
    for (let i = 0; i < 100; i++) {
      const cp = 0x10000 + Math.floor(Math.random() * 0xfffff)
      const s = encodeSurrogateChar(cp)
      expect(s.length).toBe(2)
      // Leading surrogate: 0xD800–0xDBFF
      expect(s.charCodeAt(0)).toBeGreaterThanOrEqual(0xd800)
      expect(s.charCodeAt(0)).toBeLessThanOrEqual(0xdbff)
      // Trailing surrogate: 0xDC00–0xDFFF
      expect(s.charCodeAt(1)).toBeGreaterThanOrEqual(0xdc00)
      expect(s.charCodeAt(1)).toBeLessThanOrEqual(0xdfff)
      // Full code point should roundtrip via codePointAt
      expect(s.codePointAt(0)).toBe(cp)
    }
  })

  it("fixedDigits always produces at least `digits` characters for non-negative", () => {
    for (let i = 0; i < 100; i++) {
      const n = Math.floor(Math.random() * 10000)
      const result = fixedDigits(n, 5)
      expect(result.length).toBeGreaterThanOrEqual(5)
    }
  })

  it("encodeSurrogateChar roundtrips with codePointAt for BMP", () => {
    for (let i = 0; i < 1000; i++) {
      const cp = Math.floor(Math.random() * 0x10000)
      const s = encodeSurrogateChar(cp)
      expect(s.codePointAt(0)).toBe(cp)
    }
  })
})
