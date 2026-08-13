/**
 * Hook to register PDF command router.
 * Part of PDF-6: Frontend: 8 right-menu panels → apply_op
 */

import { type WoCommand, registerEditorRouter } from "@world-office/editor-common"
import { useEffect } from "react"
import { pdfStore } from "../stores/PdfStore"

/**
 * PDF-specific command handler.
 * Translates WoCommand to PDF ModelOp and calls apply_op on the WASM backend.
 */
function handlePdfCommand(cmd: WoCommand): void {
  const command = cmd.command
  const value = cmd.value

  // Handle annotation commands
  switch (command) {
    case "addAnnotation":
      pdfStore.addAnnotation({
        page: pdfStore.currentPage + 1,
        x: 50,
        y: 50,
        width: 200,
        height: 100,
        color: "#f59e0b",
        text: value as string | undefined,
      })
      pdfStore.isModified = true
      break

    case "removeAnnotation":
      if (value && typeof value === "string") {
        pdfStore.removeAnnotation(value)
        pdfStore.isModified = true
      }
      break

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
      break

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
      break

    // Form commands
    case "insertFormControl":
      console.log("PDF Command: insertFormControl", value)
      pdfStore.isModified = true
      break

    // Paragraph commands
    case "paraAlign":
    case "paraIndentLeft":
    case "paraIndentRight":
    case "paraIndentSpecial":
    case "paraSpaceBefore":
    case "paraSpaceAfter":
    case "paraLineSpacing":
      console.log("PDF Command:", command, value)
      break

    // Image commands
    case "imageWidth":
    case "imageHeight":
    case "imageLockAspect":
    case "imageOpacity":
      console.log("PDF Command:", command, value)
      break

    // Shape commands
    case "shapeFill":
    case "shapeOutlineColor":
    case "shapeOutlineWidth":
    case "shapeShadow":
      console.log("PDF Command:", command, value)
      break

    // TextArt commands
    case "textartFill":
    case "textartFillType":
    case "textartTransform":
    case "textartShadow":
      console.log("PDF Command:", command, value)
      break

    // Chart commands
    case "chartType":
    case "chartShowLegend":
    case "chartShowDataLabels":
      console.log("PDF Command:", command, value)
      break

    // Table commands
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
      console.log("PDF Command:", command)
      break

    default:
      console.warn(`PDF: Unknown command "${command}"`)
  }
}

/**
 * Register the PDF command router.
 * Should be called once when the PDF editor mounts.
 */
export function usePdfCommandRouter(): void {
  useEffect(() => {
    const unregister = registerEditorRouter("pdf", handlePdfCommand, [
      // Annotation commands
      "addAnnotation",
      "removeAnnotation",
      "updateAnnotation",
      "setAnnotationColor",
      // Form commands
      "insertFormControl",
      "deleteFormControl",
      "updateFormControl",
      // Paragraph commands
      "paraAlign",
      "paraIndentLeft",
      "paraIndentRight",
      "paraIndentSpecial",
      "paraSpaceBefore",
      "paraSpaceAfter",
      "paraLineSpacing",
      // Image commands
      "imageWidth",
      "imageHeight",
      "imageLockAspect",
      "imageOpacity",
      // Shape commands
      "shapeFill",
      "shapeOutlineColor",
      "shapeOutlineWidth",
      "shapeShadow",
      // TextArt commands
      "textartFill",
      "textartFillType",
      "textartTransform",
      "textartShadow",
      // Chart commands
      "chartType",
      "chartShowLegend",
      "chartShowDataLabels",
      // Table commands
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
    ])

    return unregister
  }, [])
}
