import { afterEach, describe, expect, it } from "vitest";
import { SpreadsheetStore } from "../stores/SpreadsheetStore";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("SpreadsheetStore", () => {
	it("initializes with default state", () => {
		const store = new SpreadsheetStore();
		expect(store.mode).toBeNull();
		expect(store.document).toBeNull();
		expect(store.isDocReady).toBe(false);
		expect(store.zoomLevel).toBe(100);
		expect(store.activeSheetIndex).toBe(0);
		expect(store.sheets).toEqual([]);
		expect(store.toolbarVisible).toBe(true);
		expect(store.leftMenuVisible).toBe(true);
		expect(store.rightMenuVisible).toBe(false);
		expect(store.activeCell).toEqual({ row: 0, col: 0 });
		expect(store.showStatistics).toBe(false);
		expect(store.formulaInput).toBe("");
		expect(store.filteredCount).toBe(0);
	});

	it("handles zoom", () => {
		const store = new SpreadsheetStore();
		store.setZoomLevel(150);
		expect(store.zoomLevel).toBe(150);
		store.zoomIn();
		expect(store.zoomLevel).toBeGreaterThan(150);
		store.zoomOut();
		expect(store.zoomLevel).toBe(150);
	});

	it("toggles UI panels", () => {
		const store = new SpreadsheetStore();
		store.setLeftMenuVisible(false);
		expect(store.leftMenuVisible).toBe(false);
		store.setRightMenuVisible(true);
		expect(store.rightMenuVisible).toBe(true);
	});

	it("handles sheet navigation", () => {
		const store = new SpreadsheetStore();
		store.sheets = [{ id: "1", name: "Sheet1", tabColor: null }];
		store.setActiveSheetIndex(0);
		expect(store.activeSheetIndex).toBe(0);
	});

	it("tracks active cell", () => {
		const store = new SpreadsheetStore();
		store.setActiveCell(5, 10);
		expect(store.activeCell).toEqual({ row: 5, col: 10 });
		store.setActiveCell(0, 0);
		expect(store.activeCell).toEqual({ row: 0, col: 0 });
	});

	it("toggles statistics display", () => {
		const store = new SpreadsheetStore();
		expect(store.showStatistics).toBe(false);
		store.setShowStatistics(true);
		expect(store.showStatistics).toBe(true);
		store.setShowStatistics(false);
		expect(store.showStatistics).toBe(false);
	});

	it("tracks form input", () => {
		const store = new SpreadsheetStore();
		store.setFormulaInput("=SUM(A1:A10)");
		expect(store.formulaInput).toBe("=SUM(A1:A10)");
		store.setFormulaInput("");
		expect(store.formulaInput).toBe("");
	});

	it("toggles file menu", () => {
		const store = new SpreadsheetStore();
		store.setFileMenuOpen(true);
		expect(store.isFileMenuOpen).toBe(true);
	});

	it("renames the document and ignores empty names", () => {
		const store = new SpreadsheetStore();
		store.setDocument({ title: "budget.xlsx", fileType: "xlsx" });
		store.renameDocument("  Q3 budget.xlsx  ");
		expect(store.document?.title).toBe("Q3 budget.xlsx");
		// blank input must not clobber the title
		store.renameDocument("   ");
		expect(store.document?.title).toBe("Q3 budget.xlsx");
		// no document open — a no-op, not a crash
		const empty = new SpreadsheetStore();
		empty.renameDocument("x.xlsx");
		expect(empty.document).toBeNull();
	});

	it("sets tabs", () => {
		const store = new SpreadsheetStore();
		store.setActiveTab("home");
		expect(store.activeTab).toBe("home");
	});
});

// F-146: protection state + API wiring
it("initializes protection state as unrestricted", () => {
	const store = new SpreadsheetStore();
	expect(store.protectionState.restrict_editing).toBe(false);
	expect(store.protectionState.password_set).toBe(false);
	expect(store.protectionError).toBeNull();
});

it("refreshProtectionState fetches /api/documents/{id}/protect", async () => {
	const store = new SpreadsheetStore();
	store.wopiConnection = {
		wopiFileId: "test-doc-123",
		wopiAccessToken: "tok",
		docserverBase: "http://localhost",
	};
	let fetchedUrl = "";
	globalThis.fetch = ((url: string) => {
		fetchedUrl = url;
		return Promise.resolve(
			new Response(
				JSON.stringify({ restrict_editing: true, password_set: true }),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			),
		);
	}) as typeof fetch;
	await store.refreshProtectionState();
	expect(fetchedUrl).toBe("/api/documents/test-doc-123/protect");
	expect(store.protectionState.restrict_editing).toBe(true);
	expect(store.protectionState.password_set).toBe(true);
	expect(store.protectionError).toBeNull();
	globalThis.fetch = originalFetch;
});

it("applyProtection POSTs to /api/documents/{id}/protect", async () => {
	const store = new SpreadsheetStore();
	store.wopiConnection = {
		wopiFileId: "test-doc-456",
		wopiAccessToken: "tok",
		docserverBase: "http://localhost",
	};
	let fetchedUrl = "";
	let fetchedMethod = "";
	let fetchedBody = "";
	globalThis.fetch = ((url: string, init: RequestInit) => {
		fetchedUrl = url;
		fetchedMethod = init.method || "GET";
		fetchedBody = init.body as string;
		return Promise.resolve(
			new Response(
				JSON.stringify({ restrict_editing: true, password_set: true }),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			),
		);
	}) as typeof fetch;
	const result = await store.applyProtection({
		restrict_editing: true,
		password: "secret",
		clear_password: false,
		current_password: null,
	});
	expect(fetchedUrl).toBe("/api/documents/test-doc-456/protect");
	expect(fetchedMethod).toBe("POST");
	const body = JSON.parse(fetchedBody);
	expect(body.restrict_editing).toBe(true);
	expect(body.password).toBe("secret");
	expect(body.clear_password).toBe(false);
	expect(result.ok).toBe(true);
	expect(store.protectionState.restrict_editing).toBe(true);
	globalThis.fetch = originalFetch;
});

it("applyProtection handles errors", async () => {
	const store = new SpreadsheetStore();
	store.wopiConnection = {
		wopiFileId: "test-doc-789",
		wopiAccessToken: "tok",
		docserverBase: "http://localhost",
	};
	globalThis.fetch = (() =>
		Promise.resolve(
			new Response(JSON.stringify({ error: "wrong password" }), {
				status: 403,
				headers: { "Content-Type": "application/json" },
			}),
		)) as typeof fetch;
	const result = await store.applyProtection({
		restrict_editing: false,
		password: null,
		clear_password: false,
		current_password: "bad",
	});
	expect(result.ok).toBe(false);
	expect(result.error).toBe("wrong password");
	globalThis.fetch = originalFetch;
});

it("protectUrl falls back to demo.xlsx without wopiConnection", () => {
	const store = new SpreadsheetStore();
	// @ts-expect-error: accessing private method
	const url = store.protectUrl();
	expect(url).toBe("/api/documents/demo.xlsx/protect");
});
