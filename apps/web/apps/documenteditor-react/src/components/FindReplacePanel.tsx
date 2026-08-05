/**
 * Find & Replace panel — replaces window.prompt() calls for search/replace.
 *
 * Dispatches the same `world-office:search-state` events and calls
 * `dispatchRichTextCommand` so the existing search logic in rte-command.ts
 * handles the actual document traversal. This component provides the
 * input fields + action buttons that drive it.
 */

import { useEffect, useRef, useState } from "react"
import { type SearchState, getSearchState } from "../lib/rte-command"

interface FindReplacePanelProps {
  visible: boolean
  onClose: () => void
  onCommand: (command: string, value?: string) => void
}

export function FindReplacePanel({ visible, onClose, onCommand }: FindReplacePanelProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchState, setSearchState] = useState<SearchState>(getSearchState())
  const [showReplace, setShowReplace] = useState(false)
  const [replaceText, setReplaceText] = useState(searchState.replaceText)

  // Keep local state in sync with external search state
  // biome-ignore lint/correctness/useExhaustiveDependencies: visible triggers re-sync when panel opens
  useEffect(() => {
    setSearchState(getSearchState())
  }, [visible])

  useEffect(() => {
    function handleSearchEvent(e: Event) {
      const detail = (e as CustomEvent<SearchState>).detail
      if (detail) {
        setSearchState(detail)
        setReplaceText(detail.replaceText)
      }
    }
    window.addEventListener("world-office:search-state", handleSearchEvent)
    return () => window.removeEventListener("world-office:search-state", handleSearchEvent)
  }, [])

  // Focus search input when panel opens
  useEffect(() => {
    if (visible && searchInputRef.current) {
      searchInputRef.current.focus()
      searchInputRef.current.select()
    }
  }, [visible])

  if (!visible) return null

  function handleSearchChange(value: string) {
    // Broadcast so rte-command.ts search state is also updated
    // (its `openSearch` handler piggybacks on this event as well).
    const newState = { ...searchState, query: value, replaceText }
    setSearchState(newState)
    if (value) {
      onCommand("openSearch", value)
    } else {
      window.dispatchEvent(new CustomEvent("world-office:search-state", { detail: newState }))
    }
  }

  function handleReplaceTextChange(value: string) {
    setReplaceText(value)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      if (e.shiftKey) {
        onCommand("findPrevious")
      } else {
        onCommand("findNext")
      }
    }
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  const matchInfo =
    searchState.matches > 0
      ? `${searchState.currentIndex + 1} of ${searchState.matches}`
      : searchState.query
        ? "No matches"
        : ""

  return (
    <div
      className="de-findreplace-panel"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: showReplace ? 380 : 320,
        background: "#fff",
        border: "1px solid #d0d0d0",
        borderRadius: "0 0 0 6px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        zIndex: 500,
        padding: "10px 12px",
        fontFamily: "'Aptos', 'Calibri', 'Segoe UI', Roboto, sans-serif",
        fontSize: 13,
      }}
    >
      {/* Search row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          ref={searchInputRef}
          type="text"
          value={searchState.query}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find in document\u2026"
          style={{
            flex: 1,
            padding: "5px 8px",
            border: "1px solid #ccc",
            borderRadius: 3,
            fontSize: 13,
            outline: "none",
          }}
        />
        <span
          style={{
            minWidth: 70,
            textAlign: "right",
            color: searchState.matches > 0 ? "#555" : "#c00",
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          {matchInfo}
        </span>
        <button
          type="button"
          title="Previous match (Shift+Enter)"
          onClick={() => onCommand("findPrevious")}
          style={{
            padding: "4px 8px",
            border: "1px solid #ccc",
            borderRadius: 3,
            background: "#f5f5f5",
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          &#x25B2;
        </button>
        <button
          type="button"
          title="Next match (Enter)"
          onClick={() => onCommand("findNext")}
          style={{
            padding: "4px 8px",
            border: "1px solid #ccc",
            borderRadius: 3,
            background: "#f5f5f5",
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          &#x25BC;
        </button>
        <button
          type="button"
          title="Toggle replace"
          onClick={() => setShowReplace((v) => !v)}
          style={{
            padding: "4px 8px",
            border: "1px solid #ccc",
            borderRadius: 3,
            background: showReplace ? "#e8f4e8" : "#f5f5f5",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: showReplace ? 600 : 400,
          }}
        >
          R
        </button>
        <button
          type="button"
          title="Close (Escape)"
          onClick={onClose}
          style={{
            padding: "4px 6px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 16,
            color: "#888",
            lineHeight: 1,
          }}
        >
          &times;
        </button>
      </div>

      {/* Replace row (collapsible) */}
      {showReplace && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 6,
            paddingTop: 6,
            borderTop: "1px solid #eee",
          }}
        >
          <input
            type="text"
            value={replaceText}
            onChange={(e) => handleReplaceTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                onCommand("replace", replaceText)
              }
            }}
            placeholder="Replace with\u2026"
            style={{
              flex: 1,
              padding: "5px 8px",
              border: "1px solid #ccc",
              borderRadius: 3,
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            type="button"
            title="Replace current"
            onClick={() => onCommand("replace", replaceText)}
            style={{
              padding: "4px 10px",
              border: "1px solid #2ecc71",
              borderRadius: 3,
              background: "#2ecc71",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            Replace
          </button>
          <button
            type="button"
            title="Replace all matches"
            onClick={() => onCommand("replaceAll", replaceText)}
            style={{
              padding: "4px 10px",
              border: "1px solid #27ae60",
              borderRadius: 3,
              background: "#27ae60",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            All
          </button>
        </div>
      )}
    </div>
  )
}
