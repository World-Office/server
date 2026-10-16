import { afterEach, describe, expect, it } from "vitest";
import { collectTextCells, toCellRef } from "../lib/cell-access";
import { setActiveUniverAPI } from "../lib/univer-command";
import {
	applySuggestion,
	checkWord,
	findSpellIssues,
} from "../lib/spellcheck";
import { SpreadsheetStore } from "../stores/SpreadsheetStore";

/* Fake Univer facade: only what cell-access reads (workbook.save()). */
function installSnapshot(snapshot: unknown): void {
	setActiveUniverAPI({
		getActiveWorkbook: () => ({ save: () => snapshot }),
	} as never);
}

afterEach(() => {
	setActiveUniverAPI(null);
});

describe("cell-access", () => {
	it("renders A1 references for rows and columns", () => {
		expect(toCellRef(0, 0)).toBe("A1");
		expect(toCellRef(6, 1)).toBe("B7");
		expect(toCellRef(0, 25)).toBe("Z1");
		expect(toCellRef(0, 26)).toBe("AA1");
		expect(toCellRef(0, 27)).toBe("AB1");
	});

	it("collects text cells in sheet order, skipping empty ones", () => {
		installSnapshot({
			sheetOrder: ["s1", "s2"],
			sheets: {
				s1: {
					id: "s1",
					name: "Data",
					cellData: {
						0: { 0: { v: "hello" }, 1: { v: null }, 2: { v: 42 } },
						1: { 0: { v: "" } },
					},
				},
				s2: { id: "s2", name: "Empty", cellData: {} },
			},
		});
		const cells = collectTextCells();
		expect(cells).toHaveLength(2);
		expect(cells[0]).toMatchObject({
			sheetId: "s1",
			sheetName: "Data",
			row: 0,
			col: 0,
			ref: "A1",
			value: "hello",
		});
		expect(cells[1]).toMatchObject({ ref: "C1", value: "42" });
	});

	it("returns nothing when no workbook is mounted", () => {
		expect(collectTextCells()).toEqual([]);
	});
});

describe("spellcheck", () => {
	it("knows the frequent typos", () => {
		expect(checkWord("teh")).toEqual({
			reason: "typo",
			suggestion: "the",
		});
		expect(checkWord("Recieve")).toEqual({
			reason: "typo",
			suggestion: "Receive",
		});
	});

	it("keeps correct words, numbers and acronyms quiet", () => {
		expect(checkWord("spreadsheet")).toBeNull();
		expect(checkWord("123")).toBeNull();
		expect(checkWord("NASA")).toBeNull();
		expect(checkWord("I")).toBeNull();
	});

	it("collapses triple letters and matches the casing", () => {
		// "worrrd" carries a triple letter; collapsing yields the double-letter form
		expect(checkWord("worrrd")).toEqual({
			reason: "triple-letter",
			suggestion: "worrrd".replace(/(.)\1\1+/g, "$1$1"),
		});
		expect(checkWord("worrd")).toBeNull(); // double letters are legitimate
	});

	it("finds issues per cell, including repeated words", () => {
		const cells = [
			{
				sheetId: "s1",
				sheetName: "Sheet1",
				row: 0,
				col: 0,
				ref: "A1",
				value: "teh teh thier",
			},
		];
		const issues = findSpellIssues(cells);
		expect(issues.some((i) => i.reason === "repeated-word")).toBe(true);
		expect(issues.some((i) => i.reason === "typo")).toBe(true);
	});

	it("respects the session ignore list", () => {
		const cells = [
			{
				sheetId: "s1",
				sheetName: "Sheet1",
				row: 0,
				col: 0,
				ref: "A1",
				value: "teh total",
			},
		];
		expect(findSpellIssues(cells, new Set(["teh"]))).toEqual([]);
	});

	it("applies a fix at the issue offset and re-anchors when edited", () => {
		const cells = [
			{
				sheetId: "s1",
				sheetName: "Sheet1",
				row: 0,
				col: 0,
				ref: "A1",
				value: "cost teh moon",
			},
		];
		const issue = findSpellIssues(cells)[0];
		expect(applySuggestion("cost teh moon", issue)).toBe("cost the moon");
		// same word, different offset after a manual edit
		const shifted = { ...issue, offset: 9 } as typeof issue;
		expect(applySuggestion("cost, teh moon", shifted)).toBe("cost, the moon");
	});
});

describe("SpreadsheetStore left-menu panels", () => {
	it("anchors, resolves, replies and deletes comment threads", () => {
		const store = new SpreadsheetStore();
		const thread = store.addCellComment("Sheet1!B7", " check this ");
		expect(thread).not.toBeNull();
		expect(thread?.cellRef).toBe("Sheet1!B7");
		expect(thread?.text).toBe("check this");
		expect(store.cellComments).toHaveLength(1);

		expect(store.addCellComment("A1", "   ")).toBeNull();

		expect(store.addCellReply(thread!.id, " done")).not.toBeNull();
		expect(store.cellComments[0].replies).toHaveLength(1);

		store.setCellCommentResolved(thread!.id, true);
		expect(store.cellComments[0].resolved).toBe(true);

		store.deleteCellComment(thread!.id);
		expect(store.cellComments).toHaveLength(0);
	});

	it("keeps chat messages in order and clears them", () => {
		const store = new SpreadsheetStore();
		expect(store.addChatMessage("  ")).toBeNull();
		const first = store.addChatMessage("hello");
		const second = store.addChatMessage("world");
		expect([first?.text, second?.text]).toEqual(["hello", "world"]);
		expect(store.chatMessages.map((m) => m.self)).toEqual([true, true]);
		store.clearChatMessages();
		expect(store.chatMessages).toHaveLength(0);
	});
});
