/**
 * pdf-text — text + outline access for the PDF editor's left-menu panels.
 *
 * pdfjs keeps the page text behind `page.getTextContent()` and the document
 * outline behind `proxy.getOutline()`. Both are async and shapeless, so this
 * module turns them into the plain structures the Search / Navigation panels
 * and the unit tests can work with, while the pure helpers (match finding,
 * snippets, outline flattening) stay synchronous and testable.
 */
import type { BookmarkNode } from "../types/pdf"

export interface PdfTextItem {
  str?: string
  hasEOL?: boolean
}

export interface PdfTextPageSource {
  /**
   * pdf.js interleaves real text items with marked-content markers
   * (`{ type: "beginMarkedContent", … }`) — collectPdfText filters those out.
   */
  getTextContent(): Promise<{ items: unknown[] }>
}

export interface PdfOutlineSourceNode {
  title?: string
  bold?: boolean
  italic?: boolean
  items?: PdfOutlineSourceNode[]
  /** pdfjs destination: name string or `[pageRef, ...]` array. */
  dest?: unknown
}

export interface PdfTextDocumentSource {
  numPages: number
  getPage(pageNumber: number): Promise<PdfTextPageSource>
  getOutline?(): Promise<PdfOutlineSourceNode[] | null>
  getDestination?(name: string): Promise<unknown[] | null>
  getPageIndex?(ref: unknown): Promise<number>
}

export interface PdfTextPage {
  /** 1-based page number. */
  page: number
  text: string
}

export interface PdfTextMatch {
  /** 1-based page number. */
  page: number
  /** Character offset of the match inside the page text. */
  offset: number
  text: string
  snippet: string
}

export interface PdfTextFindOptions {
  matchCase?: boolean
  /** Safety valve for very large documents. */
  maxMatches?: number
}

/**
 * Join pdf.js text items into one readable string per page. Items that are not
 * line-final get a separating space — but never a second one, because pdf.js
 * also splits on existing whitespace — and runs of spaces are collapsed so a
 * query written the way it reads matches the extracted text.
 */
export function pageTextFromItems(items: PdfTextItem[]): string {
  let text = ""
  for (const item of items) {
    if (typeof item.str !== "string") continue
    if (item.hasEOL) {
      text += `${item.str}\n`
    } else {
      text += text === "" || /\s$/.test(text) ? item.str : ` ${item.str}`
    }
  }
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ")
    .trim()
}

/** Keep only the items that actually carry text (drops marked-content markers). */
function textItems(content: { items?: unknown[] }): PdfTextItem[] {
  return (content.items ?? []).filter(
    (item): item is PdfTextItem =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as PdfTextItem).str === "string",
  )
}

/** Extract the text of every page (bounded for huge documents). */
export async function collectPdfText(
  proxy: PdfTextDocumentSource | null,
  maxPages = 500,
): Promise<PdfTextPage[]> {
  if (!proxy || !proxy.numPages) return []
  const pages: PdfTextPage[] = []
  const last = Math.min(proxy.numPages, Math.max(1, maxPages))
  for (let page = 1; page <= last; page++) {
    try {
      const pdfPage = await proxy.getPage(page)
      const content = await pdfPage.getTextContent()
      pages.push({ page, text: pageTextFromItems(textItems(content)) })
    } catch {
      // unreadable page (scanned image, corrupt xref) — keep the page count honest
      pages.push({ page, text: "" })
    }
  }
  return pages
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Every occurrence of the query, in page order. */
export function findPdfTextMatches(
  pages: PdfTextPage[],
  query: string,
  options?: PdfTextFindOptions,
): PdfTextMatch[] {
  if (!query) return []
  const matchCase = options?.matchCase ?? false
  const maxMatches = options?.maxMatches ?? 500
  const needle = matchCase ? query : query.toLowerCase()
  const matches: PdfTextMatch[] = []

  for (const { page, text } of pages) {
    const hay = matchCase ? text : text.toLowerCase()
    let offset = hay.indexOf(needle)
    while (offset !== -1) {
      matches.push({
        page,
        offset,
        text: text.slice(offset, offset + query.length),
        snippet: snippetAround(text, offset, offset + query.length),
      })
      if (matches.length >= maxMatches) return matches
      offset = hay.indexOf(needle, offset + needle.length)
    }
  }
  return matches
}

/** Short preview around a range so result rows stay readable. */
export function snippetAround(text: string, start: number, end: number): string {
  if (!text) return ""
  const from = Math.max(0, start - 20)
  const to = Math.min(text.length, end + 30)
  const prefix = from > 0 ? "…" : ""
  const suffix = to < text.length ? "…" : ""
  return `${prefix}${text.slice(from, to).replace(/\s+/g, " ").trim()}${suffix}`
}

/** Map the pdf.js outline onto the store's BookmarkNode tree. */
export function collectPdfOutline(
  nodes: PdfOutlineSourceNode[] | null | undefined,
  prefix = "bm",
): BookmarkNode[] {
  if (!Array.isArray(nodes)) return []
  return nodes.map((node, index) => ({
    id: `${prefix}-${index}`,
    label: node.title?.trim() || `Bookmark ${index + 1}`,
    children: collectPdfOutline(node.items, `${prefix}-${index}`),
    // keep the raw destination on the node for page resolution
    ...({ __dest: node.dest } as Record<string, unknown>),
  })) as BookmarkNode[]
}

/** Read back the raw destination attached by collectPdfOutline. */
export function outlineDestination(node: BookmarkNode): unknown {
  return (node as unknown as { __dest?: unknown }).__dest ?? null
}

/**
 * Resolve an outline destination (name string or `[ref, …]` array) to a
 * 1-based page number. Returns null when the document cannot answer.
 */
export async function resolveOutlinePage(
  proxy: PdfTextDocumentSource | null,
  dest: unknown,
): Promise<number | null> {
  if (!proxy) return null
  let target = dest
  try {
    if (typeof target === "string" && proxy.getDestination) {
      target = await proxy.getDestination(target)
    }
    if (!Array.isArray(target) || target.length === 0) return null
    if (!proxy.getPageIndex) return null
    const index = await proxy.getPageIndex(target[0])
    return Number.isFinite(index) ? index + 1 : null
  } catch {
    return null
  }
}
