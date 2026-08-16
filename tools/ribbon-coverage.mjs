#!/usr/bin/env node
/**
 * K1 — Ribbon command coverage audit.
 *
 * Reads every ribbon spec in packages/editor-common/src/ribbon/specs/, extracts
 * the commands each control fires, and checks each against a per-app
 * SPEC→ROUTER mapping table below. The mapping is the single source of truth
 * for what a ribbon command is supposed to trigger (store action, panel,
 * WASM op, lib function, or router command name).
 *
 * Exit code:
 *   0  = coverage >= threshold (default 90 % of unique commands wired)
 *   1  = coverage below threshold → CI gate
 *
 * Usage:
 *   node tools/ribbon-coverage.mjs [--json] [--threshold 0.9] [--list-missing]
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SPECS_DIR = path.resolve(__dirname, "../packages/editor-common/src/ribbon/specs")
const args = process.argv.slice(2)
const jsonOut = args.includes("--json")
const listMissing = args.includes("--list-missing")
const thresholdArg = args.find((a) => a.startsWith("--threshold="))
const threshold = thresholdArg ? Number.parseFloat(thresholdArg.split("=")[1]) : 0.9

const SPEC_FILES = {
  word: "word-ribbon.ts",
  sheet: "spreadsheet-ribbon.ts",
  slide: "presentation-ribbon.ts",
  pdf: "pdf-ribbon.ts",
  visio: "visio-ribbon.ts",
}

/**
 * Spec command → wiring target per app.
 * target is a short tag describing where the command lands:
 *   store  → direct store action (documentStore/pdfStore/…)
 *   panel  → opens an existing panel/dialog
 *   wasm   → WASM applyFormatting / model op
 *   lib    → existing lib function (track-changes, footnotes, univer, …)
 *   router → forwarded via registerEditorRouter (kind-specific handler)
 *   state  → toolbar/store toggle
 * The actual implementation (K3–K8) must make each tag real; this table is
 * the contract the implementation is verified against.
 */
const WIRING = {
  word: {
    // home — clipboard & undo
    cut: "router", copy: "router", paste: "router", undo: "router", redo: "router",
    // home — font (WASM applyFormatting + extended keys)
    bold: "wasm", italic: "wasm", underline: "wasm", strike: "wasm",
    subscript: "wasm", superscript: "wasm",
    fontFamily: "wasm", fontSize: "wasm", textColor: "wasm", highlight: "wasm",
    clearFormatting: { target: "wasm", implemented: true },
    // home — paragraph
    bulletList: "lib", orderedList: "lib", taskList: "lib",
    alignLeft: "wasm", alignCenter: "wasm", alignRight: "wasm", alignJustify: "wasm",
    indent: "lib", outdent: "lib", lineSpacing: "lib",
    blockquote: "lib", codeBlock: "lib", setTextDirection: "lib",
    // home — styles
    heading1: "wasm", heading2: "wasm", heading3: "wasm",
    // home — editing
    find: "panel", replace: "panel",
    // insert
    horizontalRule: "lib", image: "panel", link: "panel", insertTable: "panel",
    pageBreak: { target: "wasm", implemented: false },
    // layout
    columns: "panel", differentFirstPage: "store", differentOddEven: "store",
    editFooter: "store", editHeader: "store",
    insertContinuousSectionBreak: "lib", insertPageNumber: "store",
    insertSectionBreak: "lib", openTheme: "panel", pageBreak: "wasm",
    pageMargins: "panel", pageOrientation: "panel", pageSize: "panel",
    removeFooter: "store", removeHeader: "store",
    // references
    addComment: "panel", insertEndnote: "lib", insertFootnote: "lib",
    insertIndex: "lib", insertIndexEntry: "lib", insertToc: "lib",
    toggleComment: "panel", updateIndex: "lib", updateToc: "lib",
    // review
    acceptAllChanges: "lib", acceptChange: "lib", nextChange: "lib",
    rejectAllChanges: "lib", rejectChange: "lib", toggleTrackChanges: "lib",
    // view
    toggleGridlines: "store", toggleNavigation: "store", toggleRuler: "store",
    toggleSpellCheck: "store", zoomIn: "store", zoomOut: "store",
    // forms
    insertCheckboxControl: "panel", insertDatePickerControl: "panel",
    insertDropdownControl: "panel", insertPlainTextControl: "panel",
  },  sheet: {
    cut: "router", copy: "router", paste: "router",
    bold: "wasm", italic: "wasm", underline: "wasm", strikethrough: "wasm",
    textColor: "wasm", fillColor: "wasm", increaseFontSize: "wasm",
    decreaseFontSize: "wasm", formatPainter: "router",
    alignLeft: "wasm", alignCenter: "wasm", alignRight: "wasm",
    alignObjects: "wasm", wrapText: "wasm",
    mergeCells: "wasm", formatCells: "wasm", cellStyles: "panel",
    currencyFormat: "wasm", percentFormat: "wasm", decimalFormat: "wasm",
    funcAverage: "wasm", funcCount: "wasm", funcIf: "wasm", funcMax: "wasm",
    funcMin: "wasm", funcSum: "wasm", funcVLookup: "wasm",
    sum: { target: "wasm", implemented: false },
    insertAreaChart: "panel", insertBarChart: "panel", insertColumnChart: "panel",
    insertLineChart: "panel", insertPieChart: "panel", insertScatterChart: "panel",
    insertColumnSparkline: "panel", insertLineSparkline: "panel",
    insertWinLossSparkline: { target: "panel", implemented: false },
    insertCells: "wasm", deleteCells: "wasm",
    insertFooter: "store", insertHeader: "store",
    insertIcons: "panel", insertLink: "panel", insertPicture: "panel",
    insertShape: "panel", insertTable: "panel",
    onlinePictures: { target: "panel", implemented: false },
    nameManager: "panel", pivotTable: "panel",
    conditionalFormatting: "panel", filter: "wasm", sort: "wasm",
    setMargins: "panel", setOrientation: "panel", setPageSize: "panel",
    tableStyleDark: "wasm", tableStyleLight: "wasm", tableStyleMedium: "wasm",
    traceDependents: "wasm", tracePrecedents: "wasm",
    bringForward: "router", bringToFront: "router", sendBackward: "router",
    sendToBack: "router", groupObjects: "router", ungroupObjects: "router",
    createFromSelection: { target: "panel", implemented: false },
    find: "panel", replace: "panel", calcAutomatic: "store", calcManual: "store",
  },  slide: {
    cut: "router", copy: "router", paste: "router",
    addSlide: "store", goToFirstSlide: "store", goToLastSlide: "store",
    goToNextSlide: "store", goToPrevSlide: "store",
    bold: "wasm", italic: "wasm", underline: "wasm", strike: "wasm",
    textColor: "wasm", highlight: "wasm", bgColor: "wasm",
    bgColorStart: "wasm", bgColorEnd: "wasm",
    increaseFontSize: "wasm", decreaseFontSize: "wasm", formatPainter: "router",
    alignLeft: "wasm", alignCenter: "wasm", alignRight: "wasm",
    alignTop: "wasm", alignMiddle: "wasm", alignBottom: "wasm",
    bulletList: "lib", orderedList: "lib", indent: "lib", outdent: "lib",
    lineSpacing: "lib", textDirection: "lib",
    insertTextBox: "store", insertShape: "store", insertTable: "store",
    insertChart: "panel", insertPicture: "panel", insertOnlinePicture: "panel",
    insertPhotoAlbum: "panel", insertIcon: "panel", insert3dModel: "panel",
    insertAudio: "panel", insertVideo: "panel",
    insertLink: "panel", insertSymbol: "panel", insertEquation: "panel",
    insertWordArt: "panel", insertDateTime: "panel",
    insertConnectorStraight: "store", insertConnectorCurved: "store",
    insertConnectorBent: "store", insertHeaderFooter: "store",
    insertSlideNumber: { target: "store", implemented: false },
    arrange: "store", distributeHorizontally: "store",
    distributeVertically: { target: "store", implemented: false },
    setStartOnClick: "store", setStartWithPrevious: "store",
    setStartAfterPrevious: { target: "store", implemented: false },
    setAdvanceClick: "store", setAdvanceTiming: "store",
    setAnimDurationFast: "store", setAnimDurationNormal: "store",
    setAnimDurationSlow: "store", setAnimDurationVerySlow: "store",
    setAnimationCategoryNone: "store", setAnimationDelay: "store",
    setAnimationEmphasis: "store", setAnimationEntrance: "store",
    setAnimationExit: "store", setAnimationMotionPath: "store",
    moveAnimationEarlier: "store", moveAnimationLater: "store",
    openAnimationPane: "panel", applyTransitionToAll: "store",
    setDurationFast: "store", setDurationNormal: "store",
    setDurationSlow: "store", setDurationVeryFast: "store",
    setDurationVerySlow: { target: "store", implemented: false },
    setTransitionChecker: "store", setTransitionCircle: "store",
    setTransitionCover: "store", setTransitionFade: "store",
    setTransitionMorph: "store", setTransitionNone: "store",
    setTransitionPush: "store", setTransitionReveal: "store",
    setTransitionSound: "store", setTransitionSoundNone: "store",
    setTransitionSplit: "store", setTransitionUncover: "store",
    setTransitionWipe: "store", setTransitionZoom: "store",
    setSlideSizeStandard: "store", setSlideSizeWidescreen: "store",
    setBackgroundNone: "store", setBackgroundSolid: "store",
    setBackgroundGradient: "store", resetBackground: "store",
    setThemeStandard: "store", setThemeDark: "store",
    setThemeModern: "store", setThemeGradient: "store",
    quickStyles: "panel", fitToPage: "store", fitToWidth: "store",
    setZoomLevel: "store", selectAll: "router", find: "panel", replace: "panel",
    startPresentation: "store", startPreview: "store", stopPreview: "store",
  },  pdf: {
    cut: "router", copy: "router", paste: "router", selectAll: "router",
    find: "panel", replace: "panel", findRedact: "panel",
    annotationHighlight: "router", annotationUnderline: "router",
    annotationStrikeout: "router", annotationTextComment: "router",
    annotationShapeComment: "router", annotationStamp: "router",
    redactPages: "panel", markRedaction: "panel", applyRedactions: "panel",
    goToFirstPage: "store", goToNextPage: "store", goToPrevPage: "store",
    goToLastPage: { target: "store", implemented: false },
    setZoom: "store", toggleFitToPage: "store", toggleFitToWidth: "store",
    toggleHand: "store", toggleSelect: "store",
    toggleLeftPanel: "store", toggleRightPanel: "store", toggleMinimap: "store",
    toggleStatusbar: "store", toggleCompactToolbar: "store",
    toggleTheme: "store", toggleWordWrap: "store", toggleEditMode: "store",
    insertImage: "panel", insertText: "panel", insertShape: "panel",
    insertTable: "panel", insertChart: "panel", insertHyperlink: "panel",
    insertEquation: "panel", insertSymbol: "panel", insertSmartArt: "panel",
    insertTextArt: "panel", addFormField: "panel",
  },  visio: {
    exportSvg: "store", fitToPageVisio: "store", fitToWidthVisio: "store",
    toggleEditorMode: "store", toggleMinimap: "store",
    toggleThemeVisio: "store", toggleWordWrap: "store",
  },
}

function extractCommands(specSource) {
  const commands = new Set()
  const re = /command:\s*"([^"]+)"/g
  let m
  while ((m = re.exec(specSource)) !== null) commands.add(m[1])
  return commands
}

function extractControlCount(specSource) {
  const re = /type:\s*"(button|select|dropdown|checkbox|split-button|color-picker)"/g
  return (specSource.match(re) || []).length
}

const results = []
let totalCommands = 0
let totalWired = 0

for (const [app, filename] of Object.entries(SPEC_FILES)) {
  const specPath = path.join(SPECS_DIR, filename)
  if (!fs.existsSync(specPath)) {
    console.error(`MISSING spec: ${specPath}`)
    process.exit(1)
  }
  const src = fs.readFileSync(specPath, "utf8")
  const specCommands = extractCommands(src)
  const controls = extractControlCount(src)
  const wiring = WIRING[app] || {}

  const wired = [...specCommands].filter((c) => wiring[c]?.implemented)
  const planned = [...specCommands].filter((c) => wiring[c] && !wiring[c].implemented)
  const missing = [...specCommands].filter((c) => !wiring[c])
  const coverage = specCommands.size > 0 ? wired.length / specCommands.size : 1

  totalCommands += specCommands.size
  totalWired += wired.length

  results.push({ app, commands: specCommands.size, wired: wired.length, planned: planned.length, controls, coverage, missing })
}

const overall = totalCommands > 0 ? totalWired / totalCommands : 1

if (jsonOut) {
  console.log(JSON.stringify({ apps: results, overall }, null, 2))
} else {
  for (const r of results) {
    console.log(
      `${r.app.padEnd(6)} ${String(r.commands).padStart(3)} cmds  ${String(r.wired).padStart(3)} done  ${String(r.planned).padStart(3)} planned  ${r.controls} ctrl  ${(r.coverage * 100).toFixed(0)} %`,
    )
    if (listMissing && r.missing.length > 0) {
      console.log(`       missing: ${r.missing.join(", ")}`)
    }
  }
  console.log(`\nTOTAL: ${totalWired}/${totalCommands} commands implemented (${(overall * 100).toFixed(1)} %)  threshold: ${(threshold * 100).toFixed(0)} %`)
}

process.exit(overall >= threshold ? 0 : 1)