import { describe, expect, it } from "vitest";
import { translatePanelCommand } from "../spreadsheet-command-router";

describe("spreadsheet-command-router (SS-8)", () => {
	it("maps cellHAlign to align commands", () => {
		expect(translatePanelCommand("cellHAlign", "left")).toEqual([
			"alignLeft",
			"left",
		]);
		expect(translatePanelCommand("cellHAlign", "right")).toEqual([
			"alignRight",
			"right",
		]);
		expect(translatePanelCommand("cellHAlign", "center")).toEqual([
			"alignCenter",
			"center",
		]);
	});

	it("maps cellNumberFormat to currency/percent/decimal", () => {
		expect(translatePanelCommand("cellNumberFormat", "currency")).toEqual([
			"numberFormatCurrency",
			"currency",
		]);
		expect(translatePanelCommand("cellNumberFormat", "percent")).toEqual([
			"numberFormatPercent",
			"percent",
		]);
		expect(translatePanelCommand("cellNumberFormat", "number")).toEqual([
			"increaseDecimal",
			"number",
		]);
	});

	it("maps cellMerge / cellWrapText to Univer commands", () => {
		expect(translatePanelCommand("cellMerge", "true")).toEqual([
			"mergeCells",
			"true",
		]);
		expect(translatePanelCommand("cellWrapText", "true")).toEqual([
			"wrapText",
			"true",
		]);
	});

	it("maps chartType to chart insertion", () => {
		expect(translatePanelCommand("chartType", "bar")).toEqual([
			"insertBarChart",
			"bar",
		]);
		expect(translatePanelCommand("chartType", "pie")).toEqual([
			"insertPieChart",
			"pie",
		]);
		expect(translatePanelCommand("chartType", "line")).toEqual([
			"insertLineChart",
			"line",
		]);
	});

	it("maps pivot commands to pivotTable", () => {
		expect(translatePanelCommand("pivotRows", "row1")).toEqual([
			"pivotTable",
			"row1",
		]);
		expect(translatePanelCommand("pivotValues", "sum")).toEqual([
			"pivotTable",
			"sum",
		]);
	});

	it("returns null for no-op / plugin-only commands", () => {
		expect(translatePanelCommand("addSignature", "sig")).toBeNull();
		expect(translatePanelCommand("slicerStyle", "dark")).toBeNull();
		expect(translatePanelCommand("unknownCommand", "x")).toBeNull();
		expect(translatePanelCommand("chartShowLegend", "true")).toBeNull();
	});
});
