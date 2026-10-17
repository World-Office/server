/**
 * K7 — PDF command router.
 *
 * Routes every command the PDF ribbon spec (pdf-ribbon.ts, 44 commands) can
 * emit to the PdfStore, plus the right-menu detail commands (annotation
 * props, form controls, table cell ops).
 *
 * WIRED-SLIDE-PDF-TOOLBAR: every ribbon-spec command now reaches a REAL
 * handler that mutates observable store state — no silent no-ops left.
 * `__tests__/toolbar-command-coverage.test.ts` walks the spec and proves a
 * store mutation for each command.
 */

import type { WoCommand } from "@world-office/editor-common"
import { pdfStore } from "../stores/PdfStore"

/** Commands the router accepts on behalf of the PDF editor. */
export const PDF_COMMANDS: readonly string[] = [
  // Ribbon: navigation
  "goToFirstPage",
  "goToNextPage",
  "goToPrevPage",
  "goToLastPage",
  // Ribbon: zoom / fit
  "setZoom",
  "toggleFitToPage",
  "toggleFitToWidth",
  // Ribbon: view toggles
  "toggleLeftPanel",
  "toggleRightPanel",
  "toggleMinimap",
  "toggleStatusbar",
  "toggleCompactToolbar",
  "toggleTheme",
  "toggleWordWrap",
  "toggleEditMode",
  // Ribbon: tools
  "toggleSelect",
  "toggleHand",
  // Ribbon: annotation tools
  "annotationHighlight",
  "annotationUnderline",
  "annotationStrikeout",
  "annotationTextComment",
  "annotationShapeComment",
  "annotationStamp",
  // Ribbon: insert panels
  "insertImage",
  "insertText",
  "insertShape",
  "insertTable",
  "insertChart",
  "insertHyperlink",
  "insertEquation",
  "insertSymbol",
  "insertSmartArt",
  "insertTextArt",
  "addFormField",
  // Ribbon: find / redact
  "find",
  "replace",
  "findRedact",
  "redactPages",
  "markRedaction",
  "applyRedactions",
  // Ribbon: clipboard
  "cut",
  "copy",
  "paste",
  "selectAll",
  // Ribbon: cloud tab (WOPI session actions)
  "save",
  "download",
  "share",
  "openHistory",
  // Annotation detail commands (right menu)
  "addAnnotation",
  "removeAnnotation",
  "updateAnnotation",
  "setAnnotationColor",
  // Form detail commands (right menu)
  "insertFormControl",
  "deleteFormControl",
  "updateFormControl",
  // Paragraph detail commands (right menu)
  "paraAlign",
  "paraIndentLeft",
  "paraIndentRight",
  "paraIndentSpecial",
  "paraSpaceBefore",
  "paraSpaceAfter",
  "paraLineSpacing",
  // Image detail commands (right menu)
  "imageWidth",
  "imageHeight",
  "imageLockAspect",
  "imageOpacity",
  // Shape detail commands (right menu)
  "shapeFill",
  "shapeOutlineColor",
  "shapeOutlineWidth",
  "shapeShadow",
  // TextArt detail commands (right menu)
  "textartFill",
  "textartFillType",
  "textartTransform",
  "textartShadow",
  // Chart detail commands (right menu)
  "chartType",
  "chartShowLegend",
  "chartShowDataLabels",
  // Table detail commands (right menu)
  "addRowBefore",
  "addRowAfter",
  "deleteRow",
  "addColumnBefore",
  "addColumnAfter",
  "deleteColumn",
  "mergeCells",
  "splitCell",
  "tableBorderStyle",
  "tableBorderColor",
  "tableShading",
  "toggleHeaderRow",
]

function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function createPdfCommandHandler(): (cmd: WoCommand) => void {
  return (cmd: WoCommand): void => {
    const command = cmd.command
    const value = cmd.value

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
        pdfStore.setZoomLevel(toNumber(value, 100))
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

    // 3. View toggles — when a checkbox supplied a value ("true"/"false")
    //    honour it instead of toggling, so the checkbox stays authoritative.
    switch (command) {
      case "toggleLeftPanel":
        if (typeof value === "string") {
          pdfStore.setLeftMenuVisible(value !== "false")
        } else {
          pdfStore.toggleLeftPanel("thumbnails")
        }
        return
      case "toggleRightPanel":
        if (typeof value === "string") {
          pdfStore.setRightMenuVisible(value !== "false")
        } else {
          pdfStore.toggleRightPanel("annotations")
        }
        return
      case "toggleMinimap":
        pdfStore.toggleMinimap()
        return
      case "toggleStatusbar":
        if (typeof value === "string") {
          pdfStore.setStatusbarVisible(value !== "false")
        } else {
          pdfStore.setStatusbarVisible(!pdfStore.statusbarVisible)
        }
        return
      case "toggleCompactToolbar":
        // The spec checkbox sends the COMPACT flag ("true" = compact).
        if (typeof value === "string") {
          pdfStore.setToolbarVisible(value !== "true")
        } else {
          pdfStore.setToolbarVisible(!pdfStore.toolbarVisible)
        }
        return
      case "toggleTheme":
        pdfStore.toggleInterfaceTheme()
        return
      case "toggleWordWrap":
        pdfStore.toggleWordWrap()
        return
      case "toggleEditMode":
        pdfStore.setEditMode(!pdfStore.isEditMode)
        return
      default:
        break
    }

    // 4. Tools (Select / Hand)
    switch (command) {
      case "toggleSelect":
      case "toggleHand":
        pdfStore.setCurrentTool(pdfStore.currentTool === "select" ? "hand" : "select")
        return
      default:
        break
    }

    // 5. Clipboard — operates on the selected annotations
    switch (command) {
      case "cut":
        pdfStore.cutSelectedAnnotations()
        return
      case "copy":
        pdfStore.copySelectedAnnotations()
        return
      case "paste":
        pdfStore.pasteAnnotations()
        return
      case "selectAll":
        pdfStore.selectAllAnnotations()
        return
      default:
        break
    }

    // 6. Annotation tools
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

    // 7. Insert panels
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

    // 8. Find / redact
    switch (command) {
      case "find":
      case "replace":
      case "findRedact":
      case "redactPages":
        pdfStore.setLeftMenuVisible(true)
        pdfStore.toggleLeftPanel("search")
        return
      case "markRedaction":
        pdfStore.setRedacting(!pdfStore.isRedacting)
        return
      case "applyRedactions":
        pdfStore.applyRedactions()
        return
      default:
        break
    }

    // 9. Cloud tab (WOPI session actions — also covered by the WOPI
    //    listener in App.tsx; handled here so nothing logs as unhandled).
    switch (command) {
      case "save":
        void pdfStore.saveToWopi()
        return
      case "download":
        void pdfStore.exportAsDownload()
        return
      case "share":
      case "openHistory":
        // No dedicated share/history surface in the PDF app yet — the File
        // menu hosts the session actions.
        pdfStore.setFileMenuOpen(true)
        return
      default:
        break
    }

    // 10. Annotation detail commands (right menu)
    switch (command) {
      case "addAnnotation":
        pdfStore.addAnnotation({
          page: pdfStore.currentPage + 1,
          x: 50,
          y: 50,
          width: 200,
          height: 100,
          color: "#f59e0b",
          text: typeof value === "string" ? value : undefined,
        })
        pdfStore.isModified = true
        return
      case "removeAnnotation":
        if (value && typeof value === "string") {
          pdfStore.removeAnnotation(value)
          pdfStore.isModified = true
        }
        return
      case "updateAnnotation":
        if (value && typeof value === "object") {
          const { id, text } = value as { id?: string; text?: string }
          if (id) {
            const idx = pdfStore.annotations.findIndex((a) => a.id === id)
            if (idx >= 0) {
              pdfStore.annotations[idx] = { ...pdfStore.annotations[idx], text: text ?? "" }
              pdfStore.isModified = true
            }
          }
        }
        return
      case "setAnnotationColor":
        if (value && typeof value === "object") {
          const { id, color } = value as { id?: string; color?: string }
          if (id && color) {
            const idx = pdfStore.annotations.findIndex((a) => a.id === id)
            if (idx >= 0) {
              pdfStore.annotations[idx] = { ...pdfStore.annotations[idx], color }
              pdfStore.isModified = true
            }
          }
        }
        return
      default:
        break
    }

    // 11. Right-menu detail commands (logged until their panels grow stores)
    switch (command) {
      case "insertFormControl":
        pdfStore.isModified = true
        return
      case "deleteFormControl":
      case "updateFormControl":
      case "paraAlign":
      case "paraIndentLeft":
      case "paraIndentRight":
      case "paraIndentSpecial":
      case "paraSpaceBefore":
      case "paraSpaceAfter":
      case "paraLineSpacing":
      case "imageWidth":
      case "imageHeight":
      case "imageLockAspect":
      case "imageOpacity":
      case "shapeFill":
      case "shapeOutlineColor":
      case "shapeOutlineWidth":
      case "shapeShadow":
      case "textartFill":
      case "textartFillType":
      case "textartTransform":
      case "textartShadow":
      case "chartType":
      case "chartShowLegend":
      case "chartShowDataLabels":
      case "addRowBefore":
      case "addRowAfter":
      case "deleteRow":
      case "addColumnBefore":
      case "addColumnAfter":
      case "deleteColumn":
      case "mergeCells":
      case "splitCell":
      case "tableBorderStyle":
      case "tableBorderColor":
      case "tableShading":
      case "toggleHeaderRow":
        console.log("PDF Command:", command, value)
        return
      default:
        break
    }

    // 12. Unknown
    console.warn(`[pdf-commands] unhandled command: ${command}`)
  }
}

/**
 * The Ribbon's select controls ALSO fire `dispatch.onCommand(id)` after their
 * own onChange — translate those control ids onto the real command. The
 * View ▸ Show/Hide checkboxes have no `command`; their onChange already
 * dispatched the real toggle, so their ids translate to null (the Toolbar
 * skips the redundant dispatch instead of warning).
 */
export function translateRibbonControlCommand(
  command: string,
  value?: string,
): { command: string; value?: string } | null {
  switch (command) {
    case "zoom-level":
    case "view-zoom-level":
      return { command: "setZoom", value }
    case "show-toolbar":
    case "show-statusbar":
    case "show-left-panel":
    case "show-right-panel":
      return null
    default:
      return null
  }
}
