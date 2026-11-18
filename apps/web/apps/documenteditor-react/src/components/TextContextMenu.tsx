import type { CSSProperties, JSX } from "react"
import { useEffect, useRef, useState } from "react"
import { isTableTarget } from "./TableContextMenu"

/**
 * PGP-A1 — text context menu (OO ctx-contracts, text rows).
 *
 * OnlyOffice's document-editor context menu over plain text has 11 rows
 * (live-verified against OO 9.4.0, see census/ctx-contracts.json → text):
 *
 *   Cut, Copy, Paste, PrintSelection, PageBreakBefore, KeepLines,
 *   ParagraphSettings, AddComment, Link, FormattingAsStyle, AI
 *
 * Every contract row is rendered — rows with a real command surface dispatch
 * the usual `wo-command` CustomEvent (same path as the ribbon / right-rail
 * panels), the clipboard/print rows stay browser-side exactly like OO does
 * (native execCommand + window.print).
 */

/** Rows OO implements with browser APIs (no editor command behind them). */
export type TextBrowserAction = "cut" | "copy" | "paste" | "print"

export interface TextContextRow {
  /** OO ctx-contract row id (CamelCase). */
  id: string
  label: string
  /** Set on the 11 live-verified OO contract rows (contract-coverage test). */
  contract?: boolean
  /** `wo-command` payload dispatched on click. */
  command?: string
  value?: string
  /** Browser-side action (ctx-contracts marks Cut/Copy/Paste/… as native). */
  browser?: TextBrowserAction
  /** Visual separator above the row, mirroring the OO menu grouping. */
  divider?: boolean
}

/** The OO text-context contract, in OO's own order. */
export const TEXT_CONTEXT_CONTRACT_ROWS: readonly string[] = [
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
 * Rows rendered by the menu — exactly the 11 OO contract rows in OO's order.
 */
export const TEXT_CONTEXT_ROWS: readonly TextContextRow[] = [
  { id: "Cut", label: "Cut", contract: true, browser: "cut" },
  { id: "Copy", label: "Copy", contract: true, browser: "copy" },
  { id: "Paste", label: "Paste", contract: true, browser: "paste" },
  { id: "PrintSelection", label: "Print Selection", contract: true, browser: "print" },
  { id: "PageBreakBefore", label: "Page Break Before", contract: true, command: "pageBreakBefore" },
  { id: "KeepLines", label: "Keep Lines Together", contract: true, command: "keepLines" },
  {
    id: "ParagraphSettings",
    label: "Paragraph Settings",
    contract: true,
    command: "paragraphSettings",
    divider: true,
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

/**
 * Run one of the browser-side ctx rows. OO keeps clipboard / print handling
 * in the browser layer (no editor command), so we do too.
 */
export function runTextBrowserAction(action: TextBrowserAction): void {
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
 * Does this context-menu target belong to plain text? The target must be
 * inside a document editing surface (TipTap rich-text editor, WASM canvas
 * or a contenteditable region) and must NOT belong to one of the menus that
 * own their own targets: misspelled words (SpellcheckContextMenu), tables
 * (TableContextMenu) and images/shapes (their ctx menus).
 */
export function isTextTarget(target: EventTarget | null): boolean {
  const el = target as Element | null
  if (el === null || typeof el.closest !== "function") return false
  // Let the spellcheck context menu own misspelled words (OO shows that menu).
  if (el.closest(".spellcheck-error") !== null) return false
  // Let the table context menu own table content (same exclusion list).
  if (isTableTarget(el)) return false
  // Let the image / shape menus own their targets (data-wo-image/-shape).
  if (el.closest("img, svg, [data-wo-image], [data-wo-shape], .wo-shape") !== null) return false
  const editorSurface =
    ".rich-text-editor, .de-document-canvas, [contenteditable='true'], [data-wo-text]"
  return el.closest(editorSurface) !== null
}

interface MenuState {
  x: number
  y: number
}

interface TextContextMenuProps {
  /** Element to listen on — defaults to `document` (whole editor surface). */
  editorElement?: HTMLElement | null
}

export function TextContextMenu({ editorElement = null }: TextContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target: HTMLElement | Document = editorElement ?? document

    const handleContextMenu = (e: Event) => {
      const me = e as MouseEvent
      if (!isTextTarget(me.target)) {
        setMenu(null)
        return
      }
      me.preventDefault()
      setMenu({ x: me.clientX, y: me.clientY })
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
  }, [editorElement])

  function activateRow(row: TextContextRow) {
    if (row.browser) runTextBrowserAction(row.browser)
    else if (row.command) {
      window.dispatchEvent(
        new CustomEvent("wo-command", { detail: { command: row.command, value: row.value } }),
      )
    }
    setMenu(null)
  }

  if (menu === null) return null

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

  function renderRow(row: TextContextRow): JSX.Element {
    return (
      <button
        key={row.id}
        type="button"
        role="menuitem"
        data-row-id={row.id}
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
      aria-label="Text context menu"
      className="wo-text-context-menu"
      style={{
        position: "fixed",
        left: menu.x,
        top: menu.y,
        minWidth: 200,
        background: "#fff",
        border: "1px solid #d5d5d5",
        borderRadius: 4,
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
        padding: "4px 0",
        zIndex: 10002,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {TEXT_CONTEXT_ROWS.map((row) => (
        <div key={row.id} role="presentation">
          {row.divider && (
            <div aria-hidden="true" style={{ height: 1, background: "#e6e6e6", margin: "4px 0" }} />
          )}
          {renderRow(row)}
        </div>
      ))}
    </div>
  )
}
