/**
 * SearchPanel — left-menu "Search" toggle target (PDF editor).
 *
 * Find over the whole document: pdf.js page text is extracted once per
 * document (lib/pdf-text.ts) and matched locally, so the panel lists every
 * hit with a snippet and jumping to a result scrolls the viewer to its page
 * (PdfViewer reacts to store.currentPage).
 */
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { useState } from "react"
import { pdfStore } from "../../stores/PdfStore"

function SearchPanelInner({ active }: { active: boolean }): JSX.Element {
  const [query, setQuery] = useState("")
  const [matchCase, setMatchCase] = useState(false)
  const [status, setStatus] = useState("")
  const [activeIndex, setActiveIndex] = useState(-1)

  const matches = pdfStore.searchMatches

  async function runSearch(): Promise<void> {
    if (!query.trim()) {
      setStatus("Type something to search for.")
      await pdfStore.searchDocument("")
      return
    }
    const found = await pdfStore.searchDocument(query, { matchCase })
    setActiveIndex(found.length > 0 ? 0 : -1)
    if (found.length === 0) setStatus("No matches.")
    else if (found.length === 1) setStatus("1 match.")
    else setStatus(`${found.length} matches.`)
  }

  function jumpTo(index: number): void {
    const match = matches[index]
    if (!match) return
    setActiveIndex(index)
    pdfStore.gotoPage(match.page)
  }

  function step(direction: 1 | -1): void {
    if (matches.length === 0) return
    const next = (activeIndex + direction + matches.length) % matches.length
    jumpTo(next)
  }

  return (
    <div
      className="pdf-left-panel pdf-search-panel"
      style={{ display: active ? "flex" : "none" }}
      data-panel="search"
    >
      <div className="pdf-left-panel-header">
        <span>Search</span>
        {matches.length > 0 && <span className="pdf-left-panel-count">{matches.length}</span>}
      </div>
      <div className="pdf-left-panel-body">
        <input
          className="pdf-left-panel-input"
          type="text"
          placeholder="Find in document"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runSearch()
          }}
          data-action="search-query"
        />
        <label className="pdf-left-panel-check">
          <input
            type="checkbox"
            checked={matchCase}
            onChange={(e) => setMatchCase(e.target.checked)}
          />
          Match case
        </label>
        <div className="pdf-left-panel-actions">
          <button
            type="button"
            className="pdf-left-panel-btn pdf-left-panel-btn-primary"
            onClick={() => void runSearch()}
            disabled={pdfStore.isSearching}
            data-action="search-run"
          >
            {pdfStore.isSearching ? "Searching…" : "Search"}
          </button>
          <button
            type="button"
            className="pdf-left-panel-btn"
            onClick={() => step(-1)}
            disabled={matches.length === 0}
            data-action="search-prev"
          >
            ‹ Prev
          </button>
          <button
            type="button"
            className="pdf-left-panel-btn"
            onClick={() => step(1)}
            disabled={matches.length === 0}
            data-action="search-next"
          >
            Next ›
          </button>
        </div>
        {status && <div className="pdf-left-panel-muted">{status}</div>}
        {!pdfStore.pdfDocProxy && (
          <div className="pdf-left-panel-muted">No document open.</div>
        )}
        {pdfStore.pdfDocProxy && matches.length === 0 && !status && (
          <div className="pdf-left-panel-muted">
            Search covers the document text. Scanned pages without a text layer stay
            invisible to it.
          </div>
        )}
        <ul className="pdf-left-panel-list">
          {matches.map((match, i) => (
            <li key={`${match.page}-${match.offset}-${i}`}>
              <button
                type="button"
                className={`pdf-left-panel-row${i === activeIndex ? " selected" : ""}`}
                onClick={() => jumpTo(i)}
                title={`Page ${match.page}`}
              >
                <span className="pdf-left-panel-badge">Page {match.page}</span>
                <span className="pdf-left-panel-row-text">{match.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export const SearchPanel = observer(SearchPanelInner)
