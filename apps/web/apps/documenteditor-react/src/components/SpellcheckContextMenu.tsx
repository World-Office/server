import type { CSSProperties, JSX } from "react"
import { useEffect, useRef, useState } from "react"
import type { WasmSpellChecker } from "../lib/spellcheck-context"

/**
 * PGP-A4 — spellcheck context menu (OO ctx-contracts, misspelled rows).
 *
 * OnlyOffice's document-editor context menu over a misspelled word has 15
 * rows (live-verified against OO 9.4.0, see census/ctx-contracts.json →
 * misspelled / config/port-graph-parity/tasks.json → PGP-A4):
 *
 *   Ignore, IgnoreAll, AddToDictionary, SelectLanguage,
 *   Cut, Copy, Paste, PrintSelection,
 *   PageBreakBefore, KeepLines, ParagraphSettings, AddComment, Link,
 *   FormattingAsStyle, AI
 *
 * The suggestions block sits above the contract rows exactly like OO's
 * menu. Spellcheck rows run app-side (session ignore list / user
 * dictionary), the clipboard/print rows stay browser-side exactly like OO
 * does (native execCommand + window.print), and the remaining rows are the
 * normal text rows (PGP-A1) dispatched as `wo-command` CustomEvents.
 */

/** Rows OO implements with browser APIs (no editor command behind them). */
export type SpellcheckBrowserAction = "cut" | "copy" | "paste" | "print"

/** Spellcheck rows OO resolves without an editor command (app-side). */
export type SpellcheckRowAction = "ignore" | "ignoreAll" | "addToDictionary"

export interface SpellcheckContextRow {
  /** OO ctx-contract row id (CamelCase). */
  id: string
  label: string
  /** Set on the 15 live-verified OO contract rows (contract-coverage test). */
  contract?: boolean
  /** `wo-command` payload dispatched on click. */
  command?: string
  value?: string
  /** Browser-side action (ctx-contracts marks Cut/Copy/Paste/… as native). */
  browser?: SpellcheckBrowserAction
  /** App-side spellcheck action (ignore / dictionary). */
  action?: SpellcheckRowAction
  /** Visual separator above the row, mirroring the OO menu grouping. */
  divider?: boolean
}

/** The OO misspelled-word contract, in OO's own order. */
export const SPELLCHECK_CONTEXT_CONTRACT_ROWS: readonly string[] = [
  "Ignore",
  "IgnoreAll",
  "AddToDictionary",
  "SelectLanguage",
  "Cut",
  "Copy",
  "Paste",
  "PrintSelection",
  "PageBreakBefore",
  "KeepLines",
  "ParagraphSettings",
  "AddComment",
  "Link",
  "FormattingAsStyle",
  "AI",
]

/**
 * Rows rendered by the menu below the suggestions block — exactly the 15
 * OO contract rows in OO's order.
 */
export const SPELLCHECK_CONTEXT_ROWS: readonly SpellcheckContextRow[] = [
  { id: "Ignore", label: "Ignore", contract: true, action: "ignore" },
  { id: "IgnoreAll", label: "Ignore All", contract: true, action: "ignoreAll" },
  { id: "AddToDictionary", label: "Add to Dictionary", contract: true, action: "addToDictionary" },
  {
    id: "SelectLanguage",
    label: "Select Language",
    contract: true,
    command: "setDocumentLanguage",
  },
  { id: "Cut", label: "Cut", contract: true, browser: "cut", divider: true },
  { id: "Copy", label: "Copy", contract: true, browser: "copy" },
  { id: "Paste", label: "Paste", contract: true, browser: "paste" },
  { id: "PrintSelection", label: "Print Selection", contract: true, browser: "print" },
  {
    id: "PageBreakBefore",
    label: "Page Break Before",
    contract: true,
    command: "pageBreakBefore",
    divider: true,
  },
  { id: "KeepLines", label: "Keep Lines Together", contract: true, command: "keepLines" },
  {
    id: "ParagraphSettings",
    label: "Paragraph Settings",
    contract: true,
    command: "paragraphSettings",
  },
  { id: "AddComment", label: "Add Comment", contract: true, command: "addComment" },
  { id: "Link", label: "Link", contract: true, command: "link" },
  {
    id: "FormattingAsStyle",
    label: "Formatting as Style",
    contract: true,
    command: "formattingAsStyle",
  },
  { id: "AI", label: "AI", contract: true, command: "aiAssistant", divider: true },
]

/** Maximum suggestions OO shows above the contract rows. */
export const SPELLCHECK_MAX_SUGGESTIONS = 5

/**
 * Session "Ignore" list — OO keeps dismissed words ignored until the
 * document is reloaded. Ignore skips the word for this session; the
 * decoration layer has no per-occurrence tracking, so it collapses to the
 * word level (same as the previous Ignore handler).
 */
const sessionIgnored = new Set<string>()

/** Session "Ignore All" list — every occurrence of the word, this session. */
const sessionIgnoredAll = new Set<string>()

/** Session-ignore one word (Ignore row). */
export function ignoreWord(word: string): void {
  sessionIgnored.add(word.toLowerCase())
}

/** Session-ignore every occurrence of one word (Ignore All row). */
export function ignoreWordAll(word: string): void {
  sessionIgnoredAll.add(word.toLowerCase())
}

/** Is the word on the session Ignore list? */
export function isWordIgnored(word: string): boolean {
  const key = word.toLowerCase()
  return sessionIgnored.has(key) || sessionIgnoredAll.has(key)
}

/** Is the word on the session Ignore All list? */
export function isWordIgnoredAll(word: string): boolean {
  return sessionIgnoredAll.has(word.toLowerCase())
}

/** Clear both session ignore lists (test helper / document reload). */
export function clearSpellcheckIgnores(): void {
  sessionIgnored.clear()
  sessionIgnoredAll.clear()
}

/**
 * Run one of the browser-side ctx rows. OO keeps clipboard / print handling
 * in the browser layer (no editor command), so we do too.
 */
export function runSpellcheckBrowserAction(action: SpellcheckBrowserAction): void {
  switch (action) {
    case "cut":
      document.execCommand("cut")
      return
    case "copy":
      document.execCommand("copy")
      return
    case "paste":
      document.execCommand("paste")
      return
    case "print":
      window.print()
      return
  }
}

/**
 * Does this context-menu target belong to a misspelled word? The
 * spellcheck-error decoration is the trigger condition; this check has to
 * stay the first branch of every other ctx menu's target test so the
 * spellcheck menu owns misspelled words (OO shows this menu over them).
 */
export function isSpellcheckTarget(target: EventTarget | null): boolean {
  const el = target as Element | null
  if (el === null || typeof el.closest !== "function") return false
  return el.closest(".spellcheck-error") !== null
}

/** Read the misspelled word off a spellcheck-error element. */
export function spellcheckWordOf(target: EventTarget | null): string {
  const el = target as Element | null
  const hit =
    el !== null && typeof el.closest === "function" ? el.closest(".spellcheck-error") : null
  return hit?.getAttribute("data-word") ?? ""
}

interface MenuState {
  x: number
  y: number
  word: string
  suggestions: string[]
}

interface SpellcheckContextMenuProps {
  spellchecker: WasmSpellChecker | null
  /** Element to listen on — defaults to `document` (whole editor surface). */
  editorElement: HTMLElement | null
  addToDictionary: (word: string) => void
  /** Called on Ignore — lets the host re-run the spellcheck decorations. */
  onIgnore?: (word: string) => void
  /** Called on Ignore All — lets the host re-run the spellcheck decorations. */
  onIgnoreAll?: (word: string) => void
}

export function SpellcheckContextMenu({
  spellchecker,
  editorElement,
  addToDictionary,
  onIgnore,
  onIgnoreAll,
}: SpellcheckContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target: HTMLElement | Document = editorElement ?? document

    const handleContextMenu = (e: Event) => {
      const me = e as MouseEvent
      if (!isSpellcheckTarget(me.target)) {
        setMenu(null)
        return
      }
      me.preventDefault()
      const word = spellcheckWordOf(me.target)
      const suggestions = spellchecker?.suggest(word) ?? []
      setMenu({ x: me.clientX, y: me.clientY, word, suggestions })
    }

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null)
    }

    target.addEventListener("contextmenu", handleContextMenu)
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      target.removeEventListener("contextmenu", handleContextMenu)
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [editorElement, spellchecker])

  if (menu === null) return null
  // Local alias keeps the null narrowing inside the closures below.
  const open = menu

  /** Replace the misspelled word in the editor text with a suggestion. */
  function applySuggestion(suggestion: string) {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      const textNode = range.startContainer
      if (textNode.nodeType === Node.TEXT_NODE) {
        const text = textNode.textContent || ""
        const idx = text.toLowerCase().indexOf(open.word.toLowerCase())
        if (idx !== -1) {
          const newRange = document.createRange()
          newRange.setStart(textNode, idx)
          newRange.setEnd(textNode, idx + open.word.length)
          newRange.deleteContents()
          newRange.insertNode(document.createTextNode(suggestion))
        }
      }
    }
    setMenu(null)
  }

  function activateRow(row: SpellcheckContextRow) {
    switch (row.action) {
      case "ignore":
        ignoreWord(open.word)
        onIgnore?.(open.word)
        break
      case "ignoreAll":
        ignoreWordAll(open.word)
        onIgnoreAll?.(open.word)
        break
      case "addToDictionary":
        addToDictionary(open.word)
        break
      case undefined:
        break
    }
    if (row.browser) runSpellcheckBrowserAction(row.browser)
    else if (row.command) {
      window.dispatchEvent(
        new CustomEvent("wo-command", { detail: { command: row.command, value: row.value } }),
      )
    }
    setMenu(null)
  }

  const itemStyle: CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "5px 24px 5px 12px",
    background: "transparent",
    border: "none",
    fontSize: 13,
    fontFamily: "'Aptos', 'Calibri', 'Segoe UI', Roboto, sans-serif",
    color: "#333",
    cursor: "pointer",
  }

  function renderRow(row: SpellcheckContextRow): JSX.Element {
    return (
      <button
        key={row.id}
        type="button"
        role="menuitem"
        data-row-id={row.id}
        className="spellcheck-action"
        style={itemStyle}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => activateRow(row)}
      >
        {row.label}
      </button>
    )
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Spellcheck context menu"
      className="spellcheck-context-menu"
      style={{ left: menu.x, top: menu.y, minWidth: 200 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Suggestions block — OO lists the engine's replacements on top. */}
      {menu.suggestions.length > 0 ? (
        menu.suggestions.slice(0, SPELLCHECK_MAX_SUGGESTIONS).map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            role="menuitem"
            className="spellcheck-suggestion"
            data-suggestion={suggestion}
            style={itemStyle}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applySuggestion(suggestion)}
          >
            {suggestion}
          </button>
        ))
      ) : (
        <div style={{ padding: "6px 12px", color: "#999", fontSize: 13 }}>No suggestions</div>
      )}

      {SPELLCHECK_CONTEXT_ROWS.map((row) => (
        <div key={row.id} role="presentation">
          {row.divider && <div aria-hidden="true" className="spellcheck-divider" />}
          {renderRow(row)}
        </div>
      ))}
    </div>
  )
}
