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

import type { WoCommand } from "@world-office/editor-common"
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
    case "insertTable":
    case "insert-table":
      return "insert-table"
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
    default:
      return null
  }
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
    case "lineSpacing":
      return value ? { lineSpacing: Number.parseInt(value, 10) } : { lineSpacing: 360 }
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
    const structureOp = structureOpForCommand(command)
    if (structureOp) {
      editorRef.current?.applyStructureOp(structureOp)
      return
    }

    // 3. Clipboard / edit → monaco or rich-text bridge
    if (
      command === "cut" ||
      command === "copy" ||
      command === "paste" ||
      command === "undo" ||
      command === "redo" ||
      command === "selectAll"
    ) {
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

    // 4. Panel-opening commands
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
      default:
        break
    }

    // 5. lib-backed commands — forwarded to the rich-text bridge so the
    //    (future) canvas-backed lib implementations can hook in; today they
    //    fall through to Monaco/text mode when that's the active editor.
    const libCommands = new Set([
      "blockquote",
      "codeBlock",
      "insertFootnote",
      "insertEndnote",
      "insertToc",
      "updateToc",
      "insertIndex",
      "updateIndex",
      "insertIndexEntry",
      "toggleTrackChanges",
      "acceptChange",
      "rejectChange",
      "acceptAllChanges",
      "rejectAllChanges",
      "nextChange",
      "insertCheckboxControl",
      "insertDropdownControl",
      "insertDatePickerControl",
      "insertPlainTextControl",
      "columns",
      "pageMargins",
      "pageOrientation",
      "pageSize",
      "insertTextDirection",
      "setTextDirection",
    ])
    if (libCommands.has(command)) {
      onRichTextCommand(command as RichTextCommand, value)
      return
    }

    // 6. Unknown command — log so the coverage audit can flag it
    console.warn(`[word-commands] unhandled command: ${command}`)
  }
}
