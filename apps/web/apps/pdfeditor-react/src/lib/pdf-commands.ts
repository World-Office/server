/**
 * K7 — PDF command router.
 *
 * Routes ribbon spec commands (pdf-ribbon.ts, 44 commands) to PdfStore.
 * The existing usePdfCommandRouter handles right-panel detail commands
 * (annotation props, form controls, table cell ops); this router covers the
 * ribbon-level commands (navigation, zoom, view toggles, annotation tools,
 * insert panels).
 */

import type { WoCommand } from "@world-office/editor-common"
import { pdfStore } from "../stores/PdfStore"

export function createPdfCommandHandler(): (cmd: WoCommand) => void {
  return (cmd: WoCommand): void => {
    const command = cmd.command

    // 1. Navigation
    switch (command) {
      case "goToFirstPage":
        pdfStore.setCurrentPage(0)
        return
      case "goToPrevPage":
        pdfStore.setCurrentPage(Math.max(0, pdfStore.currentPage - 1))
        return
      case "goToNextPage":
        pdfStore.setCurrentPage(Math.min(pdfStore.pageCount - 1, pdfStore.currentPage + 1))
        return
      case "goToLastPage":
        pdfStore.setCurrentPage(pdfStore.pageCount - 1)
        return
      default:
        break
    }

    // 2. Zoom / fit
    switch (command) {
      case "setZoom":
        pdfStore.setZoomLevel(100)
        return
      case "toggleFitToPage":
        pdfStore.setFitToPage(!pdfStore.fitToPage)
        return
      case "toggleFitToWidth":
        pdfStore.setFitToWidth(!pdfStore.fitToWidth)
        return
      default:
        break
    }

    // 3. View toggles
    switch (command) {
      case "toggleLeftPanel":
        pdfStore.toggleLeftPanel("thumbnails")
        return
      case "toggleRightPanel":
        pdfStore.toggleRightPanel("annotations")
        return
      case "toggleMinimap":
        pdfStore.toggleLeftPanel("thumbnails")
        return
      case "toggleStatusbar":
        pdfStore.setStatusbarVisible(!pdfStore.statusbarVisible)
        return
      case "toggleCompactToolbar":
        pdfStore.setToolbarVisible(!pdfStore.toolbarVisible)
        return
      case "toggleTheme":
        // Theme handled by design-system ThemeProvider; keep statusbar visible
        return
      case "toggleWordWrap":
        return
      case "toggleEditMode":
        pdfStore.setEditMode(!pdfStore.isEditMode)
        return
      default:
        break
    }

    // 4. Annotation tools
    switch (command) {
      case "annotationHighlight":
        pdfStore.setAnnotationTool("highlight")
        return
      case "annotationUnderline":
        pdfStore.setAnnotationTool("underline")
        return
      case "annotationStrikeout":
        pdfStore.setAnnotationTool("strikeout")
        return
      case "annotationTextComment":
        pdfStore.setAnnotationTool("text-comment")
        return
      case "annotationShapeComment":
        pdfStore.setAnnotationTool("shape-comment")
        return
      case "annotationStamp":
        pdfStore.setAnnotationTool("stamp")
        return
      default:
        break
    }

    // 5. Insert panels
    switch (command) {
      case "insertImage":
        pdfStore.toggleRightPanel("image")
        return
      case "insertText":
        pdfStore.toggleRightPanel("paragraph")
        return
      case "insertShape":
        pdfStore.toggleRightPanel("shape")
        return
      case "insertTable":
        pdfStore.toggleRightPanel("table")
        return
      case "insertChart":
        pdfStore.toggleRightPanel("chart")
        return
      case "insertHyperlink":
      case "insertEquation":
      case "insertSymbol":
      case "insertSmartArt":
      case "insertTextArt":
        pdfStore.toggleRightPanel("textart")
        return
      case "addFormField":
        pdfStore.toggleRightPanel("form")
        return
      default:
        break
    }

    // 6. Find / redact panels
    switch (command) {
      case "find":
      case "replace":
      case "findRedact":
      case "redactPages":
      case "markRedaction":
      case "applyRedactions":
        pdfStore.toggleLeftPanel("search")
        return
      default:
        break
    }

    // 7. Silent: clipboard + select (routed via Monaco/text)
    if (command === "cut" || command === "copy" || command === "paste" || command === "selectAll") {
      return
    }

    // 8. Unknown
    console.warn(`[pdf-commands] unhandled command: ${command}`)
  }
}
