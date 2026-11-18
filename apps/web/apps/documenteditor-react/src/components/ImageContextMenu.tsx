import type { CSSProperties, JSX } from "react"
import { useEffect, useRef, useState } from "react"
import { isTableTarget } from "./TableContextMenu"

/**
 * PGP-A2 — image context menu (OO ctx-contracts, image rows).
 *
 * OnlyOffice's document-editor context menu over an image has 17 rows
 * (live-verified against OO 9.4.0, see census/ctx-contracts.json → image /
 * config/port-graph-parity/tasks.json → PGP-A2):
 *
 *   Cut, Copy, Paste, PrintSelection, Arrange, Align, CombineShapes,
 *   TextWrap, Rotate, InsertCaption, SaveAsImage, Link, Crop, ActualSize,
 *   ReplaceImage, ImageSettings, AI
 *
 * Every contract row is rendered — rows with a real command surface dispatch
 * the usual `wo-command` CustomEvent (same path as the ribbon / right-rail
 * panels), the clipboard/print rows stay browser-side exactly like OO does
 * (native execCommand + window.print).
 */

/** Rows OO implements with browser APIs (no editor command behind them). */
export type ImageBrowserAction = "cut" | "copy" | "paste" | "print"

export interface ImageContextRow {
  /** OO ctx-contract row id (CamelCase) — or an app id for sub-rows. */
  id: string
  label: string
  /** Set on the 17 live-verified OO contract rows (contract-coverage test). */
  contract?: boolean
  /** `wo-command` payload dispatched on click. */
  command?: string
  value?: string
  /** Browser-side action (ctx-contracts marks Cut/Copy/Paste/… as native). */
  browser?: ImageBrowserAction
  /** Sub-rows (OO renders these as submenus: Arrange). */
  children?: ImageContextRow[]
  /** Visual separator above the row, mirroring the OO menu grouping. */
  divider?: boolean
}

/** The OO image-context contract, in OO's own order. */
export const IMAGE_CONTEXT_CONTRACT_ROWS: readonly string[] = [
  "Cut",
  "Copy",
  "Paste",
  "PrintSelection",
  "Arrange",
  "Align",
  "CombineShapes",
  "TextWrap",
  "Rotate",
  "InsertCaption",
  "SaveAsImage",
  "Link",
  "Crop",
  "ActualSize",
  "ReplaceImage",
  "ImageSettings",
  "AI",
]

/** Arrange sub-rows — OO's "Arrange" submenu (bring/send + align objects). */
const ARRANGE_ROWS: ImageContextRow[] = [
  { id: "bringForward", label: "Bring Forward", command: "bringForward" },
  { id: "sendBackward", label: "Send Backward", command: "sendBackward" },
  { id: "alignObjects", label: "Align Objects", command: "alignObjects" },
]

/**
 * Rows rendered by the menu — exactly the 17 OO contract rows in OO's order.
 */
export const IMAGE_CONTEXT_ROWS: readonly ImageContextRow[] = [
  { id: "Cut", label: "Cut", contract: true, browser: "cut" },
  { id: "Copy", label: "Copy", contract: true, browser: "copy" },
  { id: "Paste", label: "Paste", contract: true, browser: "paste" },
  { id: "PrintSelection", label: "Print Selection", contract: true, browser: "print" },
  { id: "Arrange", label: "Arrange", contract: true, children: ARRANGE_ROWS, divider: true },
  { id: "Align", label: "Align", contract: true, command: "alignObjects" },
  // OO's CombineShapes op merges selected shapes; on an image selection the
  // arrange surface is what OO reveals — still a real dispatched command.
  { id: "CombineShapes", label: "Combine Shapes", contract: true, command: "mergeShapes" },
  { id: "TextWrap", label: "Text Wrap", contract: true, command: "textWrap" },
  { id: "Rotate", label: "Rotate", contract: true, command: "rotateImage" },
  { id: "InsertCaption", label: "Insert Caption", contract: true, command: "insertCaptionFigure" },
  { id: "SaveAsImage", label: "Save as Image", contract: true, command: "saveAsImage" },
  { id: "Link", label: "Link", contract: true, command: "link" },
  { id: "Crop", label: "Crop", contract: true, command: "crop", divider: true },
  { id: "ActualSize", label: "Actual Size", contract: true, command: "actualSize" },
  { id: "ReplaceImage", label: "Replace Image", contract: true, command: "replaceImage" },
  { id: "ImageSettings", label: "Image Settings", contract: true, command: "image" },
  { id: "AI", label: "AI", contract: true, command: "aiAssistant", divider: true },
]

/**
 * Run one of the browser-side ctx rows. OO keeps clipboard / print handling
 * in the browser layer (no editor command), so we do too.
 */
export function runImageBrowserAction(action: ImageBrowserAction): void {
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
 * Does this context-menu target belong to an image? The WASM canvas and the
 * TipTap surface both render real `<img>` markup, so a `closest("img")` hit
 * is the trigger condition (plus the canvas' image wrapper attribute).
 * Misspelled words (spellcheck menu) and table content (table menu) own
 * their own targets even when an image is inside them.
 */
export function isImageTarget(target: EventTarget | null): boolean {
  const el = target as Element | null
  if (el === null || typeof el.closest !== "function") return false
  // Let the spellcheck context menu own misspelled words (OO shows that menu).
  if (el.closest(".spellcheck-error") !== null) return false
  // Let the table context menu own table content (same exclusion list).
  if (isTableTarget(el)) return false
  return el.closest("img, [data-wo-image]") !== null
}

interface MenuState {
  x: number
  y: number
}

interface ImageContextMenuProps {
  /** Element to listen on — defaults to `document` (whole editor surface). */
  editorElement?: HTMLElement | null
}

export function ImageContextMenu({ editorElement = null }: ImageContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target: HTMLElement | Document = editorElement ?? document

    const handleContextMenu = (e: Event) => {
      const me = e as MouseEvent
      if (!isImageTarget(me.target)) {
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

  function activateRow(row: ImageContextRow) {
    if (row.browser) runImageBrowserAction(row.browser)
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

  function renderRow(row: ImageContextRow, indent = false): JSX.Element {
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
      aria-label="Image context menu"
      className="wo-image-context-menu"
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
      {IMAGE_CONTEXT_ROWS.map((row) => (
        <div key={row.id} role={row.children ? "group" : "presentation"}>
          {row.divider && (
            <div aria-hidden="true" style={{ height: 1, background: "#e6e6e6", margin: "4px 0" }} />
          )}
          {row.children ? (
            <>
              {/* Submenu rows (Arrange) carry the OO row id on the group;
                  each sub-row is its own menu item. */}
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
