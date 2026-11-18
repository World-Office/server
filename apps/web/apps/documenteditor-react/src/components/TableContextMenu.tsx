import type { CSSProperties, JSX } from "react"
import { useEffect, useRef, useState } from "react"

/**
 * PGP-1 — table context menu (OO ctx-contracts, table rows).
 *
 * OnlyOffice's document-editor context menu inside a table has 17 rows
 * (live-verified against OO 9.4.0, see config/port-graph-parity/tasks.json):
 *
 *   Cut, Copy, Paste, PrintSelection, Select, Delete, MergeCells, SplitCell,
 *   DistributeRows, DistributeColumns, TextAlignment, InsertCaption,
 *   TableProperties, Link, ParagraphSettings, FormattingAsStyle, AI
 *
 * Every contract row is rendered — rows with a real command surface dispatch
 * the usual `wo-command` CustomEvent (same path as the ribbon / right-rail
 * panels), the clipboard/print rows stay browser-side exactly like OO does
 * (native execCommand + window.getSelection).
 */

/** Rows OO implements with browser APIs (no editor command behind them). */
export type TableBrowserAction = "cut" | "copy" | "paste" | "delete" | "selectAll" | "print"

export interface TableContextRow {
  /** OO ctx-contract row id (CamelCase) — or an app id for the extra rows. */
  id: string
  label: string
  /** Set on the 17 live-verified OO contract rows (contract-coverage test). */
  contract?: boolean
  /** `wo-command` payload dispatched on click. */
  command?: string
  value?: string
  /** Browser-side action (ctx-contracts marks Cut/Copy/Paste/… as native). */
  browser?: TableBrowserAction
  /** Sub-rows (OO renders these as submenus: Delete, Text Alignment). */
  children?: TableContextRow[]
  /** Visual separator above the row, mirroring the OO menu grouping. */
  divider?: boolean
}

/** The OO table-context contract, in OO's own order. */
export const TABLE_CONTEXT_CONTRACT_ROWS: readonly string[] = [
  "Cut",
  "Copy",
  "Paste",
  "PrintSelection",
  "Select",
  "Delete",
  "MergeCells",
  "SplitCell",
  "DistributeRows",
  "DistributeColumns",
  "TextAlignment",
  "InsertCaption",
  "TableProperties",
  "Link",
  "ParagraphSettings",
  "FormattingAsStyle",
  "AI",
]

/** Text-alignment sub-rows — OO's "Text Alignment" submenu. */
const TEXT_ALIGNMENT_ROWS: TableContextRow[] = [
  { id: "alignLeft", label: "Align Left", command: "alignLeft" },
  { id: "alignCenter", label: "Align Center", command: "alignCenter" },
  { id: "alignRight", label: "Align Right", command: "alignRight" },
  { id: "alignJustify", label: "Justify", command: "alignJustify" },
]

/** Delete sub-rows — OO's "Delete" submenu (rows / columns / whole table). */
const DELETE_ROWS: TableContextRow[] = [
  { id: "deleteRow", label: "Delete Rows", command: "deleteRow" },
  { id: "deleteColumn", label: "Delete Columns", command: "deleteColumn" },
  { id: "deleteTable", label: "Delete Table", command: "deleteTable" },
]

/**
 * Rows rendered by the menu. The first 17 ids are the OO contract rows in
 * order; the trailing insert/delete-structure group re-uses the existing
 * table commands so the menu can also grow/shrink the table (not part of
 * the contract surface, so `contract` is false there).
 */
export const TABLE_CONTEXT_ROWS: readonly TableContextRow[] = [
  { id: "Cut", label: "Cut", contract: true, browser: "cut" },
  { id: "Copy", label: "Copy", contract: true, browser: "copy" },
  { id: "Paste", label: "Paste", contract: true, browser: "paste" },
  { id: "PrintSelection", label: "Print Selection", contract: true, browser: "print" },
  { id: "Select", label: "Select All", contract: true, browser: "selectAll" },
  { id: "Delete", label: "Delete", contract: true, children: DELETE_ROWS, divider: true },
  { id: "MergeCells", label: "Merge Cells", contract: true, command: "mergeCells", divider: true },
  { id: "SplitCell", label: "Split Cell", contract: true, command: "splitCell" },
  {
    id: "DistributeRows",
    label: "Distribute Rows",
    contract: true,
    command: "distributeRows",
  },
  {
    id: "DistributeColumns",
    label: "Distribute Columns",
    contract: true,
    command: "distributeColumns",
  },
  {
    id: "TextAlignment",
    label: "Text Alignment",
    contract: true,
    children: TEXT_ALIGNMENT_ROWS,
    divider: true,
  },
  {
    id: "InsertCaption",
    label: "Insert Caption",
    contract: true,
    command: "insertCaptionTable",
    divider: true,
  },
  { id: "TableProperties", label: "Table Properties", contract: true, command: "tableProperties" },
  { id: "Link", label: "Link", contract: true, command: "link" },
  {
    id: "ParagraphSettings",
    label: "Paragraph Settings",
    contract: true,
    command: "paragraphSettings",
  },
  {
    id: "FormattingAsStyle",
    label: "Formatting as Style",
    contract: true,
    command: "formattingAsStyle",
  },
  { id: "AI", label: "AI", contract: true, command: "aiAssistant", divider: true },
  // Extra structure rows (existing table commands, not in the OO contract).
  { id: "insertRowBefore", label: "Insert Row Above", command: "addRowBefore", divider: true },
  { id: "insertRowAfter", label: "Insert Row Below", command: "addRowAfter" },
  { id: "insertColumnBefore", label: "Insert Column Left", command: "addColumnBefore" },
  { id: "insertColumnAfter", label: "Insert Column Right", command: "addColumnAfter" },
]

/**
 * Run one of the browser-side ctx rows. OO keeps clipboard / print / select
 * handling in the browser layer (no editor command), so we do too.
 */
export function runTableBrowserAction(action: TableBrowserAction): void {
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
    case "delete":
      document.execCommand("delete")
      return
    case "selectAll":
      document.execCommand("selectAll")
      return
    case "print":
      window.print()
      return
  }
}

/**
 * Does this context-menu target belong to a table? The WASM canvas and the
 * TipTap surface both render real `<table>` markup, so a `closest("table")`
 * hit is the trigger condition (plus the canvas' table wrapper attribute).
 */
export function isTableTarget(target: EventTarget | null): boolean {
  const el = target as Element | null
  if (el === null || typeof el.closest !== "function") return false
  // Let the spellcheck context menu own misspelled words (OO shows that menu).
  if (el.closest(".spellcheck-error") !== null) return false
  return el.closest("table, [data-wo-table]") !== null
}

interface MenuState {
  x: number
  y: number
}

interface TableContextMenuProps {
  /** Element to listen on — defaults to `document` (whole editor surface). */
  editorElement?: HTMLElement | null
}

export function TableContextMenu({ editorElement = null }: TableContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target: HTMLElement | Document = editorElement ?? document

    const handleContextMenu = (e: Event) => {
      const me = e as MouseEvent
      if (!isTableTarget(me.target)) {
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

  function activateRow(row: TableContextRow) {
    if (row.browser) runTableBrowserAction(row.browser)
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

  function renderRow(row: TableContextRow, indent = false): JSX.Element {
    return (
      <button
        key={row.id}
        type="button"
        role="menuitem"
        data-row-id={row.id}
        style={{ ...itemStyle, paddingLeft: indent ? 24 : 12 }}
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
      aria-label="Table context menu"
      className="wo-table-context-menu"
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
      {TABLE_CONTEXT_ROWS.map((row) => (
        <div key={row.id} role={row.children ? "group" : "presentation"}>
          {row.divider && (
            <div aria-hidden="true" style={{ height: 1, background: "#e6e6e6", margin: "4px 0" }} />
          )}
          {row.children ? (
            <>
              {/* Submenu rows (Delete, Text Alignment) carry the OO row id on
                  the group; each sub-row is its own menu item. */}
              <div
                data-row-id={row.id}
                style={{ ...itemStyle, cursor: "default", color: "#666", fontWeight: 600 }}
              >
                {row.label}
              </div>
              {row.children.map((child) => renderRow(child, true))}
            </>
          ) : (
            renderRow(row)
          )}
        </div>
      ))}
    </div>
  )
}
