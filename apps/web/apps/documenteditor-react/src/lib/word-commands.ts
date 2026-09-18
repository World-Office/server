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
import { getWasmApi } from "./wasm-renderer"
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
    // OO "Blank Page" inserts a page break at the cursor, pushing the
    // following content onto a fresh page (same real WASM model op).
    case "blankPage":
    case "blank-page":
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
<<<<<<< HEAD
    if (command === "multilevelList") {
      // OO "Multilevel list" = a decimal-numbered list with nested levels.
      // The WASM engine has no single multilevel op, so run the two real
      // ops that reproduce it: start a decimal list, then deepen its level
      // (ilvl + 1) so the item renders as a nested multi-level item.
      editorRef.current?.applyStructureOp("ordered-list")
      editorRef.current?.applyStructureOp("indent")
=======
    if (command === "drawSelect") {
      editorRef.current?.applyStructureOp("select-tool")
      return
    }
    if (command === "drawEraser") {
      editorRef.current?.applyStructureOp("eraser-tool")
>>>>>>> b42fe095a (feat(WOI-DRAW): Draw tab parity)
      return
    }
    if (command === "copyStyle") {
      editorRef.current?.applyStructureOp("copy-style")
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
      case "fitToPage":
        documentStore.setFitToPage(true)
        return
      case "fitToWidth":
        documentStore.setFitToWidth(true)
        return
      case "multiplePages":
        // Open the plugins panel (all plugin buttons open the same panel)
        documentStore.toggleRightPanel("plugins")
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
      case "insertDateTime": {
        // OO inserts an updatable DATETIME field into the active region
        const stamp = new Date().toISOString()
        if (documentStore.headerFooterMode === "footer") {
          documentStore.footerHtml += `<span data-wo-field="DATETIME">${stamp}</span>`
        } else {
          documentStore.headerFooterMode = "header"
          documentStore.headerHtml += `<span data-wo-field="DATETIME">${stamp}</span>`
        }
        return
      }
      case "insertField": {
        // OO field dialog inserts a named field (PAGE, NUMPAGES, …);
        // default to PAGE when opened without a selection
        const name = typeof value === "string" && value ? value : "PAGE"
        if (documentStore.headerFooterMode === "footer") {
          documentStore.footerHtml += `<span data-wo-field="${name}">${name}</span>`
        } else {
          documentStore.headerFooterMode = "header"
          documentStore.headerHtml += `<span data-wo-field="${name}">${name}</span>`
        }
        return
      }
      case "closeHeaderFooter":
        documentStore.headerFooterMode = "none"
        return
      case "save":
        void documentStore.saveToWopi()
        return
      case "download":
        documentStore.exportAsDownload()
        return
      case "wordCount":
        documentStore.toggleRightPanel("word-count")
        return
      case "setDocumentLanguage":
        documentStore.setLanguage(value || "en-US")
        return
      case "toggleMultiplePages":
        documentStore.setMultiplePages(!documentStore.multiplePages)
        return
      case "fitToPage":
        documentStore.setZoomFit("page")
        return
      case "fitToWidth":
        documentStore.setZoomFit("width")
        return
      default:
        break
    }

    // 3b. OnlyOffice File backstage — open the matching FileMenu panel (or
    //     return to the document). The panel ids mirror FileMenuItems actions.
    switch (command) {
      case "back":
        documentStore.setFileMenuOpen(false)
        documentStore.setActiveFileMenuPanel(null)
        return
      case "downloadAs":
        documentStore.setFileMenuOpen(true)
        documentStore.setActiveFileMenuPanel("saveas")
        return
      case "print":
        documentStore.setFileMenuOpen(true)
        documentStore.setActiveFileMenuPanel("printpreview")
        return
      case "protect":
        documentStore.setFileMenuOpen(true)
        documentStore.setActiveFileMenuPanel("protect")
        return
      case "info":
        documentStore.setFileMenuOpen(true)
        documentStore.setActiveFileMenuPanel("info")
        return
      case "advancedSettings":
        documentStore.setFileMenuOpen(true)
        documentStore.setActiveFileMenuPanel("opts")
        return
      case "help":
      case "suggestFeature":
        documentStore.setFileMenuOpen(true)
        documentStore.setActiveFileMenuPanel("help")
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

    // 4.5. Insert text from a file — OO "Text from File" opens a picker and
    //      inserts the chosen file's contents at the cursor. Real behavior:
    //      hidden file input → read as text → WASM insertText model op.
    if (command === "textFromFile") {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = ".txt,.md,.csv,.html,.rtf,.doc,.docx"
      input.style.display = "none"
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
          const text = typeof reader.result === "string" ? reader.result : ""
          if (text && editorRef.current) {
            editorRef.current.applyFormatting({ insertText: text })
          }
        }
        reader.readAsText(file)
      }
      document.body.appendChild(input)
      input.click()
      input.remove()
      return
    }

    // 5. Panel-opening commands
    switch (command) {
      case "protectDocument":
      case "protect-document":
      case "encrypt":
        documentStore.setFileMenuOpen(true)
        documentStore.setActiveFileMenuPanel("protect")
        return
      case "find":
        onFind?.(false)
        return
      case "replace":
        onFind?.(true)
        return
      case "addComment":
      case "toggleComment":
      case "deleteComment":
      case "resolveComment":
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
      // Insert-tab media/objects: Shape, SmartArt and Text Box land on the
      // existing shapes panel (the graphic-object surface; the WASM engine
      // has no op for floating frames yet) — ponytail: add a real
      // object-insertion model op when the engine exposes them.
      case "insertShape":
      case "insertSmartArt":
      case "textBox":
        documentStore.toggleRightPanel("shape")
        return
      case "insertChart":
        documentStore.toggleRightPanel("chart")
        return
      case "textArt":
        documentStore.toggleRightPanel("textart")
        return
      case "dropCap":
        // Drop cap is paragraph-level formatting → paragraph settings panel
        documentStore.toggleRightPanel("paragraph")
        return
      case "insertContentControl":
        documentStore.toggleRightPanel("form")
        return
      case "equation":
      case "symbol":
        // ponytail: no dedicated equation/symbol surface yet — land in the
        // plugins panel (it lists the enabled Equation Editor plugin); add a
        // real picker panel when the engine exposes object insertion.
        documentStore.toggleRightPanel("plugins")
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
      case "protect-document":
        documentStore.toggleRightPanel("review")
        return
      case "plugins":
        documentStore.toggleRightPanel("plugins")
        return
      case "pluginManager":
      case "backgroundPlugins":
      case "photoEditor":
      case "youtube":
      case "ocr":
      case "translator":
      case "mendeley":
      case "thesaurus":
      case "highlightCode":
      case "zotero":
      case "speech":
      case "speechInput":
        // Open the plugins panel (all plugin buttons open the same panel)
        documentStore.toggleRightPanel("plugins")
        return
      case "wordCount":
        // Word count - show word count dialog or open a panel
        // For now, open the plugins panel as a placeholder
        documentStore.toggleRightPanel("plugins")
        return
      case "setDocumentLanguage":
        // Set document language - open language selection dialog
        // For now, open the plugins panel as a placeholder
        documentStore.toggleRightPanel("plugins")
        return
      case "aiAssistant":
      case "ai-assistant":
        documentStore.toggleRightPanel("ai-assistant")
        return
      // Track Changes commands
      case "toggleTrackChanges":
        documentStore.setTrackChanges(!documentStore.trackChanges)
        return
      case "acceptChange":
      case "acceptAllChanges":
      case "rejectChange":
      case "rejectAllChanges":
      case "nextChange":
      case "previousChange":
      case "compareDocuments":
      case "combineDocuments":
      case "displayMode":
        documentStore.toggleRightPanel("review")
        return
      // Mail Merge opens the mailmerge panel
      case "mailMerge":
        documentStore.toggleRightPanel("mailmerge")
        return
      // Reference commands open the crossreference panel
      case "insertFootnote":
      case "insertEndnote":
      case "insertToc":
      case "updateToc":
      case "insertIndex":
      case "updateIndex":
      case "insertIndexEntry":
      case "addTocText":
      case "insertBookmark":
      case "insertCaption":
      case "insertCrossReference":
      case "insertTableOfFigures":
        documentStore.toggleRightPanel("crossreference")
        return
      case "togglePlugin":
        if (typeof value === "string" && value) togglePluginEnabled(value)
        return
      case "copyStyle": {
        // OO "Copy style" (Ctrl+Alt+C): capture the formatting of the run
        // at the current cursor into app state so a surface with a matching
        // apply-path can re-use it (format painter pattern).
        const docHandle = editorRef.current?.getDocHandle?.() ?? null
        const api = docHandle !== null ? getWasmApi() : null
        if (api !== null && docHandle !== null) {
          try {
            documentStore.formatPainterFormat = api.get_run_formatting(docHandle)
          } catch {
            // WASM not ready — leave the previously copied format untouched
          }
        }
        return
      }
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
