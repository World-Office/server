// @vitest-environment jsdom
/**
 * Toolbar command coverage — WIRED-SLIDE-PDF-TOOLBAR (pdf side).
 *
 * Every command the PDF ribbon spec (`pdfRibbonSpec`) emits must dispatch a
 * REAL store mutation when routed the way the Toolbar routes it:
 *
 *   buttons   → Toolbar.onCommand → "wo-command" window event →
 *               editor-common router (registerEditorRouter("pdf", …)) →
 *               lib/pdf-commands handler
 *   checkbox / select onChange → "wo-command" window event → same router
 *
 * A "real mutation" is an observable change on the pdfStore (page, zoom, fit,
 * edit mode, tool, annotation tool/selection/clipboard, panels, view toggles,
 * redaction state). Commands that used to return silently (cut/copy/paste,
 * toggleTheme, toggleWordWrap) were dead toolbar buttons — this test keeps
 * that from regressing.
 *
 * Out of scope: the Cloud tab (save/share/download/openHistory) — WOPI
 * session actions owned by the WOPI listener in App.tsx; the store router
 * still routes them so nothing logs as unhandled.
 */

import {
	pdfRibbonSpec,
	registerEditorRouter,
} from "@world-office/editor-common"
import type {
	RibbonControlSpec,
	RibbonTabSpec,
} from "@world-office/editor-common"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	createPdfCommandHandler,
	PDF_COMMANDS,
	translateRibbonControlCommand,
} from "../lib/pdf-commands"
import { pdfStore } from "../stores/PdfStore"

/* ── Spec walking ─────────────────────────────────────────────────────── */

/** Tabs whose commands are handled by the WOPI session layer. */
const OUT_OF_SCOPE_TABS = new Set(["cloud"])

function pdfTabs(): RibbonTabSpec[] {
	return pdfRibbonSpec.tabs.filter((tab) => !OUT_OF_SCOPE_TABS.has(tab.id))
}

interface SpecCommand {
	command: string
	value?: string
	source: string
}

/** Every command a button/split-button control of the spec emits on click. */
function collectSpecCommands(): SpecCommand[] {
	const commands: SpecCommand[] = []
	for (const tab of pdfTabs()) {
		for (const group of tab.groups) {
			for (const control of group.controls) {
				const where = `${tab.id}/${group.id}/${control.id}`
				if (
					(control.type === "button" || control.type === "split-button") &&
					control.command
				) {
					commands.push({
						command: control.command,
						value: control.value,
						source: where,
					})
				} else if (control.type === "dropdown") {
					for (const item of control.items) {
						if (item.command) {
							commands.push({
								command: item.command,
								source: `${where}/${item.id}`,
							})
						}
					}
				} else if (control.type === "checkbox" && control.command) {
					commands.push({ command: control.command, source: where })
				}
			}
		}
	}
	return commands
}

/** checkbox / select controls: they emit a wo-command from onChange. */
interface OnChangeControl {
	control: RibbonControlSpec
	/** Sample value to feed onChange (checkboxes get their unchecked state). */
	sample: string
	source: string
}

function collectOnChangeControls(): OnChangeControl[] {
	const controls: OnChangeControl[] = []
	for (const tab of pdfTabs()) {
		for (const group of tab.groups) {
			for (const control of group.controls) {
				const where = `${tab.id}/${group.id}/${control.id}`
				if (control.type === "checkbox") {
					controls.push({ control, sample: "false", source: where })
				} else if (control.type === "select") {
					controls.push({
						control,
						sample: control.options[0]?.value ?? "100",
						source: where,
					})
				}
			}
		}
	}
	return controls
}

/* ── Document fixture ─────────────────────────────────────────────────── */

/** Fresh page-2 annotations (both selected) AND a fresh view/UI state. */
function seedDocument(): void {
	pdfStore.setPageCount(3)
	pdfStore.setCurrentPage(1)
	pdfStore.setAnnotations([])
	pdfStore.addAnnotation({
		page: 2,
		x: 40,
		y: 40,
		width: 120,
		height: 40,
		color: "#f59e0b",
		text: "first",
	})
	pdfStore.addAnnotation({
		page: 2,
		x: 40,
		y: 120,
		width: 120,
		height: 40,
		color: "#f59e0b",
		text: "second",
	})
	pdfStore.selectAllAnnotations()
	pdfStore.isModified = false
	// View/UI state — the coverage walk may leave any of it flipped.
	pdfStore.setEditMode(false)
	pdfStore.setCurrentTool("select")
	pdfStore.setAnnotationTool(null)
	pdfStore.setZoomLevel(100)
	pdfStore.setFitToPage(false)
	pdfStore.setFitToWidth(false)
	pdfStore.setLeftMenuVisible(false)
	pdfStore.setActiveLeftPanel(null)
	pdfStore.setRightMenuVisible(false)
	pdfStore.setActiveRightPanel(null)
	pdfStore.setToolbarVisible(true)
	pdfStore.setStatusbarVisible(true)
	pdfStore.interfaceTheme = "light"
	pdfStore.wordWrapEnabled = true
	pdfStore.minimapEnabled = false
	pdfStore.isRedacting = false
	pdfStore.redactionApplied = false
	pdfStore.annotationClipboard = []
	pdfStore.setFileMenuOpen(false)
}

/** Store state a ribbon command is allowed to mutate. */
function storeSnapshot(): string {
	return JSON.stringify({
		currentPage: pdfStore.currentPage,
		zoomLevel: pdfStore.zoomLevel,
		fitToPage: pdfStore.fitToPage,
		fitToWidth: pdfStore.fitToWidth,
		isEditMode: pdfStore.isEditMode,
		currentTool: pdfStore.currentTool,
		activeAnnotationTool: pdfStore.activeAnnotationTool,
		annotations: pdfStore.annotations,
		selectedAnnotationIds: pdfStore.selectedAnnotationIds,
		annotationClipboard: pdfStore.annotationClipboard,
		activeLeftPanel: pdfStore.activeLeftPanel,
		leftMenuVisible: pdfStore.leftMenuVisible,
		activeRightPanel: pdfStore.activeRightPanel,
		rightMenuVisible: pdfStore.rightMenuVisible,
		toolbarVisible: pdfStore.toolbarVisible,
		statusbarVisible: pdfStore.statusbarVisible,
		interfaceTheme: pdfStore.interfaceTheme,
		wordWrapEnabled: pdfStore.wordWrapEnabled,
		minimapEnabled: pdfStore.minimapEnabled,
		isRedacting: pdfStore.isRedacting,
		redactionApplied: pdfStore.redactionApplied,
		isFileMenuOpen: pdfStore.isFileMenuOpen,
		isModified: pdfStore.isModified,
	})
}

/**
 * Put the store into a state where the command HAS an effect (same approach
 * as the spreadsheet coverage test): a fresh document, a fresh selection,
 * closed panels — then command-specific preconditions. Runs BEFORE the
 * snapshot, so the mutation provably comes from the dispatch.
 */
function normalizeForCommand(command: string): void {
	seedDocument()
	pdfStore.setLeftMenuVisible(false)
	pdfStore.setActiveLeftPanel(null)
	pdfStore.setRightMenuVisible(false)
	pdfStore.setActiveRightPanel(null)
	pdfStore.setFileMenuOpen(false)

	switch (command) {
		case "goToFirstPage":
		case "goToPrevPage":
			pdfStore.setCurrentPage(1)
			break
		case "goToNextPage":
		case "goToLastPage":
			pdfStore.setCurrentPage(1)
			break
		case "setZoom":
			pdfStore.setZoomLevel(100)
			break
		case "toggleFitToPage":
			pdfStore.setFitToPage(false)
			break
		case "toggleFitToWidth":
			pdfStore.setFitToWidth(false)
			break
		case "toggleEditMode":
			pdfStore.setEditMode(false)
			break
		case "toggleSelect":
		case "toggleHand":
			pdfStore.setCurrentTool("select")
			break
		case "toggleStatusbar":
			pdfStore.setStatusbarVisible(true)
			break
		case "toggleCompactToolbar":
			pdfStore.setToolbarVisible(true)
			break
		case "toggleTheme":
			pdfStore.interfaceTheme = "light"
			break
		case "annotationTextComment":
		case "annotationStamp":
		case "annotationShapeComment":
		case "annotationHighlight":
		case "annotationStrikeout":
		case "annotationUnderline":
			pdfStore.setAnnotationTool(null)
			break
		case "copy":
			pdfStore.annotationClipboard = []
			break
		case "selectAll":
			pdfStore.selectAnnotation(null)
			break
		case "paste":
			if (pdfStore.annotationClipboard.length === 0) {
				pdfStore.copySelectedAnnotations()
				pdfStore.isModified = false
			}
			break
		default:
			break
	}
}

/** Precondition normalization for onChange controls, keyed by control id. */
function normalizeForControl(controlId: string): void {
	normalizeForCommand("")
	switch (controlId) {
		case "zoom-level":
		case "view-zoom-level":
			pdfStore.setZoomLevel(100)
			break
		case "show-toolbar":
			pdfStore.setToolbarVisible(true)
			break
		case "show-statusbar":
			pdfStore.setStatusbarVisible(true)
			break
		case "show-left-panel":
			pdfStore.setLeftMenuVisible(true)
			break
		case "show-right-panel":
			pdfStore.setRightMenuVisible(true)
			break
		default:
			break
	}
}

function dispatchWoCommand(command: string, value?: string): void {
	window.dispatchEvent(
		new CustomEvent(
			"wo-command",
			value === undefined
				? { detail: { command } }
				: { detail: { command, value } },
		),
	)
}

/* ── Tests ────────────────────────────────────────────────────────────── */

describe("pdf ribbon → store command coverage", () => {
	let unregister: () => void
	let warn: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		seedDocument()
		unregister = registerEditorRouter(
			"pdf",
			createPdfCommandHandler(),
			[...PDF_COMMANDS],
		)
		warn = vi.spyOn(console, "warn").mockImplementation(() => {})
	})

	afterEach(() => {
		warn.mockRestore()
		unregister()
	})

	it("dispatches a real store mutation for every command the ribbon spec emits", () => {
		const commands = collectSpecCommands()
		// Sanity: the walk actually covered the spec.
		expect(commands.length).toBeGreaterThan(30)
		for (const must of [
			"goToNextPage",
			"toggleEditMode",
			"annotationHighlight",
			"insertTable",
			"cut",
			"toggleTheme",
		]) {
			expect(commands.map((c) => c.command)).toContain(must)
		}

		const dead: string[] = []
		for (const { command, value, source } of commands) {
			if (command === "") continue
			normalizeForCommand(command)
			const before = storeSnapshot()
			dispatchWoCommand(command, value)
			if (storeSnapshot() === before) dead.push(`${source} → "${command}"`)
		}

		expect(dead, "commands that dispatch no store mutation").toEqual([])
		expect(
			warn.mock.calls.filter((args) =>
				String(args[0]).includes("unhandled command"),
			),
			"no command may fall through the router unhandled",
		).toEqual([])
	})

	it("dispatches the checkbox / select onChange commands through the wo-command router", () => {
		const controls = collectOnChangeControls()
		// 4 View ▸ Show/Hide checkboxes + 2 zoom selects.
		expect(controls.length).toBeGreaterThanOrEqual(6)

		const dead: string[] = []
		for (const { control, sample, source } of controls) {
			normalizeForControl(control.id)
			const before = storeSnapshot()
			if (control.type === "checkbox") {
				// Unchecking is the direction that changes state from the
				// default UI (everything visible except the right panel).
				;(control as { onChange: (checked: boolean) => void }).onChange(false)
			} else {
				;(control as { onChange: (value: string) => void }).onChange(sample)
			}
			if (storeSnapshot() === before) dead.push(source)
		}

		expect(dead, "onChange controls that dispatch no store mutation").toEqual([])
		expect(
			warn.mock.calls.filter((args) =>
				String(args[0]).includes("unhandled command"),
			),
			"no onChange command may fall through the router unhandled",
		).toEqual([])
	})

	it("translates the redundant select/checkbox control-id dispatches onto real commands", () => {
		expect(translateRibbonControlCommand("zoom-level", "150")).toEqual({
			command: "setZoom",
			value: "150",
		})
		expect(translateRibbonControlCommand("view-zoom-level", "75")).toEqual({
			command: "setZoom",
			value: "75",
		})
		// The Show/Hide checkboxes carry no command — their onChange already
		// dispatched the real toggle, so the Toolbar skips the id dispatch.
		for (const id of ["show-toolbar", "show-statusbar", "show-left-panel", "show-right-panel"]) {
			expect(translateRibbonControlCommand(id)).toBeNull()
		}
	})
})

describe("pdf ribbon → store mutation smoke tests", () => {
	let unregister: () => void

	beforeEach(() => {
		seedDocument()
		unregister = registerEditorRouter(
			"pdf",
			createPdfCommandHandler(),
			[...PDF_COMMANDS],
		)
	})

	afterEach(() => {
		unregister()
	})

	it("goToNextPage / goToLastPage move through the document", () => {
		dispatchWoCommand("goToNextPage")
		expect(pdfStore.currentPage).toBe(2)
		dispatchWoCommand("goToLastPage")
		expect(pdfStore.currentPage).toBe(2)
		dispatchWoCommand("goToFirstPage")
		expect(pdfStore.currentPage).toBe(0)
	})

	it("setZoom applies the select's value and clears fit modes", () => {
		pdfStore.setFitToWidth(true)
		dispatchWoCommand("setZoom", "150")
		expect(pdfStore.zoomLevel).toBe(150)
		expect(pdfStore.fitToWidth).toBe(false)
	})

	it("toggleEditMode flips edit mode and toggleHand switches the tool", () => {
		dispatchWoCommand("toggleEditMode")
		expect(pdfStore.isEditMode).toBe(true)
		dispatchWoCommand("toggleHand")
		expect(pdfStore.currentTool).toBe("hand")
	})

	it("copy/cut/paste round-trip the selected annotations", () => {
		dispatchWoCommand("copy")
		expect(pdfStore.annotationClipboard).toHaveLength(2)
		dispatchWoCommand("paste")
		expect(pdfStore.annotations).toHaveLength(4)
		dispatchWoCommand("cut")
		// The pasted copies survive; the selected originals are gone.
		expect(pdfStore.annotations).toHaveLength(2)
		expect(pdfStore.annotations.every((a) => a.id !== pdfStore.annotationClipboard[0].id)).toBe(
			true,
		)
		expect(pdfStore.selectedAnnotationIds).toEqual([])
	})

	it("selectAll selects every annotation on the current page", () => {
		pdfStore.selectAnnotation(null)
		dispatchWoCommand("selectAll")
		expect(pdfStore.selectedAnnotationIds).toHaveLength(2)
	})

	it("annotationHighlight arms the highlight tool", () => {
		dispatchWoCommand("annotationHighlight")
		expect(pdfStore.activeAnnotationTool).toBe("highlight")
	})

	it("markRedaction arms redaction and applyRedactions commits it", () => {
		dispatchWoCommand("markRedaction")
		expect(pdfStore.isRedacting).toBe(true)
		dispatchWoCommand("applyRedactions")
		expect(pdfStore.redactionApplied).toBe(true)
		expect(pdfStore.isRedacting).toBe(false)
		expect(pdfStore.isModified).toBe(true)
	})

	it("toggleTheme flips the interface theme (and the DOM attribute)", () => {
		dispatchWoCommand("toggleTheme")
		expect(pdfStore.interfaceTheme).toBe("dark")
		expect(document.documentElement.getAttribute("data-wo-theme")).toBe("dark")
	})

	it("toggleWordWrap / toggleMinimap flip the code-editor options", () => {
		dispatchWoCommand("toggleWordWrap")
		expect(pdfStore.wordWrapEnabled).toBe(false)
		dispatchWoCommand("toggleMinimap")
		expect(pdfStore.minimapEnabled).toBe(true)
	})

	it("find opens the left-menu Search panel", () => {
		dispatchWoCommand("find")
		expect(pdfStore.activeLeftPanel).toBe("search")
		expect(pdfStore.leftMenuVisible).toBe(true)
	})

	it("insertTable opens the right-menu Table panel", () => {
		dispatchWoCommand("insertTable")
		expect(pdfStore.activeRightPanel).toBe("table")
	})
})
