/**
 * NavigationPanel — left-menu "Navigation" toggle target (PDF editor).
 *
 * Two halves: the document's bookmark/outline tree (pdf.js `getOutline()`,
 * flattened in lib/pdf-text.ts, destinations resolved to page numbers on
 * click) and plain page navigation — first/prev/next/last plus a go-to-page
 * field. Documents without an outline keep the page half working.
 */
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { useEffect, useState } from "react"
import { outlineDestination, resolveOutlinePage } from "../../lib/pdf-text"
import { pdfStore } from "../../stores/PdfStore"
import type { BookmarkNode } from "../../types/pdf"

function BookmarkTree({ nodes, depth }: { nodes: BookmarkNode[]; depth: number }): JSX.Element {
  return (
    <ul className="pdf-left-panel-list pdf-outline-list">
      {nodes.map((node) => (
        <li key={node.id} className="pdf-outline-item">
          <button
            type="button"
            className="pdf-left-panel-row pdf-outline-row"
            style={{ paddingLeft: 6 + depth * 12 }}
            title={node.label}
            onClick={() => void goToBookmark(node)}
          >
            <span className="pdf-left-panel-row-text">{node.label}</span>
          </button>
          {node.children && node.children.length > 0 && (
            <BookmarkTree nodes={node.children} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  )
}

/** Resolve a bookmark destination to a page and scroll there. */
async function goToBookmark(node: BookmarkNode): Promise<void> {
  const page = await resolveOutlinePage(pdfStore.pdfDocProxy, outlineDestination(node))
  if (page !== null) pdfStore.gotoPage(page)
}

function NavigationPanelInner({ active }: { active: boolean }): JSX.Element {
  const [pageInput, setPageInput] = useState("")

  // the outline belongs to the loaded document — read it when the panel opens
  useEffect(() => {
    if (active && pdfStore.bookmarks.length === 0 && !pdfStore.isOutlineLoading) {
      void pdfStore.loadOutline()
    }
  }, [active])

  const currentPage = pdfStore.currentPage + 1
  const pageCount = pdfStore.pageCount

  function gotoTyped(): void {
    const parsed = Number.parseInt(pageInput, 10)
    if (Number.isNaN(parsed)) return
    pdfStore.gotoPage(parsed)
    setPageInput("")
  }

  return (
    <div
      className="pdf-left-panel pdf-navigation-panel"
      style={{ display: active ? "flex" : "none" }}
      data-panel="navigation"
    >
      <div className="pdf-left-panel-header">
        <span>Navigation</span>
      </div>
      <div className="pdf-left-panel-body">
        <div className="pdf-support-section">
          <div className="pdf-support-section-title">Pages</div>
          <div className="pdf-left-panel-actions">
            <button
              type="button"
              className="pdf-left-panel-btn"
              onClick={() => pdfStore.gotoPage(1)}
              disabled={pageCount === 0}
              data-action="nav-first"
            >
              ⏮ First
            </button>
            <button
              type="button"
              className="pdf-left-panel-btn"
              onClick={() => pdfStore.prevPage()}
              disabled={pdfStore.currentPage === 0}
              data-action="nav-prev"
            >
              ‹ Prev
            </button>
            <button
              type="button"
              className="pdf-left-panel-btn"
              onClick={() => pdfStore.nextPage()}
              disabled={pdfStore.currentPage >= pageCount - 1}
              data-action="nav-next"
            >
              Next ›
            </button>
            <button
              type="button"
              className="pdf-left-panel-btn"
              onClick={() => pdfStore.gotoPage(pageCount)}
              disabled={pageCount === 0}
              data-action="nav-last"
            >
              Last ⏭
            </button>
          </div>
          <div className="pdf-chat-input-row pdf-nav-goto">
            <input
              className="pdf-left-panel-input"
              type="number"
              min={1}
              max={pageCount || 1}
              placeholder={`Page (1–${pageCount || 1})`}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") gotoTyped()
              }}
              data-action="nav-page"
            />
            <button
              type="button"
              className="pdf-left-panel-btn"
              onClick={gotoTyped}
              data-action="nav-goto"
            >
              Go
            </button>
          </div>
          <div className="pdf-left-panel-muted">
            Page {currentPage} of {pageCount || 0}
          </div>
        </div>

        <div className="pdf-support-section">
          <div className="pdf-support-section-title">Bookmarks</div>
          {pdfStore.isOutlineLoading && (
            <div className="pdf-left-panel-muted">Reading bookmarks…</div>
          )}
          {!pdfStore.isOutlineLoading && pdfStore.bookmarks.length === 0 && (
            <div className="pdf-left-panel-muted">
              This document has no bookmark tree. Use the page controls above, or the
              Thumbnails panel.
            </div>
          )}
          {pdfStore.bookmarks.length > 0 && (
            <BookmarkTree nodes={pdfStore.bookmarks} depth={0} />
          )}
        </div>

        <div className="pdf-left-panel-muted pdf-left-panel-footnote">
          Bookmarks come from the document outline; a click jumps to the page the
          bookmark points at.
        </div>
      </div>
    </div>
  )
}

export const NavigationPanel = observer(NavigationPanelInner)
