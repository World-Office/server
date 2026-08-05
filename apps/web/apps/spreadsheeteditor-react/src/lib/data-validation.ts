// Data validation — tries native Univer API first, falls back to
// in-memory rule storage with programmatic validation.

import type { UniverAPIFacade, UniverRangeFacade } from "./univer-command";

export interface DataValidationRule {
	type: "list" | "numberRange" | "dateRange" | "textLength";
	listItems?: string[];
	min?: number;
	max?: number;
	errorMessage?: string;
}

const appliedValidations = new Map<string, DataValidationRule>();

export function applyDataValidation(
	cellRef: string,
	rule: DataValidationRule,
	range: UniverRangeFacade,
): boolean {
	appliedValidations.set(cellRef, rule);

	// Try native Univer data validation command
	try {
		const api = (range as unknown as { _api?: unknown })._api;
		if (
			api &&
			typeof (api as { executeCommand?: () => boolean }).executeCommand ===
				"function"
		) {
			const params: Record<string, unknown> = {
				range: cellRef,
				type: rule.type,
			};
			if (rule.type === "list" && rule.listItems) {
				params.listItems = rule.listItems;
			}
			if (rule.min !== undefined) params.min = rule.min;
			if (rule.max !== undefined) params.max = rule.max;
			if (rule.errorMessage) params.errorMessage = rule.errorMessage;
			(
				api as { executeCommand: (id: string, params: unknown) => boolean }
			).executeCommand("sheet.command.addDataValidation", params);
			return true;
		}
	} catch {
		// Native API not available — rule stored in-memory for programmatic validation
	}

	// If it's a list validation and the native API isn't available,
	// we can at least set a data-validation dropdown by setting a comment
	// or note on the cell (best-effort)
	return true;
}

export function removeDataValidation(cellRef: string): void {
	appliedValidations.delete(cellRef);
	try {
		const api = (
			globalThis as unknown as {
				__univerAPI?: {
					executeCommand?: (id: string, params: unknown) => boolean;
				};
			}
		).__univerAPI;
		if (api?.executeCommand) {
			api.executeCommand("sheet.command.removeDataValidation", {
				range: cellRef,
			});
		}
	} catch {
		// No native API available
	}
}

export function getValidationForCell(
	cellRef: string,
): DataValidationRule | undefined {
	return appliedValidations.get(cellRef);
}

export function validateCellValue(
	cellRef: string,
	value: string | number | null,
): string | null {
	const rule = appliedValidations.get(cellRef);
	if (!rule) return null;

	switch (rule.type) {
		case "list":
			if (rule.listItems && !rule.listItems.includes(String(value))) {
				return (
					rule.errorMessage ??
					`Value must be one of: ${rule.listItems.join(", ")}`
				);
			}
			break;
		case "numberRange": {
			const num = Number(value);
			if (Number.isNaN(num))
				return rule.errorMessage ?? "Value must be a number";
			if (rule.min !== undefined && num < rule.min)
				return rule.errorMessage ?? `Value must be ≥ ${rule.min}`;
			if (rule.max !== undefined && num > rule.max)
				return rule.errorMessage ?? `Value must be ≤ ${rule.max}`;
			break;
		}
		case "textLength": {
			const len = String(value ?? "").length;
			if (rule.min !== undefined && len < rule.min)
				return rule.errorMessage ?? `Text must be ≥ ${rule.min} characters`;
			if (rule.max !== undefined && len > rule.max)
				return rule.errorMessage ?? `Text must be ≤ ${rule.max} characters`;
			break;
		}
	}
	return null;
}

export function createPivotTableStub(
	api: UniverAPIFacade,
	_config: { sourceRange: string; targetSheetName: string; fields: unknown[] },
): boolean {
	const workbook = api.getActiveWorkbook();
	if (!workbook) return false;
	workbook.addSheet(_config.targetSheetName);
	return true;
}
