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
    lineSpacing: { target: "wasm", implemented: false },
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
    cut: { target: "router", implemented: false }, copy: { target: "router", implemented: false },
    paste: { target: "router", implemented: false },
    bold: { target: "wasm", implemented: false }, italic: { target: "wasm", implemented: false },
    underline: { target: "wasm", implemented: false }, strikethrough: { target: "wasm", implemented: false },
    textColor: { target: "wasm", implemented: false }, fillColor: { target: "wasm", implemented: false },
    increaseFontSize: { target: "wasm", implemented: false }, decreaseFontSize: { target: "wasm", implemented: false },
    formatPainter: { target: "router", implemented: false },
    alignLeft: { target: "wasm", implemented: false }, alignCenter: { target: "wasm", implemented: false },
    alignRight: { target: "wasm", implemented: false }, alignObjects: { target: "wasm", implemented: false },
    wrapText: { target: "wasm", implemented: false },
    mergeCells: { target: "wasm", implemented: false }, formatCells: { target: "wasm", implemented: false },
    cellStyles: { target: "panel", implemented: false },
    currencyFormat: { target: "wasm", implemented: false }, percentFormat: { target: "wasm", implemented: false },
    decimalFormat: { target: "wasm", implemented: false },
    funcAverage: { target: "wasm", implemented: false }, funcCount: { target: "wasm", implemented: false },
    funcIf: { target: "wasm", implemented: false }, funcMax: { target: "wasm", implemented: false },
    funcMin: { target: "wasm", implemented: false }, funcSum: { target: "wasm", implemented: false },
    funcVLookup: { target: "wasm", implemented: false }, sum: { target: "wasm", implemented: false },
    insertAreaChart: { target: "panel", implemented: false }, insertBarChart: { target: "panel", implemented: false },
    insertColumnChart: { target: "panel", implemented: false }, insertLineChart: { target: "panel", implemented: false },
    insertPieChart: { target: "panel", implemented: false }, insertScatterChart: { target: "panel", implemented: false },
    insertColumnSparkline: { target: "panel", implemented: false }, insertLineSparkline: { target: "panel", implemented: false },
    insertWinLossSparkline: { target: "panel", implemented: false },
    insertCells: { target: "wasm", implemented: false }, deleteCells: { target: "wasm", implemented: false },
    insertFooter: { target: "store", implemented: false }, insertHeader: { target: "store", implemented: false },
    insertIcons: { target: "panel", implemented: false }, insertLink: { target: "panel", implemented: false },
    insertPicture: { target: "panel", implemented: false }, insertShape: { target: "panel", implemented: false },
    insertTable: { target: "panel", implemented: false }, onlinePictures: { target: "panel", implemented: false },
    nameManager: { target: "panel", implemented: false }, pivotTable: { target: "panel", implemented: false },
    conditionalFormatting: { target: "panel", implemented: false }, filter: { target: "wasm", implemented: false },
    sort: { target: "wasm", implemented: false },
    setMargins: { target: "panel", implemented: false }, setOrientation: { target: "panel", implemented: false },
    setPageSize: { target: "panel", implemented: false },
    tableStyleDark: { target: "wasm", implemented: false }, tableStyleLight: { target: "wasm", implemented: false },
    tableStyleMedium: { target: "wasm", implemented: false },
    traceDependents: { target: "wasm", implemented: false }, tracePrecedents: { target: "wasm", implemented: false },
    bringForward: { target: "router", implemented: false }, bringToFront: { target: "router", implemented: false },
    sendBackward: { target: "router", implemented: false }, sendToBack: { target: "router", implemented: false },
    groupObjects: { target: "router", implemented: false }, ungroupObjects: { target: "router", implemented: false },
    createFromSelection: { target: "panel", implemented: false },
    find: { target: "panel", implemented: false }, replace: { target: "panel", implemented: false },
    calcAutomatic: { target: "store", implemented: false }, calcManual: { target: "store", implemented: false },
  },
  slide: {
    cut: { target: "router", implemented: false }, copy: { target: "router", implemented: false },
    paste: { target: "router", implemented: false }, addSlide: { target: "store", implemented: false },
    goToFirstSlide: { target: "store", implemented: false }, goToLastSlide: { target: "store", implemented: false },
    goToNextSlide: { target: "store", implemented: false }, goToPrevSlide: { target: "store", implemented: false },
    bold: { target: "wasm", implemented: false }, italic: { target: "wasm", implemented: false },
    underline: { target: "wasm", implemented: false }, strike: { target: "wasm", implemented: false },
    textColor: { target: "wasm", implemented: false }, highlight: { target: "wasm", implemented: false },
    bgColor: { target: "wasm", implemented: false }, bgColorStart: { target: "wasm", implemented: false },
    bgColorEnd: { target: "wasm", implemented: false },
    increaseFontSize: { target: "wasm", implemented: false }, decreaseFontSize: { target: "wasm", implemented: false },
    formatPainter: { target: "router", implemented: false },
    alignLeft: { target: "wasm", implemented: false }, alignCenter: { target: "wasm", implemented: false },
    alignRight: { target: "wasm", implemented: false }, alignTop: { target: "wasm", implemented: false },
    alignMiddle: { target: "wasm", implemented: false }, alignBottom: { target: "wasm", implemented: false },
    bulletList: { target: "lib", implemented: false }, orderedList: { target: "lib", implemented: false },
    indent: { target: "lib", implemented: false }, outdent: { target: "lib", implemented: false },
    lineSpacing: { target: "lib", implemented: false }, textDirection: { target: "lib", implemented: false },
    insertTextBox: { target: "store", implemented: false }, insertShape: { target: "store", implemented: false },
    insertTable: { target: "store", implemented: false }, insertChart: { target: "panel", implemented: false },
    insertPicture: { target: "panel", implemented: false }, insertOnlinePicture: { target: "panel", implemented: false },
    insertPhotoAlbum: { target: "panel", implemented: false }, insertIcon: { target: "panel", implemented: false },
    insert3dModel: { target: "panel", implemented: false }, insertAudio: { target: "panel", implemented: false },
    insertVideo: { target: "panel", implemented: false }, insertLink: { target: "panel", implemented: false },
    insertSymbol: { target: "panel", implemented: false }, insertEquation: { target: "panel", implemented: false },
    insertWordArt: { target: "panel", implemented: false }, insertDateTime: { target: "panel", implemented: false },
    insertConnectorStraight: { target: "store", implemented: false }, insertConnectorCurved: { target: "store", implemented: false },
    insertConnectorBent: { target: "store", implemented: false }, insertHeaderFooter: { target: "store", implemented: false },
    insertSlideNumber: { target: "store", implemented: false },
    arrange: { target: "store", implemented: false }, distributeHorizontally: { target: "store", implemented: false },
    distributeVertically: { target: "store", implemented: false },
    setStartOnClick: { target: "store", implemented: false }, setStartWithPrevious: { target: "store", implemented: false },
    setStartAfterPrevious: { target: "store", implemented: false }, setAdvanceClick: { target: "store", implemented: false },
    setAdvanceTiming: { target: "store", implemented: false },
    setAnimDurationFast: { target: "store", implemented: false }, setAnimDurationNormal: { target: "store", implemented: false },
    setAnimDurationSlow: { target: "store", implemented: false }, setAnimDurationVerySlow: { target: "store", implemented: false },
    setAnimationCategoryNone: { target: "store", implemented: false }, setAnimationDelay: { target: "store", implemented: false },
    setAnimationEmphasis: { target: "store", implemented: false }, setAnimationEntrance: { target: "store", implemented: false },
    setAnimationExit: { target: "store", implemented: false }, setAnimationMotionPath: { target: "store", implemented: false },
    moveAnimationEarlier: { target: "store", implemented: false }, moveAnimationLater: { target: "store", implemented: false },
    openAnimationPane: { target: "panel", implemented: false }, applyTransitionToAll: { target: "store", implemented: false },
    setDurationFast: { target: "store", implemented: false }, setDurationNormal: { target: "store", implemented: false },
    setDurationSlow: { target: "store", implemented: false }, setDurationVeryFast: { target: "store", implemented: false },
    setDurationVerySlow: { target: "store", implemented: false },
    setTransitionChecker: { target: "store", implemented: false }, setTransitionCircle: { target: "store", implemented: false },
    setTransitionCover: { target: "store", implemented: false }, setTransitionFade: { target: "store", implemented: false },
    setTransitionMorph: { target: "store", implemented: false }, setTransitionNone: { target: "store", implemented: false },
    setTransitionPush: { target: "store", implemented: false }, setTransitionReveal: { target: "store", implemented: false },
    setTransitionSound: { target: "store", implemented: false }, setTransitionSoundNone: { target: "store", implemented: false },
    setTransitionSplit: { target: "store", implemented: false }, setTransitionUncover: { target: "store", implemented: false },
    setTransitionWipe: { target: "store", implemented: false }, setTransitionZoom: { target: "store", implemented: false },
    setSlideSizeStandard: { target: "store", implemented: false }, setSlideSizeWidescreen: { target: "store", implemented: false },
    setBackgroundNone: { target: "store", implemented: false }, setBackgroundSolid: { target: "store", implemented: false },
    setBackgroundGradient: { target: "store", implemented: false }, resetBackground: { target: "store", implemented: false },
    setThemeStandard: { target: "store", implemented: false }, setThemeDark: { target: "store", implemented: false },
    setThemeModern: { target: "store", implemented: false }, setThemeGradient: { target: "store", implemented: false },
    quickStyles: { target: "panel", implemented: false }, fitToPage: { target: "store", implemented: false },
    fitToWidth: { target: "store", implemented: false }, setZoomLevel: { target: "store", implemented: false },
    selectAll: { target: "router", implemented: false }, find: { target: "panel", implemented: false },
    replace: { target: "panel", implemented: false }, startPresentation: { target: "store", implemented: false },
    startPreview: { target: "store", implemented: false }, stopPreview: { target: "store", implemented: false },
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