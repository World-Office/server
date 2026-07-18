// Conditional formatting on top of Univer's cell API.
// Native conditional formatting requires @univerjs/sheets-conditional-format (not yet integrated).

import type { UniverRangeFacade } from "./univer-command";

export interface ConditionalFormatRule {
	type:
		| "greaterThan"
		| "lessThan"
		| "between"
		| "dataBar"
		| "colorScale"
		| "iconSet";
	value?: number;
	values?: [number, number];
	format?: { bold?: boolean; color?: string; fill?: string };
}

const appliedRules = new Map<string, ConditionalFormatRule>();

export function applyConditionalFormatting(
	_cellRef: string,
	_rule: ConditionalFormatRule,
	_range: UniverRangeFacade,
): boolean {
	const rule: ConditionalFormatRule = _rule;
	appliedRules.set(_cellRef, rule);

	if (rule.format?.bold) {
		_range.setFontWeight("bold");
	}
	if (rule.format?.color) {
		_range.setFontColor(rule.format.color);
	}
	if (rule.format?.fill) {
		_range.setBackgroundColor(rule.format.fill);
	}
	return true;
}

export function removeConditionalFormatting(cellRef: string): void {
	appliedRules.delete(cellRef);
}

export function getAppliedRules(): Map<string, ConditionalFormatRule> {
	return new Map(appliedRules);
}
