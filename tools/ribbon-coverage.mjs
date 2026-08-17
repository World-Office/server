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
    blockquote: { target: "lib", implemented: false }, codeBlock: { target: "lib", implemented: false },
    setTextDirection: { target: "lib", implemented: false },
    // home — styles
    heading1: { target: "wasm", implemented: true }, heading2: { target: "wasm", implemented: true },
    heading3: { target: "wasm", implemented: true },
    // home — editing
    find: { target: "panel", implemented: true }, replace: { target: "panel", implemented: true },
    // insert
    horizontalRule: { target: "wasm", implemented: true }, image: { target: "panel", implemented: true },
    link: { target: "panel", implemented: true }, insertTable: { target: "wasm", implemented: true },
    pageBreak: { target: "wasm", implemented: true },
    // layout
    columns: { target: "panel", implemented: false },
    differentFirstPage: { target: "store", implemented: true }, differentOddEven: { target: "store", implemented: true },
    editFooter: { target: "store", implemented: true }, editHeader: { target: "store", implemented: true },
    insertContinuousSectionBreak: { target: "wasm", implemented: true },
    insertPageNumber: { target: "store", implemented: false },
    insertSectionBreak: { target: "wasm", implemented: true }, openTheme: { target: "panel", implemented: true },
    pageMargins: { target: "panel", implemented: false }, pageOrientation: { target: "panel", implemented: false },
    pageSize: { target: "panel", implemented: false },
    removeFooter: { target: "store", implemented: true }, removeHeader: { target: "store", implemented: true },
    // references
    addComment: { target: "panel", implemented: true }, insertEndnote: { target: "lib", implemented: false },
    insertFootnote: { target: "lib", implemented: false }, insertIndex: { target: "lib", implemented: false },
    insertIndexEntry: { target: "lib", implemented: false }, insertToc: { target: "lib", implemented: false },
    toggleComment: { target: "panel", implemented: true }, updateIndex: { target: "lib", implemented: false },
    updateToc: { target: "lib", implemented: false },
    // review
    acceptAllChanges: { target: "lib", implemented: false }, acceptChange: { target: "lib", implemented: false },
    nextChange: { target: "lib", implemented: false }, rejectAllChanges: { target: "lib", implemented: false },
    rejectChange: { target: "lib", implemented: false }, toggleTrackChanges: { target: "lib", implemented: false },
    // view
    toggleGridlines: { target: "store", implemented: true }, toggleNavigation: { target: "store", implemented: true },
    toggleRuler: { target: "store", implemented: true }, toggleSpellCheck: { target: "store", implemented: true },
    zoomIn: { target: "store", implemented: true }, zoomOut: { target: "store", implemented: true },
    // forms
    insertCheckboxControl: { target: "panel", implemented: false }, insertDatePickerControl: { target: "panel", implemented: false },
    insertDropdownControl: { target: "panel", implemented: false }, insertPlainTextControl: { target: "panel", implemented: false },
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
    cut: { target: "router", implemented: false }, copy: { target: "router", implemented: false },
    paste: { target: "router", implemented: false }, selectAll: { target: "router", implemented: false },
    find: { target: "panel", implemented: false }, replace: { target: "panel", implemented: false },
    findRedact: { target: "panel", implemented: false },
    annotationHighlight: { target: "router", implemented: false }, annotationUnderline: { target: "router", implemented: false },
    annotationStrikeout: { target: "router", implemented: false }, annotationTextComment: { target: "router", implemented: false },
    annotationShapeComment: { target: "router", implemented: false }, annotationStamp: { target: "router", implemented: false },
    redactPages: { target: "panel", implemented: false }, markRedaction: { target: "panel", implemented: false },
    applyRedactions: { target: "panel", implemented: false },
    goToFirstPage: { target: "store", implemented: false }, goToNextPage: { target: "store", implemented: false },
    goToPrevPage: { target: "store", implemented: false }, goToLastPage: { target: "store", implemented: false },
    setZoom: { target: "store", implemented: false }, toggleFitToPage: { target: "store", implemented: false },
    toggleFitToWidth: { target: "store", implemented: false }, toggleHand: { target: "store", implemented: false },
    toggleSelect: { target: "store", implemented: false }, toggleLeftPanel: { target: "store", implemented: false },
    toggleRightPanel: { target: "store", implemented: false }, toggleMinimap: { target: "store", implemented: false },
    toggleStatusbar: { target: "store", implemented: false }, toggleCompactToolbar: { target: "store", implemented: false },
    toggleTheme: { target: "store", implemented: false }, toggleWordWrap: { target: "store", implemented: false },
    toggleEditMode: { target: "store", implemented: false },
    insertImage: { target: "panel", implemented: false }, insertText: { target: "panel", implemented: false },
    insertShape: { target: "panel", implemented: false }, insertTable: { target: "panel", implemented: false },
    insertChart: { target: "panel", implemented: false }, insertHyperlink: { target: "panel", implemented: false },
    insertEquation: { target: "panel", implemented: false }, insertSymbol: { target: "panel", implemented: false },
    insertSmartArt: { target: "panel", implemented: false }, insertTextArt: { target: "panel", implemented: false },
    addFormField: { target: "panel", implemented: false },
  },
  visio: {
    exportSvg: { target: "store", implemented: false }, fitToPageVisio: { target: "store", implemented: false },
    fitToWidthVisio: { target: "store", implemented: false }, toggleEditorMode: { target: "store", implemented: false },
    toggleMinimap: { target: "store", implemented: false }, toggleThemeVisio: { target: "store", implemented: false },
    toggleWordWrap: { target: "store", implemented: false },
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