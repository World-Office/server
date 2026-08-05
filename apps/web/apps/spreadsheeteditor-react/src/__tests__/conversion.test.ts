import { describe, expect, it } from "vitest";
import {
	convertWoSpreadsheetToCsv,
	univerSnapshotToWoSpreadsheet,
} from "../lib/conversion";

// Univer IWorkbookData snapshot (matches the format from workbook.save())
interface UniverCell {
	v?: string | number | boolean | null;
	t?: number | null;
	f?: string | null;
}
interface UniverSheet {
	id: string;
	name: string;
	rowCount?: number;
	columnCount?: number;
	cellData?: Record<number, Record<number, UniverCell>>;
	mergeData?: Array<{
		startRow: number;
		startColumn: number;
		endRow: number;
		endColumn: number;
	}>;
}
interface UniverSnapshot {
	id?: string;
	name?: string;
	sheetOrder?: string[];
	sheets?: Record<string, Partial<UniverSheet>>;
}

describe("univerSnapshotToWoSpreadsheet", () => {
	it("converts a simple Univer snapshot with one cell", () => {
		const snapshot: UniverSnapshot = {
			id: "wb-1",
			name: "Test",
			sheetOrder: ["sheet-1"],
			sheets: {
				"sheet-1": {
					id: "sheet-1",
					name: "Sheet 1",
					rowCount: 100,
					columnCount: 26,
					cellData: {
						0: {
							0: { v: 42, t: 2 }, // NUMBER
						},
					},
				},
			},
		};

		const json = univerSnapshotToWoSpreadsheet(snapshot);
		const wo = JSON.parse(json);

		expect(wo.version).toBe(1);
		expect(wo.name).toBe("Test");
		expect(wo.sheet_order).toEqual(["sheet-1"]);
		expect(wo.sheets).toHaveLength(1);
		expect(wo.sheets[0].id).toBe("sheet-1");
		expect(wo.sheets[0].name).toBe("Sheet 1");
		expect(wo.sheets[0].rows).toHaveLength(1);
		expect(wo.sheets[0].rows[0].r).toBe(1); // 1-based
		expect(wo.sheets[0].rows[0].cells).toHaveLength(1);
		expect(wo.sheets[0].rows[0].cells[0].r).toBe("A1");
		expect(wo.sheets[0].rows[0].cells[0].t).toBe("n");
		expect(wo.sheets[0].rows[0].cells[0].v).toBe("42");
	});

	it("converts string cells with shared strings", () => {
		const snapshot: UniverSnapshot = {
			sheetOrder: ["s1"],
			sheets: {
				s1: {
					id: "s1",
					name: "Sheet 1",
					cellData: {
						0: {
							0: { v: "Hello", t: 1 }, // STRING
							1: { v: "World", t: 1 }, // STRING
						},
						1: {
							0: { v: "Hello", t: 1 }, // Duplicate string
						},
					},
				},
			},
		};

		const json = univerSnapshotToWoSpreadsheet(snapshot);
		const wo = JSON.parse(json);

		expect(wo.shared_strings).toHaveLength(2); // "Hello" + "World"
		expect(wo.shared_strings[0]).toBe("Hello");
		expect(wo.shared_strings[1]).toBe("World");

		// First row: A1="Hello" (index 0), B1="World" (index 1)
		expect(wo.sheets[0].rows[0].cells[0].r).toBe("A1");
		expect(wo.sheets[0].rows[0].cells[0].t).toBe("s");
		expect(wo.sheets[0].rows[0].cells[0].v).toBe("0"); // index 0
		expect(wo.sheets[0].rows[0].cells[1].r).toBe("B1");
		expect(wo.sheets[0].rows[0].cells[1].t).toBe("s");
		expect(wo.sheets[0].rows[0].cells[1].v).toBe("1"); // index 1

		// Second row: A2="Hello" (same index 0)
		expect(wo.sheets[0].rows[1].cells[0].r).toBe("A2");
		expect(wo.sheets[0].rows[1].cells[0].v).toBe("0"); // reused index
	});

	it("converts formulas", () => {
		const snapshot: UniverSnapshot = {
			sheetOrder: ["s1"],
			sheets: {
				s1: {
					id: "s1",
					name: "Sheet 1",
					cellData: {
						0: {
							0: { v: 10, t: 2 },
							1: { v: 20, t: 2 },
							2: { v: 30, t: 2, f: "=SUM(A1:B1)" },
						},
					},
				},
			},
		};

		const json = univerSnapshotToWoSpreadsheet(snapshot);
		const wo = JSON.parse(json);

		expect(wo.sheets[0].rows[0].cells[2].r).toBe("C1");
		expect(wo.sheets[0].rows[0].cells[2].f).toBe("=SUM(A1:B1)");
		expect(wo.sheets[0].rows[0].cells[2].t).toBe("n");
	});

	it("converts merge data to range strings", () => {
		const snapshot: UniverSnapshot = {
			sheetOrder: ["s1"],
			sheets: {
				s1: {
					id: "s1",
					name: "Sheet 1",
					cellData: {
						0: {
							0: { v: "Merged", t: 1 },
						},
					},
					mergeData: [{ startRow: 0, startColumn: 0, endRow: 2, endColumn: 3 }],
				},
			},
		};

		const json = univerSnapshotToWoSpreadsheet(snapshot);
		const wo = JSON.parse(json);

		// endRow/endColumn are exclusive in Univer, so 0:0 to 1:2 → "A1:C2"
		expect(wo.sheets[0].merges).toEqual(["A1:C2"]);
	});

	it("converts boolean cells", () => {
		const snapshot: UniverSnapshot = {
			sheetOrder: ["s1"],
			sheets: {
				s1: {
					id: "s1",
					name: "Sheet 1",
					cellData: {
						0: {
							0: { v: true, t: 3 }, // BOOLEAN
						},
					},
				},
			},
		};

		const json = univerSnapshotToWoSpreadsheet(snapshot);
		const wo = JSON.parse(json);

		expect(wo.sheets[0].rows[0].cells[0].t).toBe("b");
		expect(wo.sheets[0].rows[0].cells[0].v).toBe("true");
	});

	it("handles empty snapshot", () => {
		const json = univerSnapshotToWoSpreadsheet({});
		const wo = JSON.parse(json);

		expect(wo.version).toBe(1);
		expect(wo.name).toBe("Spreadsheet");
		expect(wo.sheets).toEqual([]);
		expect(wo.sheet_order).toEqual([]);
	});

	it("handles snapshot with no cellData", () => {
		const snapshot: UniverSnapshot = {
			sheetOrder: ["s1"],
			sheets: {
				s1: {
					id: "s1",
					name: "Empty Sheet",
					rowCount: 100,
					columnCount: 26,
				},
			},
		};

		const json = univerSnapshotToWoSpreadsheet(snapshot);
		const wo = JSON.parse(json);

		expect(wo.sheets).toHaveLength(1);
		expect(wo.sheets[0].name).toBe("Empty Sheet");
		expect(wo.sheets[0].rows).toEqual([]);
		expect(wo.sheets[0].merges).toEqual([]);
		expect(wo.sheets[0].row_count).toBe(100);
		expect(wo.sheets[0].column_count).toBe(26);
	});

	it("handles multiple sheets", () => {
		const snapshot: UniverSnapshot = {
			sheetOrder: ["s1", "s2"],
			sheets: {
				s1: {
					id: "s1",
					name: "First",
					cellData: { 0: { 0: { v: 1, t: 2 } } },
				},
				s2: {
					id: "s2",
					name: "Second",
					cellData: { 0: { 0: { v: 2, t: 2 } } },
				},
			},
		};

		const json = univerSnapshotToWoSpreadsheet(snapshot);
		const wo = JSON.parse(json);

		expect(wo.sheets).toHaveLength(2);
		expect(wo.sheets[0].name).toBe("First");
		expect(wo.sheets[1].name).toBe("Second");
		expect(wo.sheet_order).toEqual(["s1", "s2"]);
	});

	it("converts column indices to Excel letters correctly", () => {
		const snapshot: UniverSnapshot = {
			sheetOrder: ["s1"],
			sheets: {
				s1: {
					id: "s1",
					name: "Sheet 1",
					cellData: {
						0: {
							0: { v: "A", t: 1 },
							25: { v: "Z", t: 1 },
							26: { v: "AA", t: 1 },
							27: { v: "AB", t: 1 },
						},
					},
				},
			},
		};

		const json = univerSnapshotToWoSpreadsheet(snapshot);
		const wo = JSON.parse(json);

		expect(wo.sheets[0].rows[0].cells[0].r).toBe("A1");
		expect(wo.sheets[0].rows[0].cells[1].r).toBe("Z1");
		expect(wo.sheets[0].rows[0].cells[2].r).toBe("AA1");
		expect(wo.sheets[0].rows[0].cells[3].r).toBe("AB1");
	});
});

describe("convertWoSpreadsheetToCsv", () => {
	it("converts Univer snapshot to CSV", () => {
		const snapshot: UniverSnapshot = {
			sheetOrder: ["s1"],
			sheets: {
				s1: {
					id: "s1",
					name: "Sheet 1",
					cellData: {
						0: {
							0: { v: "Name", t: 1 },
							1: { v: "Age", t: 1 },
						},
						1: {
							0: { v: "Alice", t: 1 },
							1: { v: 30, t: 2 },
						},
					},
				},
			},
		};

		const json = JSON.stringify(snapshot);
		const csv = convertWoSpreadsheetToCsv(json);

		expect(csv).toContain("Name,Age");
		expect(csv).toContain("Alice,30");
	});

	it("handles CSV escaping", () => {
		const snapshot: UniverSnapshot = {
			sheetOrder: ["s1"],
			sheets: {
				s1: {
					id: "s1",
					name: "Sheet 1",
					cellData: {
						0: {
							0: { v: 'Hello, "World"', t: 1 },
							1: { v: "Line\nBreak", t: 1 },
						},
					},
				},
			},
		};

		const json = JSON.stringify(snapshot);
		const csv = convertWoSpreadsheetToCsv(json);

		expect(csv).toContain('"Hello, ""World"""');
		expect(csv).toContain('"Line\nBreak"');
	});

	it("returns empty string for empty snapshot", () => {
		expect(convertWoSpreadsheetToCsv("{}")).toBe("");
	});

	it("converts WoSpreadsheet array format to CSV", () => {
		const wo = {
			version: 1,
			name: "Test",
			sheet_order: ["s1"],
			sheets: [
				{
					id: "s1",
					name: "Sheet 1",
					row_count: 2,
					column_count: 2,
					rows: [
						{
							r: 1,
							cells: [
								{ r: "A1", t: "s", v: "0" },
								{ r: "B1", t: "n", v: "42" },
							],
						},
					],
					merges: [],
				},
			],
			shared_strings: ["Name"],
		};

		const json = JSON.stringify(wo);
		const csv = convertWoSpreadsheetToCsv(json);

		expect(csv).toContain("Name");
		expect(csv).toContain("42");
	});
});
