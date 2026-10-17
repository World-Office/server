// @vitest-environment jsdom
/**
 * Toolbar command coverage — WIRED-SLIDE-PDF-TOOLBAR (slide side).
 *
 * Every command the presentation ribbon spec (`presentationRibbonSpec`) emits
 * must dispatch a REAL store mutation when routed the way the Toolbar routes
 * it:
 *
 *   buttons → Toolbar.onCommand → "wo-command" window event →
 *             editor-common router (registerEditorRouter("slide", …)) →
 *             lib/presentation-commands handler
 *   color-picker / select onChange → "wo-command" window event → same router
 *
 * A "real mutation" is an observable change on the presentationStore (deck
 * content, selection, panels, transition/animation state, clipboard, view
 * state). A command that used to land in the silent fall-through set was a
 * dead toolbar button — this test keeps that from regressing.
 *
 * Out of scope: the Cloud tab (save/share/download/openHistory) — those are
 * WOPI session actions owned by the WOPI listener in App.tsx; the store
 * router still routes them so nothing logs as unhandled.
 */

import {
	presentationRibbonSpec,
	registerEditorRouter,
} from "@world-office/editor-common"
import type {
	RibbonControlSpec,
	RibbonTabSpec,
} from "@world-office/editor-common"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createPresentationCommandHandler } from "../lib/presentation-commands"
import { presentationStore } from "../stores/PresentationStore"
import type { AnimationData, ShapeData, SlideData } from "../types/presentation"

/* ── Spec walking ─────────────────────────────────────────────────────── */

/** Tabs whose commands are handled by the WOPI session layer. */
const OUT_OF_SCOPE_TABS = new Set(["cloud"])

interface SpecCommand {
	command: string
	value?: string
	source: string
}

function presentationTabs(): RibbonTabSpec[] {
	return presentationRibbonSpec.tabs.filter(
		(tab) => !OUT_OF_SCOPE_TABS.has(tab.id),
	)
}

/** Every command a button/split-button control of the spec emits on click. */
function collectSpecCommands(): SpecCommand[] {
	const commands: SpecCommand[] = []
	for (const tab of presentationTabs()) {
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

/** color-picker / select controls: they emit a wo-command from onChange. */
interface OnChangeControl {
	control: RibbonControlSpec
	/** Sample value to feed onChange. */
	sample: string
	source: string
}

function collectOnChangeControls(): OnChangeControl[] {
	const controls: OnChangeControl[] = []
	for (const tab of presentationTabs()) {
		for (const group of tab.groups) {
			for (const control of group.controls) {
				const where = `${tab.id}/${group.id}/${control.id}`
				if (control.type === "color-picker") {
					controls.push({ control, sample: "#FF0000", source: where })
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

/* ── Deck fixture ─────────────────────────────────────────────────────── */

const SEED_SHAPE_IDS = ["sh-1", "sh-2", "sh-3"]

/**
 * Three text shapes with UNEVEN spacing so align/distribute/arrange commands
 * have observable work to do, plus two animations so animation reordering is
 * observable.
 */
function seedShape(
	id: string,
	text: string,
	x: number,
	y: number,
	zIndex: number,
): ShapeData {
	return {
		id,
		type: "textbox",
		x,
		y,
		width: 200,
		height: 60,
		rotation: 0,
		zIndex,
		text,
		fontSize: 18,
		fontColor: "#333333",
		fillColor: "#eeeeee",
	}
}

function seedAnimation(id: string): AnimationData {
	return {
		id,
		effect: "fade",
		category: "entrance",
		target: "all",
		start: "onClick",
		duration: 1,
		delay: 0,
	}
}

function seedDeck(): void {
	const slides: SlideData[] = [
		{
			id: "slide-1",
			title: "Title Slide",
			layout: "blank",
			notes: "",
			shapes: [
				seedShape("sh-1", "Hello", 40, 120, 0),
				seedShape("sh-2", "World", 200, 240, 1),
				seedShape("sh-3", "Third", 680, 340, 2),
			],
			animations: [seedAnimation("anim-1"), seedAnimation("anim-2")],
		},
		{ id: "slide-2", title: "Overview", layout: "blank", notes: "", shapes: [] },
		{ id: "slide-3", title: "Key Points", layout: "blank", notes: "", shapes: [] },
	]
	presentationStore.setSlides(slides)
	presentationStore.setCurrentSlide(0)
	presentationStore.setSlideBackground(0, undefined)
}

/** Store state a ribbon command is allowed to mutate. */
function storeSnapshot(): string {
	return JSON.stringify({
		slides: presentationStore.slides,
		selectedShapeIds: presentationStore.selectedShapeIds,
		currentSlide: presentationStore.currentSlide,
		zoomLevel: presentationStore.zoomLevel,
		fitToPage: presentationStore.fitToPage,
		fitToWidth: presentationStore.fitToWidth,
		activeLeftPanel: presentationStore.activeLeftPanel,
		leftMenuVisible: presentationStore.leftMenuVisible,
		activeRightPanel: presentationStore.activeRightPanel,
		rightMenuVisible: presentationStore.rightMenuVisible,
		transitionEffect: presentationStore.transitionEffect,
		transitionDuration: presentationStore.transitionDuration,
		transitionSoundEnabled: presentationStore.transitionSoundEnabled,
		advanceMode: presentationStore.advanceMode,
		advanceTiming: presentationStore.advanceTiming,
		animationCategory: presentationStore.animationCategory,
		animationStart: presentationStore.animationStart,
		animationDuration: presentationStore.animationDuration,
		animationDelay: presentationStore.animationDelay,
		isPreviewPlaying: presentationStore.isPreviewPlaying,
		isPresenting: presentationStore.isPresenting,
		slideSize: presentationStore.slideSize,
		theme: presentationStore.theme,
		themeType: presentationStore.themeType,
		clipboardShapes: presentationStore.clipboardShapes,
		formatPainterActive: presentationStore.formatPainterActive,
		formatPainterStyle: presentationStore.formatPainterStyle,
		isFileMenuOpen: presentationStore.isFileMenuOpen,
		activeFileMenuPanel: presentationStore.activeFileMenuPanel,
	})
}

function reselectSeedShapes(): void {
	presentationStore.selectAllShapes()
}

/**
 * Put the store into a state where the command HAS an effect (the same way
 * the spreadsheet coverage test normalizes calcAutomatic/calcManual): a fresh
 * deck, a fresh selection, closed panels — then the command-specific
 * preconditions. Runs BEFORE the snapshot, so the mutation provably comes
 * from the dispatch, not the setup.
 */
function normalizeForCommand(command: string): void {
	seedDeck()
	presentationStore.setLeftMenuVisible(false)
	presentationStore.setActiveLeftPanel(null)
	presentationStore.setRightMenuVisible(false)
	presentationStore.setActiveRightPanel(null)
	presentationStore.setFileMenuOpen(false)
	presentationStore.setActiveFileMenuPanel(null)
	presentationStore.setFormatPainter(false, null)
	reselectSeedShapes()

	switch (command) {
		// Navigation needs room to move
		case "goToFirstSlide":
		case "goToPrevSlide":
			presentationStore.setCurrentSlide(1)
			break
		case "goToNextSlide":
		case "goToLastSlide":
			presentationStore.setCurrentSlide(0)
			break
		// Toggle-into-a-value commands start from the other value
		case "setZoomLevel":
			presentationStore.setZoomLevel(100)
			break
		case "fitToPage":
			presentationStore.setFitToPage(false)
			break
		case "fitToWidth":
			presentationStore.setFitToWidth(false)
			break
		case "setSlideSizeStandard":
			presentationStore.setSlideSize("widescreen")
			break
		case "setSlideSizeWidescreen":
			presentationStore.setSlideSize("standard")
			break
		case "setTransitionSoundNone":
			presentationStore.setTransitionSoundEnabled(true)
			break
		case "setTransitionSound":
			presentationStore.setTransitionSoundEnabled(false)
			break
		case "setAdvanceClick":
			presentationStore.setAdvanceMode("after")
			break
		case "setAdvanceTiming":
			presentationStore.setAdvanceTiming(1)
			presentationStore.setAdvanceMode("click")
			break
		case "setDurationVeryFast":
		case "setDurationFast":
		case "setDurationNormal":
		case "setDurationSlow":
		case "setDurationVerySlow":
			presentationStore.setTransitionDuration(99)
			break
		case "setAnimDurationVeryFast":
		case "setAnimDurationFast":
		case "setAnimDurationNormal":
		case "setAnimDurationSlow":
		case "setAnimDurationVerySlow":
			presentationStore.setAnimationDuration(99)
			break
		case "setAnimationDelay":
			presentationStore.setAnimationDelay(5)
			break
		case "setAnimationCategoryNone":
			presentationStore.setAnimationCategory("entrance")
			break
		case "setAnimationEntrance":
		case "setAnimationEmphasis":
		case "setAnimationExit":
		case "setAnimationMotionPath":
			presentationStore.setAnimationCategory("none")
			break
		case "setStartOnClick":
			presentationStore.setAnimationStart("withPrevious")
			break
		case "setStartWithPrevious":
		case "setStartAfterPrevious":
			presentationStore.setAnimationStart("onClick")
			break
		case "stopPreview":
			presentationStore.startPreview()
			break
		case "startPreview":
			presentationStore.stopPreview()
			break
		case "startPresentation":
			presentationStore.endPresentation()
			break
		case "selectAll":
			presentationStore.deselectAllShapes()
			break
		case "outdent":
			for (const id of SEED_SHAPE_IDS) {
				presentationStore.updateShape(0, id, { indentLevel: 2 })
			}
			break
		case "copy":
			presentationStore.clipboardShapes = []
			break
		case "paste":
			// Clipboard needs content for paste to do anything
			if (presentationStore.clipboardShapes.length === 0) {
				presentationStore.copyShape()
			}
			break
		// Background resets need a background to clear
		case "setBackgroundNone":
		case "resetBackground":
			presentationStore.setSlideBackground(0, {
				type: "solid",
				color: "#dddddd",
			})
			break
		case "applyTransitionToAll":
			presentationStore.setSlideTransition(0, "fade")
			presentationStore.setSlideTransition(1, "none")
			break
		default:
			break
	}
}

/** Precondition normalization for onChange controls, keyed by control id. */
function normalizeForControl(controlId: string): void {
	seedDeck()
	presentationStore.setLeftMenuVisible(false)
	presentationStore.setActiveLeftPanel(null)
	reselectSeedShapes()

	switch (controlId) {
		case "zoom-level":
			presentationStore.setZoomLevel(100)
			break
		case "advance-after":
			presentationStore.setAdvanceTiming(1)
			presentationStore.setAdvanceMode("click")
			break
		case "delay-select":
			presentationStore.setAnimationDelay(5)
			break
		default:
			// color pickers start from a clean background
			presentationStore.setSlideBackground(0, undefined)
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

describe("presentation ribbon → store command coverage", () => {
	let unregister: () => void
	let warn: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		seedDeck()
		unregister = registerEditorRouter(
			"slide",
			createPresentationCommandHandler(),
		)
		warn = vi.spyOn(console, "warn").mockImplementation(() => {})
	})

	afterEach(() => {
		warn.mockRestore()
		unregister()
	})

	it("dispatches a real store mutation for every command the ribbon spec emits", () => {
		const commands = collectSpecCommands()
		// Sanity: the walk actually covered the spec (Home alone has 30+).
		expect(commands.length).toBeGreaterThan(80)
		for (const must of [
			"bold",
			"cut",
			"insertTable",
			"setTransitionFade",
			"moveAnimationLater",
		]) {
			expect(commands.map((c) => c.command)).toContain(must)
		}

		const dead: string[] = []
		for (const { command, value, source } of commands) {
			if (command === "") continue // decorative controls (bg-angle)
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

	it("dispatches the color-picker / select onChange commands through the wo-command router", () => {
		const controls = collectOnChangeControls()
		// textColor + highlight pickers, 3 background pickers, 3 selects.
		expect(controls.length).toBeGreaterThanOrEqual(8)

		const dead: string[] = []
		for (const { control, sample, source } of controls) {
			normalizeForControl(control.id)
			const before = storeSnapshot()
			;(control as { onChange: (value: string) => void }).onChange(sample)
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
})

describe("presentation ribbon → store mutation smoke tests", () => {
	let unregister: () => void

	beforeEach(() => {
		seedDeck()
		unregister = registerEditorRouter(
			"slide",
			createPresentationCommandHandler(),
		)
	})

	afterEach(() => {
		unregister()
	})

	it("addSlide inserts after the current slide and lands on it", () => {
		presentationStore.setCurrentSlide(1)
		dispatchWoCommand("addSlide")
		expect(presentationStore.slides).toHaveLength(4)
		expect(presentationStore.currentSlide).toBe(2)
	})

	it("cut removes the selected shapes and copy/paste round-trips them", () => {
		reselectSeedShapes()
		dispatchWoCommand("copy")
		expect(presentationStore.clipboardShapes).toHaveLength(3)
		dispatchWoCommand("cut")
		expect(presentationStore.slides[0].shapes).toHaveLength(0)
		dispatchWoCommand("paste")
		expect(presentationStore.slides[0].shapes).toHaveLength(3)
	})

	it("bold bolds the text of the selected shapes", () => {
		presentationStore.selectShape("sh-1")
		dispatchWoCommand("bold")
		expect(presentationStore.slides[0].shapes[0].bold).toBe(true)
	})

	it("textColor recolors the selected shapes' text", () => {
		presentationStore.selectShape("sh-1")
		dispatchWoCommand("textColor", "#FF0000")
		expect(presentationStore.slides[0].shapes[0].fontColor).toBe("#FF0000")
	})

	it("alignCenter centers the text inside the selected shapes", () => {
		presentationStore.selectShape("sh-1")
		dispatchWoCommand("alignCenter")
		expect(presentationStore.slides[0].shapes[0].textAlign).toBe("center")
	})

	it("distributeHorizontally spreads the three selected shapes", () => {
		reselectSeedShapes()
		const before = presentationStore.slides[0].shapes.map((s) => s.x)
		dispatchWoCommand("distributeHorizontally")
		const after = presentationStore.slides[0].shapes.map((s) => s.x)
		expect(after).not.toEqual(before)
	})

	it("insertTable adds a real table shape with header row", () => {
		dispatchWoCommand("insertTable")
		const shape = presentationStore.slides[0].shapes.at(-1)
		expect(shape?.table).toMatchObject({
			rows: 3,
			columns: 3,
			headerRow: true,
		})
	})

	it("insertPicture adds an image shape", () => {
		dispatchWoCommand("insertPicture")
		const shape = presentationStore.slides[0].shapes.at(-1)
		expect(shape?.type).toBe("image")
		expect(shape?.imageData?.src).toContain("svg")
	})

	it("setTransitionFade writes the effect onto the slide", () => {
		dispatchWoCommand("setTransitionFade")
		expect(presentationStore.slides[0].transitionEffect).toBe("fade")
	})

	it("applyTransitionToAll copies the transition to every slide", () => {
		presentationStore.setSlideTransition(0, "wipe")
		dispatchWoCommand("applyTransitionToAll")
		for (const slide of presentationStore.slides) {
			expect(slide.transitionEffect).toBe("wipe")
		}
	})

	it("moveAnimationLater reorders the slide's animations", () => {
		const before = presentationStore.slides[0].animations?.map((a) => a.id)
		dispatchWoCommand("moveAnimationLater")
		expect(presentationStore.slides[0].animations?.map((a) => a.id)).not.toEqual(
			before,
		)
	})

	it("find opens the left-menu Search panel", () => {
		dispatchWoCommand("find")
		expect(presentationStore.activeLeftPanel).toBe("search")
		expect(presentationStore.leftMenuVisible).toBe(true)
	})

	it("openAnimationPane opens the right-menu Animation panel", () => {
		dispatchWoCommand("openAnimationPane")
		expect(presentationStore.activeRightPanel).toBe("animation")
		expect(presentationStore.rightMenuVisible).toBe(true)
	})

	it("setZoomLevel applies the select's value", () => {
		dispatchWoCommand("setZoomLevel", "150")
		expect(presentationStore.zoomLevel).toBe(150)
	})

	it("bgColor paints a solid slide background from the picker value", () => {
		dispatchWoCommand("bgColor", "#123456")
		expect(presentationStore.slides[0].background).toMatchObject({
			type: "solid",
			color: "#123456",
		})
	})
})
