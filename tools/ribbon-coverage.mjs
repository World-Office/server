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
    cut: { target: "router", implemented: true }, copy: { target: "router", implemented: true },
    paste: { target: "router", implemented: true }, undo: { target: "router", implemented: true },
    redo: { target: "router", implemented: true },
    // home — font
    bold: { target: "wasm", implemented: true }, italic: { target: "wasm", implemented: true },
    underline: { target: "wasm", implemented: true }, strike: { target: "wasm", implemented: true },
    subscript: { target: "wasm", implemented: true }, superscript: { target: "wasm", implemented: true },
    fontFamily: { target: "wasm", implemented: true }, fontSize: { target: "wasm", implemented: true },
    textColor: { target: "wasm", implemented: true }, highlight: { target: "wasm", implemented: true },
    clearFormatting: { target: "wasm", implemented: true },
    // home — paragraph
    bulletList: { target: "wasm", implemented: true }, orderedList: { target: "wasm", implemented: true },
    taskList: { target: "wasm", implemented: true },
    alignLeft: { target: "wasm", implemented: true }, alignCenter: { target: "wasm", implemented: true },
    alignRight: { target: "wasm", implemented: true }, alignJustify: { target: "wasm", implemented: true },
    indent: { target: "wasm", implemented: true }, outdent: { target: "wasm", implemented: true },
    lineSpacing: { target: "wasm", implemented: true },
    blockquote: { target: "wasm", implemented: true }, codeBlock: { target: "wasm", implemented: true },
    setTextDirection: { target: "wasm", implemented: true },
    // home — styles
    heading1: { target: "wasm", implemented: true }, heading2: { target: "wasm", implemented: true },
    heading3: { target: "wasm", implemented: true }, heading4: { target: "wasm", implemented: true },
    heading5: { target: "wasm", implemented: true }, heading6: { target: "wasm", implemented: true },
    // home — editing
    find: { target: "panel", implemented: true }, replace: { target: "panel", implemented: true },
    // insert
    horizontalRule: { target: "wasm", implemented: true }, image: { target: "panel", implemented: true },
    link: { target: "panel", implemented: true }, insertTable: { target: "wasm", implemented: true },
    pageBreak: { target: "wasm", implemented: true },
    // layout
    columns: { target: "panel", implemented: true },
    differentFirstPage: { target: "store", implemented: true }, differentOddEven: { target: "store", implemented: true },
    editFooter: { target: "store", implemented: true }, editHeader: { target: "store", implemented: true },
    insertContinuousSectionBreak: { target: "wasm", implemented: true },
    insertPageNumber: { target: "store", implemented: true },
    insertSectionBreak: { target: "wasm", implemented: true }, openTheme: { target: "panel", implemented: true },
    pageMargins: { target: "panel", implemented: true }, pageOrientation: { target: "panel", implemented: true },
    pageSize: { target: "panel", implemented: true },
    removeFooter: { target: "store", implemented: true }, removeHeader: { target: "store", implemented: true },
    // references
    addComment: { target: "panel", implemented: true }, insertEndnote: { target: "wasm", implemented: false },
    insertFootnote: { target: "wasm", implemented: false }, insertIndex: { target: "wasm", implemented: false },
    insertIndexEntry: { target: "wasm", implemented: false }, insertToc: { target: "wasm", implemented: false },
    toggleComment: { target: "panel", implemented: true }, updateIndex: { target: "wasm", implemented: false },
    updateToc: { target: "wasm", implemented: false },
    // review
    acceptAllChanges: { target: "wasm", implemented: false }, acceptChange: { target: "wasm", implemented: false },
    nextChange: { target: "wasm", implemented: false }, rejectAllChanges: { target: "wasm", implemented: false },
    rejectChange: { target: "wasm", implemented: false }, toggleTrackChanges: { target: "wasm", implemented: false },
    // view
    toggleGridlines: { target: "store", implemented: true }, toggleNavigation: { target: "store", implemented: true },
    toggleRuler: { target: "store", implemented: true }, toggleSpellCheck: { target: "store", implemented: true },
    zoomIn: { target: "store", implemented: true }, zoomOut: { target: "store", implemented: true },
    // forms
    insertCheckboxControl: { target: "wasm", implemented: false }, insertDatePickerControl: { target: "wasm", implemented: false },
    insertDropdownControl: { target: "wasm", implemented: false }, insertPlainTextControl: { target: "wasm", implemented: false },
  },
  sheet: {
    cut: { target: "router", implemented: true }, copy: { target: "router", implemented: true },
    paste: { target: "router", implemented: true },
    bold: { target: "wasm", implemented: true }, italic: { target: "wasm", implemented: true },
    underline: { target: "wasm", implemented: true }, strikethrough: { target: "wasm", implemented: true },
    textColor: { target: "wasm", implemented: true }, fillColor: { target: "wasm", implemented: true },
    increaseFontSize: { target: "wasm", implemented: true }, decreaseFontSize: { target: "wasm", implemented: true },
    formatPainter: { target: "router", implemented: true },
    alignLeft: { target: "wasm", implemented: true }, alignCenter: { target: "wasm", implemented: true },
    alignRight: { target: "wasm", implemented: true }, alignObjects: { target: "wasm", implemented: true },
    wrapText: { target: "wasm", implemented: true },
    mergeCells: { target: "wasm", implemented: true }, formatCells: { target: "wasm", implemented: false },
    cellStyles: { target: "panel", implemented: true },
    currencyFormat: { target: "wasm", implemented: true }, percentFormat: { target: "wasm", implemented: true },
    decimalFormat: { target: "wasm", implemented: true },
    funcAverage: { target: "wasm", implemented: true }, funcCount: { target: "wasm", implemented: true },
    funcIf: { target: "wasm", implemented: true }, funcMax: { target: "wasm", implemented: true },
    funcMin: { target: "wasm", implemented: true }, funcSum: { target: "wasm", implemented: true },
    funcVLookup: { target: "wasm", implemented: true }, sum: { target: "wasm", implemented: true },
    insertAreaChart: { target: "panel", implemented: true }, insertBarChart: { target: "panel", implemented: true },
    insertColumnChart: { target: "panel", implemented: true }, insertLineChart: { target: "panel", implemented: true },
    insertPieChart: { target: "panel", implemented: true }, insertScatterChart: { target: "panel", implemented: true },
    insertColumnSparkline: { target: "panel", implemented: true }, insertLineSparkline: { target: "panel", implemented: true },
    insertWinLossSparkline: { target: "panel", implemented: true },
    insertCells: { target: "wasm", implemented: true }, deleteCells: { target: "wasm", implemented: true },
    insertFooter: { target: "store", implemented: true }, insertHeader: { target: "store", implemented: true },
    insertIcons: { target: "panel", implemented: true }, insertLink: { target: "panel", implemented: true },
    insertPicture: { target: "panel", implemented: true }, insertShape: { target: "panel", implemented: true },
    insertTable: { target: "panel", implemented: true }, onlinePictures: { target: "panel", implemented: true },
    nameManager: { target: "panel", implemented: true }, pivotTable: { target: "panel", implemented: true },
    conditionalFormatting: { target: "panel", implemented: true }, filter: { target: "wasm", implemented: true },
    sort: { target: "wasm", implemented: true },
    setMargins: { target: "panel", implemented: true }, setOrientation: { target: "panel", implemented: true },
    setPageSize: { target: "panel", implemented: true },
    tableStyleDark: { target: "wasm", implemented: true }, tableStyleLight: { target: "wasm", implemented: true },
    tableStyleMedium: { target: "wasm", implemented: true },
    traceDependents: { target: "wasm", implemented: true }, tracePrecedents: { target: "wasm", implemented: true },
    bringForward: { target: "router", implemented: true }, bringToFront: { target: "router", implemented: true },
    sendBackward: { target: "router", implemented: true }, sendToBack: { target: "router", implemented: true },
    groupObjects: { target: "router", implemented: true }, ungroupObjects: { target: "router", implemented: true },
    createFromSelection: { target: "panel", implemented: true },
    find: { target: "panel", implemented: true }, replace: { target: "panel", implemented: true },
    calcAutomatic: { target: "store", implemented: true }, calcManual: { target: "store", implemented: true },
  },
  slide: {
    cut: { target: "router", implemented: true }, copy: { target: "router", implemented: true },
    paste: { target: "router", implemented: true }, addSlide: { target: "store", implemented: true },
    goToFirstSlide: { target: "store", implemented: true }, goToLastSlide: { target: "store", implemented: true },
    goToNextSlide: { target: "store", implemented: true }, goToPrevSlide: { target: "store", implemented: true },
    bold: { target: "wasm", implemented: true }, italic: { target: "wasm", implemented: true },
    underline: { target: "wasm", implemented: true }, strike: { target: "wasm", implemented: true },
    textColor: { target: "wasm", implemented: true }, highlight: { target: "wasm", implemented: true },
    bgColor: { target: "wasm", implemented: true }, bgColorStart: { target: "wasm", implemented: true },
    bgColorEnd: { target: "wasm", implemented: true },
    increaseFontSize: { target: "wasm", implemented: true }, decreaseFontSize: { target: "wasm", implemented: true },
    formatPainter: { target: "router", implemented: true },
    alignLeft: { target: "wasm", implemented: true }, alignCenter: { target: "wasm", implemented: true },
    alignRight: { target: "wasm", implemented: true }, alignTop: { target: "wasm", implemented: true },
    alignMiddle: { target: "wasm", implemented: true }, alignBottom: { target: "wasm", implemented: true },
    bulletList: { target: "lib", implemented: true }, orderedList: { target: "lib", implemented: true },
    indent: { target: "lib", implemented: true }, outdent: { target: "lib", implemented: true },
    lineSpacing: { target: "lib", implemented: true }, textDirection: { target: "lib", implemented: true },
    insertTextBox: { target: "store", implemented: true }, insertShape: { target: "store", implemented: true },
    insertTable: { target: "store", implemented: true }, insertChart: { target: "panel", implemented: true },
    insertPicture: { target: "panel", implemented: true }, insertOnlinePicture: { target: "panel", implemented: true },
    insertPhotoAlbum: { target: "panel", implemented: true }, insertIcon: { target: "panel", implemented: true },
    insert3dModel: { target: "panel", implemented: true }, insertAudio: { target: "panel", implemented: true },
    insertVideo: { target: "panel", implemented: true }, insertLink: { target: "panel", implemented: true },
    insertSymbol: { target: "panel", implemented: true }, insertEquation: { target: "panel", implemented: true },
    insertWordArt: { target: "panel", implemented: true }, insertDateTime: { target: "panel", implemented: true },
    insertConnectorStraight: { target: "store", implemented: true }, insertConnectorCurved: { target: "store", implemented: true },
    insertConnectorBent: { target: "store", implemented: true }, insertHeaderFooter: { target: "store", implemented: true },
    insertSlideNumber: { target: "store", implemented: true },
    arrange: { target: "store", implemented: true }, distributeHorizontally: { target: "store", implemented: true },
    distributeVertically: { target: "store", implemented: true },
    setStartOnClick: { target: "store", implemented: true }, setStartWithPrevious: { target: "store", implemented: true },
    setStartAfterPrevious: { target: "store", implemented: true }, setAdvanceClick: { target: "store", implemented: true },
    setAdvanceTiming: { target: "store", implemented: true },
    setAnimDurationFast: { target: "store", implemented: true }, setAnimDurationNormal: { target: "store", implemented: true },
    setAnimDurationSlow: { target: "store", implemented: true }, setAnimDurationVerySlow: { target: "store", implemented: true },
    setAnimationCategoryNone: { target: "store", implemented: true }, setAnimationDelay: { target: "store", implemented: true },
    setAnimationEmphasis: { target: "store", implemented: true }, setAnimationEntrance: { target: "store", implemented: true },
    setAnimationExit: { target: "store", implemented: true }, setAnimationMotionPath: { target: "store", implemented: true },
    moveAnimationEarlier: { target: "store", implemented: true }, moveAnimationLater: { target: "store", implemented: true },
    openAnimationPane: { target: "panel", implemented: true }, applyTransitionToAll: { target: "store", implemented: true },
    setDurationFast: { target: "store", implemented: true }, setDurationNormal: { target: "store", implemented: true },
    setDurationSlow: { target: "store", implemented: true }, setDurationVeryFast: { target: "store", implemented: true },
    setDurationVerySlow: { target: "store", implemented: true },
    setTransitionChecker: { target: "store", implemented: true }, setTransitionCircle: { target: "store", implemented: true },
    setTransitionCover: { target: "store", implemented: true }, setTransitionFade: { target: "store", implemented: true },
    setTransitionMorph: { target: "store", implemented: true }, setTransitionNone: { target: "store", implemented: true },
    setTransitionPush: { target: "store", implemented: true }, setTransitionReveal: { target: "store", implemented: true },
    setTransitionSound: { target: "store", implemented: true }, setTransitionSoundNone: { target: "store", implemented: true },
    setTransitionSplit: { target: "store", implemented: true }, setTransitionUncover: { target: "store", implemented: true },
    setTransitionWipe: { target: "store", implemented: true }, setTransitionZoom: { target: "store", implemented: true },
    setSlideSizeStandard: { target: "store", implemented: true }, setSlideSizeWidescreen: { target: "store", implemented: true },
    setBackgroundNone: { target: "store", implemented: true }, setBackgroundSolid: { target: "store", implemented: true },
    setBackgroundGradient: { target: "store", implemented: true }, resetBackground: { target: "store", implemented: true },
    setThemeStandard: { target: "store", implemented: true }, setThemeDark: { target: "store", implemented: true },
    setThemeModern: { target: "store", implemented: true }, setThemeGradient: { target: "store", implemented: true },
    quickStyles: { target: "panel", implemented: true }, fitToPage: { target: "store", implemented: true },
    fitToWidth: { target: "store", implemented: true }, setZoomLevel: { target: "store", implemented: true },
    selectAll: { target: "router", implemented: true }, find: { target: "panel", implemented: true },
    replace: { target: "panel", implemented: true }, startPresentation: { target: "store", implemented: true },
    startPreview: { target: "store", implemented: true }, stopPreview: { target: "store", implemented: true },
  },
  pdf: {
    cut: { target: "router", implemented: true }, copy: { target: "router", implemented: true },
    paste: { target: "router", implemented: true }, selectAll: { target: "router", implemented: true },
    find: { target: "panel", implemented: true }, replace: { target: "panel", implemented: true },
    findRedact: { target: "panel", implemented: true },
    annotationHighlight: { target: "router", implemented: true }, annotationUnderline: { target: "router", implemented: true },
    annotationStrikeout: { target: "router", implemented: true }, annotationTextComment: { target: "router", implemented: true },
    annotationShapeComment: { target: "router", implemented: true }, annotationStamp: { target: "router", implemented: true },
    redactPages: { target: "panel", implemented: true }, markRedaction: { target: "panel", implemented: true },
    applyRedactions: { target: "panel", implemented: true },
    goToFirstPage: { target: "store", implemented: true }, goToNextPage: { target: "store", implemented: true },
    goToPrevPage: { target: "store", implemented: true }, goToLastPage: { target: "store", implemented: true },
    setZoom: { target: "store", implemented: true }, toggleFitToPage: { target: "store", implemented: true },
    toggleFitToWidth: { target: "store", implemented: true }, toggleHand: { target: "store", implemented: true },
    toggleSelect: { target: "store", implemented: true }, toggleLeftPanel: { target: "store", implemented: true },
    toggleRightPanel: { target: "store", implemented: true }, toggleMinimap: { target: "store", implemented: true },
    toggleStatusbar: { target: "store", implemented: true }, toggleCompactToolbar: { target: "store", implemented: true },
    toggleTheme: { target: "store", implemented: true }, toggleWordWrap: { target: "store", implemented: true },
    toggleEditMode: { target: "store", implemented: true },
    insertImage: { target: "panel", implemented: true }, insertText: { target: "panel", implemented: true },
    insertShape: { target: "panel", implemented: true }, insertTable: { target: "panel", implemented: true },
    insertChart: { target: "panel", implemented: true }, insertHyperlink: { target: "panel", implemented: true },
    insertEquation: { target: "panel", implemented: true }, insertSymbol: { target: "panel", implemented: true },
    insertSmartArt: { target: "panel", implemented: true }, insertTextArt: { target: "panel", implemented: true },
    addFormField: { target: "panel", implemented: true },
  },
  visio: {
    exportSvg: { target: "store", implemented: true }, fitToPageVisio: { target: "store", implemented: true },
    fitToWidthVisio: { target: "store", implemented: true }, toggleEditorMode: { target: "store", implemented: true },
    toggleMinimap: { target: "store", implemented: true }, toggleThemeVisio: { target: "store", implemented: true },
    toggleWordWrap: { target: "store", implemented: true },
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