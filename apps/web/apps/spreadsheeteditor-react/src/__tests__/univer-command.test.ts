// @vitest-environment jsdom
/**
 * Toolbar command coverage — WIRED-SHEET-TOOLBAR3.
 *
 * Every command the spreadsheet ribbon spec (`spreadsheetRibbonSpec`) emits
 * must dispatch a REAL mutation when routed the way the Toolbar routes it:
 *
 *   buttons   → Toolbar.onRichTextCommand → dispatchUniverCommand()
 *             + Toolbar.onCommand → "wo-command" window event →
 *               editor-common router (registerEditorRouter("sheet", …)) →
 *               lib/spreadsheet-commands handler
 *   color-picker / select onChange → "wo-command" window event → same router
 *
 * A "real mutation" is any observable effect on the recording Univer facade
 * (range setter, worksheet op, workbook op, executeCommand) or on the
 * spreadsheetStore (panel toggle, edit mode). A command that falls through
 * every path used to end in the "[sheet-commands] unhandled command" warn —
 * a dead toolbar button. This test keeps that from regressing.
 *
 * Out of scope: the Cloud tab (save/share/download/openHistory) — those are
 * WOPI session actions handled by the WOPI layer (`useWoCommandListener` in
 * App.tsx), not by the spreadsheet grid bridge.
 */

import {
	registerEditorRouter,
	spreadsheetRibbonSpec,
} from "@world-office/editor-common";
import type {
	RibbonControlSpec,
	RibbonTabSpec,
} from "@world-office/editor-common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpreadsheetCommandHandler } from "../lib/spreadsheet-commands";
import {
	type UniverCommand,
	dispatchUniverCommand,
	setActiveUniverAPI,
} from "../lib/univer-command";
import { spreadsheetStore } from "../stores/SpreadsheetStore";

/* ── Recording Univer facade ────────────────────────────────────────────
 * Implements exactly the surface lib/univer-command.ts touches. Every
 * mutating method appends a tag to `mutations`, so a test can tell whether
 * a dispatch actually reached the engine. Getters return a mid-sheet
 * selection (B5) so range-derived commands (sum, sparklines) have data to
 * work with. */

interface RecordingFacade {
	mutations: string[];
	count: () => number;
}

function installRecordingFacade(): RecordingFacade {
	const mutations: string[] = [];
	const rec =
		(label: string) =>
		(...args: unknown[]): unknown => {
			mutations.push(
				`${label}(${args.map((a) => JSON.stringify(a) ?? String(a)).join(", ")})`,
			);
			return true;
		};

	const range = {
		setFontWeight: rec("setFontWeight"),
		setFontStyle: rec("setFontStyle"),
		setFontLine: rec("setFontLine"),
		setFontColor: rec("setFontColor"),
		setBackgroundColor: rec("setBackgroundColor"),
		setHorizontalAlignment: rec("setHorizontalAlignment"),
		setFontSize: rec("setFontSize"),
		setFontName: rec("setFontName"),
		setNumberFormat: rec("setNumberFormat"),
		merge: rec("merge"),
		setWrap: rec("setWrap"),
		clear: rec("clear"),
		setValue: rec("setValue"),
		setFormula: rec("setFormula"),
		/* Real Univer ranges have no getCellRef() — the bridge derives refs
		 * from row/column, so the fake must not provide it either. */
		getRow: () => 4,
		getColumn: () => 1,
	};

	const worksheet = {
		getSelection: () => ({ getActiveRange: () => range }),
		getSheetId: () => "sheet-1",
		getSheetName: () => "Sheet1",
		sort: rec("worksheet.sort"),
		filter: rec("worksheet.filter"),
		insertCells: rec("worksheet.insertCells"),
		deleteCells: rec("worksheet.deleteCells"),
		find: rec("worksheet.find"),
	};

	const workbook = {
		getActiveSheet: () => worksheet,
		save: () => ({}),
		getSheets: () => [] as { id: string; name: string }[],
		addSheet: rec("workbook.addSheet"),
	};

	const api = {
		getActiveWorkbook: () => workbook,
		addEvent: () => ({ dispose: () => {} }),
		executeCommand: rec("executeCommand"),
	};

	setActiveUniverAPI(api as never);
	return { mutations, count: () => mutations.length };
}

afterEach(() => {
	setActiveUniverAPI(null);
});

/* ── Spec walking ─────────────────────────────────────────────────────── */

interface SpecCommand {
	command: string;
	value?: string;
	source: string;
}

/** Tabs whose commands are handled outside the grid bridge. */
const OUT_OF_SCOPE_TABS = new Set(["cloud"]);

function spreadsheetTabs(): RibbonTabSpec[] {
	return spreadsheetRibbonSpec.tabs.filter(
		(tab) => !OUT_OF_SCOPE_TABS.has(tab.id),
	);
}

/** Every command a control of the spec emits on click. */
function collectSpecCommands(): SpecCommand[] {
	const commands: SpecCommand[] = [];
	for (const tab of spreadsheetTabs()) {
		for (const group of tab.groups) {
			for (const control of group.controls) {
				const where = `${tab.id}/${group.id}/${control.id}`;
				if (
					(control.type === "button" || control.type === "split-button") &&
					control.command
				) {
					commands.push({
						command: control.command,
						value: control.value,
						source: where,
					});
				} else if (control.type === "dropdown") {
					for (const item of control.items) {
						if (item.command) {
							commands.push({
								command: item.command,
								source: `${where}/${item.id}`,
							});
						}
					}
				} else if (control.type === "checkbox" && control.command) {
					commands.push({ command: control.command, source: where });
				}
			}
		}
	}
	return commands;
}

/** color-picker / select controls: they emit ONLY a wo-command event. */
function collectOnChangeControls(): {
	control: RibbonControlSpec;
	source: string;
}[] {
	const controls: { control: RibbonControlSpec; source: string }[] = [];
	for (const tab of spreadsheetTabs()) {
		for (const group of tab.groups) {
			for (const control of group.controls) {
				if (control.type === "color-picker" || control.type === "select") {
					controls.push({
						control,
						source: `${tab.id}/${group.id}/${control.id}`,
					});
				}
			}
		}
	}
	return controls;
}

/** Store state a ribbon command is allowed to mutate. */
function storeSnapshot(): string {
	return `${spreadsheetStore.activeRightPanel}|${spreadsheetStore.isEditMode}`;
}

/* ── Tests ────────────────────────────────────────────────────────────── */

describe("spreadsheet ribbon → univer command coverage", () => {
	it("dispatches a real mutation for every command the ribbon spec emits", () => {
		const facade = installRecordingFacade();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const unregister = registerEditorRouter(
			"sheet",
			createSpreadsheetCommandHandler(),
		);

		try {
			const commands = collectSpecCommands();
			// Sanity: the walk actually covered the spec (Home alone has 30+).
			expect(commands.length).toBeGreaterThan(40);
			expect(commands.map((c) => c.command)).toContain("bold");
			expect(commands.map((c) => c.command)).toContain("calcManual");

			const dead: string[] = [];
			for (const { command, value, source } of commands) {
				// calcAutomatic/calcManual flip spreadsheetStore.isEditMode —
				// normalize the precondition so the flip is observable.
				if (command === "calcAutomatic") spreadsheetStore.setEditMode(false);
				if (command === "calcManual") spreadsheetStore.setEditMode(true);

				const facadeBefore = facade.count();
				const storeBefore = storeSnapshot();

				// Path 1 — Toolbar.onRichTextCommand → dispatchUniverCommand.
				dispatchUniverCommand(command as UniverCommand, value);
				// Path 2 — Toolbar.onCommand → wo-command event → router.
				window.dispatchEvent(
					new CustomEvent("wo-command", { detail: { command, value } }),
				);

				const mutated =
					facade.count() > facadeBefore || storeSnapshot() !== storeBefore;
				if (!mutated) dead.push(`${source} → "${command}"`);
			}

			expect(dead, "commands that dispatch no mutation").toEqual([]);
			expect(
				warn.mock.calls.filter((args) =>
					String(args[0]).includes("unhandled command"),
				),
				"no command may fall through the router unhandled",
			).toEqual([]);
		} finally {
			warn.mockRestore();
			unregister();
		}
	});

	it("dispatches the color-picker / select onChange commands through the wo-command router", () => {
		const facade = installRecordingFacade();
		const unregister = registerEditorRouter(
			"sheet",
			createSpreadsheetCommandHandler(),
		);

		try {
			const controls = collectOnChangeControls();
			// textColor + fillColor pickers, 3 page-setup selects.
			expect(controls.length).toBeGreaterThanOrEqual(5);

			const dead: string[] = [];
			for (const { control, source } of controls) {
				const before = facade.count();
				const sample = control.type === "color-picker" ? "#FF0000" : "wide";
				(control as { onChange: (value: string) => void }).onChange(sample);
				if (facade.count() === before) dead.push(source);
			}

			expect(dead, "onChange controls that dispatch no mutation").toEqual([]);
		} finally {
			unregister();
		}
	});
});
