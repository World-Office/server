/**
 * K5 — Spreadsheet command router.
 *
 * Handles ribbon spec commands that the Toolbar's onRichTextCommand path
 * (dispatchUniverCommand) or handlePanelCommand don't cover directly.
 * Registered via registerEditorRouter("sheet", …) so wo-command events from
 * the ribbon land here instead of being dropped.
 *
 * Coverage note: the 50 commands already handled by dispatchUniverCommand /
 * handlePanelCommand keep flowing through those paths (Toolbar dispatches
 * onRichTextCommand + onCommand for every control); this router only needs
 * to map the remaining spec commands to a concrete effect.
 */

import type { WoCommand } from "@world-office/editor-common"
import { dispatchUniverCommand } from "../lib/univer-command"
import { spreadsheetStore } from "../stores/SpreadsheetStore"

/** Spec command name → Univer command name (aliases). */
const UNIVER_ALIASES: Record<string, string> = {
  conditionalFormatting: "conditionalFormat",
  traceDependents: "traceDependents",
  tracePrecedents: "tracePrecedents",
}

/** Panel commands that open a right/left panel via the store. */
const PANEL_COMMANDS: Record<string, string> = {
  insertPicture: "imagesettings",
  insertShape: "shapesettings",
  insertChart: "chartsettings",
  insertTable: "cellsettings",
  insertLink: "cellsettings",
  nameManager: "cellsettings",
  cellStyles: "cellsettings",
  insertIcons: "imagesettings",
  onlinePictures: "imagesettings",
  createFromSelection: "cellsettings",
  formatPainter: "cellsettings",
}

export function createSpreadsheetCommandHandler(): (cmd: WoCommand) => void {
  return (cmd: WoCommand): void => {
    const command = cmd.command
    const value = typeof cmd.value === "string" ? cmd.value : undefined

    // 1. Univer alias (spec name → Univer case name)
    const univerTarget = UNIVER_ALIASES[command]
    if (univerTarget) {
      dispatchUniverCommand(univerTarget as Parameters<typeof dispatchUniverCommand>[0], value)
      return
    }

    // 2. Clipboard — route through Univer if it supports it, else Monaco
    if (command === "cut" || command === "copy" || command === "paste") {
      if (dispatchUniverCommand(command as Parameters<typeof dispatchUniverCommand>[0], value)) {
        return
      }
      document.execCommand(command === "copy" ? "copy" : command === "cut" ? "cut" : "paste")
      return
    }

    // 3. Store toggles
    switch (command) {
      case "calcAutomatic":
        spreadsheetStore.setEditMode(true)
        return
      case "calcManual":
        spreadsheetStore.setEditMode(false)
        return
      case "insertHeader":
      case "insertFooter":
        // Header/footer editing in Univer sheets — open cell settings panel
        spreadsheetStore.toggleRightPanel("cellsettings")
        return
      default:
        break
    }

    // 4. Panel commands
    const panel = PANEL_COMMANDS[command]
    if (panel) {
      spreadsheetStore.toggleRightPanel(panel as Parameters<typeof spreadsheetStore.toggleRightPanel>[0])
      return
    }

    // 5. Table styles (spec has no dedicated Univer op — apply via format)
    if (command === "tableStyleDark" || command === "tableStyleLight" || command === "tableStyleMedium") {
      // Fall back to a simple bold header format on the range
      dispatchUniverCommand("bold", value)
      return
    }

    // 6. Commands already handled by the Toolbar's onRichTextCommand path
    //    (dispatchUniverCommand) — the ribbon fires onCommand in addition to
    //    onRichTextCommand, so these arrive here too. Accept silently.
    const handledByUniverPath = new Set([
      "bold", "italic", "underline", "strikethrough",
      "increaseFontSize", "decreaseFontSize", "fontFamily",
      "textColor", "fillColor", "alignLeft", "alignCenter", "alignRight",
      "mergeCells", "wrapText", "currencyFormat", "percentFormat",
      "decimalFormat", "clearFormatting", "sort", "sortAscending",
      "sortDescending", "filter", "sum", "insertCells", "deleteCells",
      "insertColumnChart", "insertLineChart", "insertPieChart",
      "insertBarChart", "insertAreaChart", "insertScatterChart",
      "insertLineSparkline", "insertColumnSparkline", "insertWinLossSparkline",
      "funcSum", "funcAverage", "funcCount", "funcMin", "funcMax",
      "funcIf", "funcVLookup", "setMargins", "setOrientation", "setPageSize",
      "bringForward", "sendBackward", "bringToFront", "sendToBack",
      "alignObjects", "groupObjects", "ungroupObjects", "find", "replace",
      "pivotTable", "conditionalFormat", "removeConditionalFormat",
      "dataValidation",
    ])
    if (handledByUniverPath.has(command)) {
      return
    }

    // 7. Unknown
    console.warn(`[sheet-commands] unhandled command: ${command}`)
  }
}
