/**
 * Document index generation tests — tests generateIndexHtml with various
 * entry configurations including empty, single, grouped, and sub-term scenarios.
 */
import { describe, expect, it } from "vitest"
import { generateIndexHtml } from "../lib/document-index"

// IndexedTerm is not exported, but we can construct matching shapes
interface TestEntry {
  term: string
  subTerm: string
  pageNumber: number
}

// ── generateIndexHtml ──────────────────────────────────────────────────

describe("generateIndexHtml", () => {
  it("returns placeholder for empty entries", () => {
    const html = generateIndexHtml([])
    expect(html).toBe("<p>No index entries found.</p>")
  })

  it("generates HTML for single entry", () => {
    const entries: TestEntry[] = [{ term: "Apple", subTerm: "", pageNumber: 1 }]
    const html = generateIndexHtml(entries)
    expect(html).toContain("Apple")
    expect(html).toContain("A")
    expect(html).toContain("column-count")
  })

  it("groups entries by first letter", () => {
    const entries: TestEntry[] = [
      { term: "Apple", subTerm: "", pageNumber: 1 },
      { term: "Banana", subTerm: "", pageNumber: 2 },
      { term: "Apricot", subTerm: "", pageNumber: 3 },
    ]
    const html = generateIndexHtml(entries)
    // Both Apple and Apricot should be under "A"
    expect(html).toContain("Apple")
    expect(html).toContain("Apricot")
    expect(html).toContain("Banana")
    expect(html).toContain("B")
  })

  it("handles sub-terms", () => {
    const entries: TestEntry[] = [
      { term: "Fruit", subTerm: "Apple", pageNumber: 1 },
      { term: "Fruit", subTerm: "Banana", pageNumber: 2 },
    ]
    const html = generateIndexHtml(entries)
    expect(html).toContain("Fruit")
    expect(html).toContain("Apple")
    expect(html).toContain("Banana")
  })

  it("deduplicates identical entries", () => {
    const entries: TestEntry[] = [
      { term: "Apple", subTerm: "", pageNumber: 1 },
      { term: "Apple", subTerm: "", pageNumber: 1 },
    ]
    const html = generateIndexHtml(entries)
    // Should only appear once in the terms list
    const matches = html.match(/Apple/g)
    expect(matches?.length).toBe(1)
  })

  it("sorts entries alphabetically within group", () => {
    const entries: TestEntry[] = [
      { term: "Cherry", subTerm: "", pageNumber: 1 },
      { term: "Apple", subTerm: "", pageNumber: 2 },
      { term: "Banana", subTerm: "", pageNumber: 3 },
    ]
    const html = generateIndexHtml(entries)
    // Apple should come before Banana, which should come before Cherry
    const applePos = html.indexOf("Apple")
    const bananaPos = html.indexOf("Banana")
    const cherryPos = html.indexOf("Cherry")
    expect(applePos).toBeLessThan(bananaPos)
    expect(bananaPos).toBeLessThan(cherryPos)
  })

  it("sorts sub-terms alphabetically", () => {
    const entries: TestEntry[] = [
      { term: "Fruit", subTerm: "Zucchini", pageNumber: 1 },
      { term: "Fruit", subTerm: "Apple", pageNumber: 2 },
      { term: "Fruit", subTerm: "Mango", pageNumber: 3 },
    ]
    const html = generateIndexHtml(entries)
    const applePos = html.indexOf("Apple")
    const mangoPos = html.indexOf("Mango")
    const zucchiniPos = html.indexOf("Zucchini")
    expect(applePos).toBeLessThan(mangoPos)
    expect(mangoPos).toBeLessThan(zucchiniPos)
  })

  it("handles entries with special characters", () => {
    const entries: TestEntry[] = [{ term: "Café", subTerm: "", pageNumber: 1 }]
    const html = generateIndexHtml(entries)
    expect(html).toContain("Café")
  })

  it("handles entries with numbers in term", () => {
    const entries: TestEntry[] = [{ term: "3D Graphics", subTerm: "", pageNumber: 1 }]
    const html = generateIndexHtml(entries)
    expect(html).toContain("3D Graphics")
  })

  it("uppercases first letter for grouping", () => {
    const entries: TestEntry[] = [{ term: "apple", subTerm: "", pageNumber: 1 }]
    const html = generateIndexHtml(entries)
    expect(html).toContain("A")
    expect(html).toContain("apple")
  })

  it("generates column-count CSS", () => {
    const entries: TestEntry[] = [{ term: "Test", subTerm: "", pageNumber: 1 }]
    const html = generateIndexHtml(entries)
    expect(html).toContain("column-count: 2")
    expect(html).toContain("column-gap: 24px")
  })

  it("deduplicates sub-terms within same term", () => {
    const entries: TestEntry[] = [
      { term: "Fruit", subTerm: "Apple", pageNumber: 1 },
      { term: "Fruit", subTerm: "Apple", pageNumber: 2 },
    ]
    const html = generateIndexHtml(entries)
    const matches = html.match(/Apple/g)
    expect(matches?.length).toBe(1)
  })

  it("handles empty subTerm string", () => {
    const entries: TestEntry[] = [
      { term: "Apple", subTerm: "", pageNumber: 1 },
      { term: "Banana", subTerm: "", pageNumber: 2 },
    ]
    const html = generateIndexHtml(entries)
    expect(html).toContain("Apple")
    expect(html).toContain("Banana")
  })

  it("separates terms with different first letters into different groups", () => {
    const entries: TestEntry[] = [
      { term: "Alpha", subTerm: "", pageNumber: 1 },
      { term: "Beta", subTerm: "", pageNumber: 2 },
      { term: "Gamma", subTerm: "", pageNumber: 3 },
    ]
    const html = generateIndexHtml(entries)
    expect(html).toContain("A")
    expect(html).toContain("B")
    expect(html).toContain("G")
  })
})

// ── Property-based tests ───────────────────────────────────────────────

describe("generateIndexHtml properties", () => {
  it("always wraps output in a div with column-count", () => {
    for (let i = 0; i < 10; i++) {
      const entries: TestEntry[] = Array.from({ length: 5 }, (_, j) => ({
        term: `Term${i}_${j}`,
        subTerm: "",
        pageNumber: j + 1,
      }))
      const html = generateIndexHtml(entries)
      expect(html).toContain("column-count")
      expect(html).toContain("<div")
    }
  })

  it("preserves all unique terms in output", () => {
    const terms = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]
    const entries: TestEntry[] = terms.map((term, i) => ({
      term,
      subTerm: "",
      pageNumber: i + 1,
    }))
    const html = generateIndexHtml(entries)
    for (const term of terms) {
      expect(html).toContain(term)
    }
  })
})
