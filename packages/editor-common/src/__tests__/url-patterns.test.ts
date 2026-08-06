/**
 * URL pattern validation tests — traditional unit tests for EMAIL_RE, URL_RE,
 * DOMAIN_RE, IP_RE, HOSTNAME_RE, and strong variants.
 */
import { describe, expect, it } from "vitest"
import {
  DOMAIN_RE,
  EMAIL_ADD_STRONG_RE,
  EMAIL_RE,
  EMAIL_STRONG_RE,
  HOSTNAME_RE,
  HOSTNAME_STRONG_RE,
  IP_RE,
  IP_STRONG_RE,
  LOCAL_RE,
  URL_RE,
} from "../utils/url-patterns"

// ── EMAIL_RE ───────────────────────────────────────────────────────────

describe("EMAIL_RE", () => {
  it("matches simple email", () => {
    expect(EMAIL_RE.test("user@domain.com")).toBe(true)
  })

  it("matches email with dots in local part", () => {
    expect(EMAIL_RE.test("user.name@domain.com")).toBe(true)
  })

  it("matches email with subdomain", () => {
    expect(EMAIL_RE.test("user@mail.domain.com")).toBe(true)
  })

  it("matches mailto: prefix", () => {
    expect(EMAIL_RE.test("mailto:user@domain.com")).toBe(true)
  })

  it("matches email with hyphen", () => {
    expect(EMAIL_RE.test("user-name@domain.com")).toBe(true)
  })

  it("does not match plain text", () => {
    expect(EMAIL_RE.test("hello world")).toBe(false)
  })

  it("does not match missing domain", () => {
    expect(EMAIL_RE.test("user@")).toBe(false)
  })
})

// ── URL_RE ─────────────────────────────────────────────────────────────

describe("URL_RE", () => {
  it("matches http URL", () => {
    expect(URL_RE.test("http://example.com")).toBe(true)
  })

  it("matches https URL", () => {
    expect(URL_RE.test("https://example.com")).toBe(true)
  })

  it("matches URL with path", () => {
    expect(URL_RE.test("https://example.com/path/to/page")).toBe(true)
  })

  it("matches URL with query string", () => {
    expect(URL_RE.test("https://example.com/page?query=value")).toBe(true)
  })

  it("matches URL with port", () => {
    expect(URL_RE.test("https://example.com:8080/path")).toBe(true)
  })

  it("matches URL with www", () => {
    expect(URL_RE.test("https://www.example.com")).toBe(true)
  })

  it("does not match plain text", () => {
    expect(URL_RE.test("hello world")).toBe(false)
  })

  it("does not match ftp", () => {
    expect(URL_RE.test("ftp://example.com")).toBe(false)
  })

  it("does not match without protocol", () => {
    expect(URL_RE.test("example.com")).toBe(false)
  })
})

// ── DOMAIN_RE ──────────────────────────────────────────────────────────

describe("DOMAIN_RE", () => {
  it("matches simple domain", () => {
    expect(DOMAIN_RE.test("example.com")).toBe(true)
  })

  it("matches subdomain", () => {
    expect(DOMAIN_RE.test("mail.example.com")).toBe(true)
  })

  it("matches multi-level subdomain", () => {
    expect(DOMAIN_RE.test("a.b.c.example.com")).toBe(true)
  })

  it("matches domain with hyphen", () => {
    expect(DOMAIN_RE.test("my-site.com")).toBe(true)
  })

  it("does not match without TLD", () => {
    expect(DOMAIN_RE.test("localhost")).toBe(false)
  })

  it("does not match with protocol", () => {
    expect(DOMAIN_RE.test("http://example.com")).toBe(false)
  })
})

// ── IP_RE ──────────────────────────────────────────────────────────────

describe("IP_RE", () => {
  it("matches IP address", () => {
    expect(IP_RE.test("192.168.1.1")).toBe(true)
  })

  it("matches IP with protocol", () => {
    expect(IP_RE.test("http://192.168.1.1")).toBe(true)
  })

  it("matches IP with port", () => {
    expect(IP_RE.test("http://192.168.1.1:8080")).toBe(true)
  })

  it("matches 127.0.0.1", () => {
    expect(IP_RE.test("127.0.0.1")).toBe(true)
  })

  it("matches 10.0.0.1", () => {
    expect(IP_RE.test("10.0.0.1")).toBe(true)
  })
})

// ── HOSTNAME_RE ────────────────────────────────────────────────────────

describe("HOSTNAME_RE", () => {
  it("matches hostname with protocol", () => {
    expect(HOSTNAME_RE.test("http://example.com")).toBe(true)
  })

  it("matches hostname without protocol", () => {
    expect(HOSTNAME_RE.test("example.com")).toBe(true)
  })

  it("matches www hostname", () => {
    expect(HOSTNAME_RE.test("www.example.com")).toBe(true)
  })

  it("matches hostname with path", () => {
    expect(HOSTNAME_RE.test("example.com/path")).toBe(true)
  })
})

// ── LOCAL_RE ───────────────────────────────────────────────────────────

describe("LOCAL_RE", () => {
  it("matches localhost with protocol", () => {
    expect(LOCAL_RE.test("http://localhost")).toBe(true)
  })

  it("matches localhost with port", () => {
    expect(LOCAL_RE.test("http://localhost:3000")).toBe(true)
  })

  it("does not match without protocol", () => {
    expect(LOCAL_RE.test("localhost")).toBe(false)
  })
})

// ── Strong variants ────────────────────────────────────────────────────

describe("EMAIL_STRONG_RE", () => {
  it("matches email with query params (global)", () => {
    const result = "user@domain.com?param=value".match(EMAIL_STRONG_RE)
    expect(result).not.toBeNull()
  })

  it("matches multiple emails in text (global)", () => {
    const text = "user1@domain.com and user2@domain.com"
    const matches = text.match(EMAIL_STRONG_RE)
    expect(matches).not.toBeNull()
    expect(matches?.length).toBeGreaterThanOrEqual(2)
  })
})

describe("EMAIL_ADD_STRONG_RE", () => {
  it("matches email with @ prefix", () => {
    const text = " @user@domain.com"
    const matches = text.match(EMAIL_ADD_STRONG_RE)
    expect(matches).not.toBeNull()
  })

  it("matches email with + prefix", () => {
    const text = " +user@domain.com"
    const matches = text.match(EMAIL_ADD_STRONG_RE)
    expect(matches).not.toBeNull()
  })
})

describe("IP_STRONG_RE", () => {
  it("matches IP with protocol in text (global)", () => {
    const text = "Server at http://192.168.1.1 and https://10.0.0.1"
    const matches = text.match(IP_STRONG_RE)
    expect(matches).not.toBeNull()
    expect(matches?.length).toBeGreaterThanOrEqual(1)
  })

  it("matches single IP with protocol", () => {
    const text = "Connect to http://192.168.1.1:8080"
    const matches = text.match(IP_STRONG_RE)
    expect(matches).not.toBeNull()
  })
})

describe("HOSTNAME_STRONG_RE", () => {
  it("matches hostname with www in text (global)", () => {
    const text = "Visit www.example.com or http://test.com"
    const matches = text.match(HOSTNAME_STRONG_RE)
    expect(matches).not.toBeNull()
    expect(matches?.length).toBeGreaterThanOrEqual(1)
  })
})

// ── Edge cases ─────────────────────────────────────────────────────────

describe("URL pattern edge cases", () => {
  it("URL with fragment", () => {
    expect(URL_RE.test("https://example.com/page#section")).toBe(true)
  })

  it("URL with multiple query params", () => {
    expect(URL_RE.test("https://example.com?a=1&b=2&c=3")).toBe(true)
  })

  it("URL with encoded characters", () => {
    expect(URL_RE.test("https://example.com/path%20with%20spaces")).toBe(true)
  })

  it("very long domain", () => {
    expect(DOMAIN_RE.test(`${"a".repeat(60)}.com`)).toBe(true)
  })

  it("domain with numbers", () => {
    expect(DOMAIN_RE.test("example123.com")).toBe(true)
  })

  it("email with plus sign in local part (EMAIL_STRONG_RE)", () => {
    const result = "user+tag@domain.com".match(EMAIL_STRONG_RE)
    expect(result).not.toBeNull()
  })

  it("email with underscore in local part", () => {
    expect(EMAIL_RE.test("user_name@domain.com")).toBe(true)
  })
})
