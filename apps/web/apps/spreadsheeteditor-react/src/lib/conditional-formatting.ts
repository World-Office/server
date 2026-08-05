// Conditional formatting — tries native Univer API first, falls back to
// in-memory rule storage + direct cell style application.

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
	cellRef: string,
	rule: ConditionalFormatRule,
	range: UniverRangeFacade,
): boolean {
	appliedRules.set(cellRef, rule);

	// Try native Univer conditional formatting command first
	try {
		const api = (range as unknown as { _api?: unknown })._api;
		if (
			api &&
			typeof (api as { executeCommand?: () => boolean }).executeCommand ===
				"function"
		) {
			(
				api as { executeCommand: (id: string, params: unknown) => boolean }
			).executeCommand("sheet.command.addConditionalFormatRule", {
				ruleType: rule.type,
				value: rule.value,
				range: cellRef,
				format: rule.format,
			});
			return true;
		}
	} catch {
		// Native API not available — fall through to direct cell styling
	}

	// Fallback: apply formatting directly to the cell
	if (rule.format?.bold) {
		range.setFontWeight("bold");
	}
	if (rule.format?.color) {
		range.setFontColor(rule.format.color);
	}
	if (rule.format?.fill) {
		range.setBackgroundColor(rule.format.fill);
	}
	return true;
}

export function removeConditionalFormatting(cellRef: string): void {
	appliedRules.delete(cellRef);
	// Try native Univer API to remove the rule
	try {
		const api = (
			globalThis as unknown as {
				__univerAPI?: {
					executeCommand?: (id: string, params: unknown) => boolean;
				};
			}
		).__univerAPI;
		if (api?.executeCommand) {
			api.executeCommand("sheet.command.removeConditionalFormatRule", {
				range: cellRef,
			});
		}
	} catch {
		// No native API available — rule was only in-memory
	}
}

export function getAppliedRules(): Map<string, ConditionalFormatRule> {
	return new Map(appliedRules);
}
