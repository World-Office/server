// Data validation on top of Univer's cell API.
// Native data validation requires @univerjs/sheets-data-validation (not yet integrated).

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
	_rule: DataValidationRule,
	_range: UniverRangeFacade,
): boolean {
	appliedValidations.set(cellRef, _rule);
	return true;
}

export function removeDataValidation(cellRef: string): void {
	appliedValidations.delete(cellRef);
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
