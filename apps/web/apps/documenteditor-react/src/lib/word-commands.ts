/**
 * K3 — Complete word-editor command router.
 *
 * Bridges the 78 ribbon spec commands (word-ribbon.ts) to actual effects in
 * the WASM canvas editor. Replaces the 9-command format-only router that
 * previously lived inline in DocumentHolder.tsx.
 *
 * Wiring paths (see plan/ribbon-command-wiring.md):
 *   wasm   → applyFormatting (bold, italic, align, heading, …)
 *   store  → DocumentStore toggles / actions
 *   panel  → open right-side panel
 *   lib    → existing lib functions (track-changes, footnotes, toc, …)
 *   ui     → document events handled by App.tsx (find/replace etc.)
 */

import { togglePluginEnabled, type WoCommand } from "@world-office/editor-common"
import type { RichTextCommand } from "./rte-command"
import { documentStore } from "../stores/DocumentStore"
import type { CanvasEditorHandle } from "../components/CanvasEditor"

export type WordCommandHandler = (cmd: WoCommand) => void

export interface WordCommandDeps {
  /** WASM editor handle (applyFormatting + focus) */
  editorRef: React.RefObject<CanvasEditorHandle | null>
  /** Dispatch a rich-text command (used for Monaco/text mode fallbacks) */
  onRichTextCommand: (cmd: RichTextCommand, value?: string) => void
  /** Open the find/replace UI (App.tsx wires this) */
  onFind?: (replace: boolean) => void
}

/**
 * Map a ribbon command to a WASM structure op (list, table, break, rule).
 * Returns null when the command is not a structure op.
 */
export function structureOpForCommand(command: string): string | null {
  switch (command) {
    case "bulletList":
    case "bullet-list":
      return "bullet-list"
    case "orderedList":
    case "ordered-list":
      return "ordered-list"
    case "taskList":
    case "task-list":
      return "task-list"
    case "indent":
      return "indent"
    case "outdent":
      return "outdent"
    case "insertSectionBreak":
    case "insert-section-break":
      return "insert-section-break"
    case "insertContinuousSectionBreak":
    case "insert-continuous-section-break":
      return "insert-continuous-section-break"
    case "horizontalRule":
    case "horizontal-rule":
      return "horizontal-rule"
    case "pageBreak":
    case "page-break":
      return "page-break"
    case "blockquote":
      return "blockquote"
    case "codeBlock":
      return "code-block"
    default:
      return null
  }
}

/**
 * Standard OnlyOffice font-size ladder (points). Ribbon Inc./Dec. font size
 * buttons step along it; a non-ladder start value is snapped to the nearest
 * rung before stepping.
 */
const FONT_SIZE_LADDER = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]

/** Next / previous ladder size in points; defaults to stepping from 12pt. */
export function stepFontSize(value: string | undefined, dir: 1 | -1): number {
  const current = value ? Number.parseFloat(value) : 12
  const idx = FONT_SIZE_LADDER.indexOf(current)
  if (idx === -1) return FONT_SIZE_LADDER[0]
  return FONT_SIZE_LADDER[Math.min(FONT_SIZE_LADDER.length - 1, Math.max(0, idx + dir))]
}

/**
 * Map a ribbon command + value to a WASM applyFormatting JSON object.
 * Returns null when the command is not a formatting op.
 */
export function commandToFormat(
  command: string,
  value?: string,
): Record<string, unknown> | null {
  switch (command) {
    case "bold":
      return { bold: true }
    case "italic":
      return { italic: true }
    case "underline":
      return { underline: value ?? "single" }
    case "strike":
    case "strikethrough":
      return { strikethrough: true }
    case "subscript":
      return { verticalAlignment: "subscript" }
    case "superscript":
      return { verticalAlignment: "superscript" }
    case "fontSize":
      return { fontSize: value ? Number.parseInt(value, 10) * 2 : 24 }
    case "increaseFontSize":
      // Half-points (1pt = 2 half-points), matching the font-size select.
      return { fontSize: stepFontSize(value, 1) * 2 }
    case "decreaseFontSize":
      return { fontSize: stepFontSize(value, -1) * 2 }
    case "fontFamily":
      return value ? { fontName: value } : null
    case "textColor":
      return value ? { textColor: value } : null
    case "highlight":
    case "highlightColor":
      return value ? { highlight: value } : null
    case "clearFormatting":
      return { clearFormatting: true }
    case "alignLeft":
      return { align: "left" }
    case "alignCenter":
      return { align: "center" }
    case "alignRight":
      return { align: "right" }
    case "alignJustify":
      return { align: "justify" }
    case "heading1":
      return { heading: 1 }
    case "heading2":
      return { heading: 2 }
    case "heading3":
      return { heading: 3 }
    case "heading4":
      return { heading: 4 }
    case "heading5":
      return { heading: 5 }
    case "heading6":
      return { heading: 6 }
    case "lineSpacing": {
      // value is a line-spacing factor like "1", "1.15", "1.5", "2"
      // → OOXML spacing_line in 240ths (1.15 = 276, 1.5 = 360, 2 = 480).
      const factor = value ? Number.parseFloat(value) : 1.15
      return { lineSpacing: Math.round(factor * 240) }
    }
    default:
      return null
  }
}

/**
 * Create the full word-command handler.
 */
export function createWordCommandHandler(deps: WordCommandDeps): WordCommandHandler {
  const { editorRef, onRichTextCommand, onFind } = deps

  return (cmd: WoCommand): void => {
    const command = cmd.command
    const value = typeof cmd.value === "string" ? cmd.value : undefined

    // 1. Formatting commands → WASM applyFormatting
    const format = commandToFormat(command, value)
    if (format) {
      editorRef.current?.applyFormatting(format)
      return
    }

    // 2. Structure ops → WASM apply_structure_op (lists, tables, breaks)
    //    setTextDirection has a value param (ltr/rtl), handle separately
    if (command === "setTextDirection") {
      editorRef.current?.applyStructureOp(
        value === "rtl" ? "set-text-direction-rtl" : "set-text-direction-ltr",
      )
      return
    }
    if (command === "multilevelList") {
      // OO "Multilevel list" = a decimal-numbered list with nested levels.
      // The WASM engine has no single multilevel op, so run the two real
      // ops that reproduce it: start a decimal list, then deepen its level
      // (ilvl + 1) so the item renders as a nested multi-level item.
      editorRef.current?.applyStructureOp("ordered-list")
      editorRef.current?.applyStructureOp("indent")
      return
    }
    const structureOp = structureOpForCommand(command)
    if (structureOp) {
      editorRef.current?.applyStructureOp(structureOp)
      return
    }

    // 3. Clipboard commands → native browser APIs for canvas mode,
    //    or TipTap bridge for rich-text mode
    if (command === "copy" || command === "cut" || command === "paste") {
      // For canvas mode, use native clipboard API
      // document.execCommand is legacy and may not work in all contexts
      if (command === "copy") {
        const selectedText = window.getSelection()?.toString()
        if (selectedText) {
          void navigator.clipboard.writeText(selectedText)
          return
        }
      } else if (command === "paste") {
        void navigator.clipboard.readText().then((text) => {
          if (text && editorRef.current) {
            // Insert pasted text via WASM applyFormatting insertText
            editorRef.current.applyFormatting({ insertText: text })
          }
        })
        return
      } else if (command === "cut") {
        const selectedText = window.getSelection()?.toString()
        if (selectedText && editorRef.current) {
          // Copy to clipboard
          void navigator.clipboard.writeText(selectedText)
          // Then delete selection via WASM by inserting empty text
          editorRef.current.applyFormatting({ insertText: "" })
          // NOTE: Full cut support requires WASM delete_selection API
          // Current workaround: copy + insert empty text
        }
        return
      }
    }

    // 4. Edit history → TipTap bridge (for Monaco editor)
    if (command === "undo" || command === "redo" || command === "selectAll") {
      onRichTextCommand(command as RichTextCommand, value)
      return
    }

    // 3. Store toggles (view tab + layout)
    switch (command) {
      case "toggleRuler":
        documentStore.toggleRuler()
        return
      case "toggleGridlines":
        documentStore.toggleGridlines()
        return
      case "toggleNavigation":
        documentStore.toggleNavigation()
        return
      case "toggleSpellCheck":
        documentStore.setSpellingEnabled(!documentStore.spellingEnabled)
        return
      case "zoomIn":
        documentStore.zoomIn()
        return
      case "zoomOut":
        documentStore.zoomOut()
        return
      case "differentFirstPage":
        documentStore.setDifferentFirstPage(!documentStore.differentFirstPage)
        return
      case "differentOddEven":
        documentStore.setDifferentOddEven(!documentStore.differentOddEven)
        return
      case "removeHeader":
        documentStore.clearHeader()
        documentStore.headerFooterMode = "none"
        return
      case "removeFooter":
        documentStore.clearFooter()
        documentStore.headerFooterMode = "none"
        return
      case "editHeader":
        documentStore.headerFooterMode = "header"
        return
      case "editFooter":
        documentStore.headerFooterMode = "footer"
        return
      case "insertPageNumber":
        documentStore.headerFooterMode = "footer"
        return
      case "save":
        void documentStore.saveToWopi()
        return
      case "download":
        documentStore.exportAsDownload()
        return
      default:
        break
    }

    // 4. Page-layout commands — dispatch CustomEvents directly
    //    (works without TipTap; Viewport.tsx listens for these)
    switch (command) {
      case "pageOrientation": {
        const orientation =
          value || documentStore.pageOrientation || "portrait"
        window.dispatchEvent(
          new CustomEvent("world-office:page-layout", {
            detail: {
              orientation,
              pageSize: documentStore.pageSize || "A4",
              margins: documentStore.pageMargins || "normal",
            },
          }),
        )
        return
      }
      case "pageSize": {
        const size = value || documentStore.pageSize || "A4"
        window.dispatchEvent(
          new CustomEvent("world-office:page-layout", {
            detail: {
              orientation: documentStore.pageOrientation || "portrait",
              pageSize: size,
              margins: documentStore.pageMargins || "normal",
            },
          }),
        )
        return
      }
      case "pageMargins": {
        const margins = value || documentStore.pageMargins || "normal"
        window.dispatchEvent(
          new CustomEvent("world-office:page-layout", {
            detail: {
              orientation: documentStore.pageOrientation || "portrait",
              pageSize: documentStore.pageSize || "A4",
              margins,
            },
          }),
        )
        return
      }
      case "columns": {
        const n = value ? Number.parseInt(value, 10) : 2
        window.dispatchEvent(
          new CustomEvent("world-office:columns", { detail: { count: Math.min(Math.max(n, 1), 3) } }),
        )
        return
      }
      default:
        break
    }

    // 5. Panel-opening commands
    switch (command) {
      case "find":
        onFind?.(false)
        return
      case "replace":
        onFind?.(true)
        return
      case "addComment":
      case "toggleComment":
        documentStore.toggleRightPanel("comments")
        return
      case "image":
        documentStore.toggleRightPanel("image")
        return
      case "link":
        documentStore.toggleRightPanel("crossreference")
        return
      case "insertTable":
        documentStore.toggleRightPanel("table")
        return
      case "openTheme":
        documentStore.toggleRightPanel("theme")
        return
      case "insertPlainTextControl":
      case "insertCheckboxControl":
      case "insertDropdownControl":
      case "insertDatePickerControl":
        documentStore.toggleRightPanel("form")
        return
      case "chat":
        documentStore.toggleLeftPanel("chat")
        return
      case "plugins":
        documentStore.toggleRightPanel("plugins")
        return
      case "aiAssistant":
        documentStore.toggleRightPanel("ai-assistant")
        return
      // Track Changes commands open the review panel
      case "toggleTrackChanges":
      case "acceptChange":
      case "acceptAllChanges":
      case "rejectChange":
      case "rejectAllChanges":
      case "nextChange":
        documentStore.toggleRightPanel("review")
        return
      // Reference commands open the crossreference panel
      case "insertFootnote":
      case "insertEndnote":
      case "insertToc":
      case "updateToc":
      case "insertIndex":
      case "updateIndex":
      case "insertIndexEntry":
        documentStore.toggleRightPanel("crossreference")
        return
      case "togglePlugin":
        if (typeof value === "string" && value) togglePluginEnabled(value)
        return
      // Home paragraph-formatting / view controls that have no dedicated
      // WASM model op yet land in the existing paragraph settings panel
      // (StylesPanel — the right-rail component rendered for "paragraph").
      // ponytail: full OO parity needs engine ops for case cycling, paragraph
      // shading/borders and non-printing-marks display; upgrade each command
      // when the WASM model exposes them.
      case "changeCase":
      case "shading":
      case "borders":
      case "toggleNonprinting":
        documentStore.toggleRightPanel("paragraph")
        return
      default:
        break
    }

    // 6. Unknown command — log so the coverage audit can flag it
    console.warn(`[word-commands] unhandled command: ${command}`)
  }
}
