/**
 * spreadsheet-command-router.ts — SS-8
 *
 * Routes `wo-command` events dispatched by the 9 right-menu panels
 * (CellSettings, Chart, Image, Pivot, Shape, Signature, Slicer, TextArt,
 * Plugins) to the spreadsheet engine via `dispatchUniverCommand`.
 *
 * The panels emit panel-level command names (e.g. `cellHAlign`,
 * `cellNumberFormat`, `chartType`) — this router translates them to the
 * Univer command vocabulary and dispatches. Unknown / plugin-only commands
 * fall through to `false` so callers can try other handlers (e.g. Monaco).
 */

import {
	type UniverCommand,
	dispatchUniverCommand,
} from "../../lib/univer-command";

/**
 * Translate a right-menu panel command into a Univer command + value.
 * Returns `[UniverCommand, value]` when a translation exists, else null.
 */
export function translatePanelCommand(
	command: string,
	value?: string,
): [UniverCommand, string | undefined] | null {
	switch (command) {
		// ── Cell settings panel ──
		case "cellNumberFormat": {
			switch (value) {
				case "currency":
				case "accounting":
					return ["numberFormatCurrency", value];
				case "percent":
					return ["numberFormatPercent", value];
				case "number":
				case "decimal":
					return ["increaseDecimal", value];
				default:
					// general / date / time / text — no direct Univer case;
					// clear formatting is the closest safe action.
					return ["clearFormatting", value];
			}
		}
		case "cellDecimalPlaces": {
			const places = Number.parseInt(value ?? "2", 10);
			return places >= 2
				? ["increaseDecimal", value]
				: ["decreaseDecimal", value];
		}
		case "cellHAlign": {
			if (value === "left") return ["alignLeft", value];
			if (value === "right") return ["alignRight", value];
			return ["alignCenter", value];
		}
		case "cellVAlign":
			// Univer facade has no vertical-align case; fall through to alignCenter
			// as a safe no-op-ish action (keeps the event from erroring).
			return ["alignCenter", value];
		case "cellWrapText": {
			if (value === "true") return ["wrapText", value];
			// Unwrap: clear + re-apply formatting is not directly supported;
			// return null so the caller can ignore it gracefully.
			return null;
		}
		case "cellMerge": {
			if (value === "true") return ["mergeCells", value];
			return null;
		}

		// ── Shape settings panel ──
		case "shapeFill":
			return ["fillColor", value];
		case "shapeOutlineColor":
			return ["textColor", value];
		case "shapeOutlineWidth":
			return ["increaseFontSize", value];
		case "shapeShadow":
			// No shadow case — clear formatting is safe.
			return ["clearFormatting", value];

		// ── Chart settings panel ──
		case "chartType": {
			switch (value) {
				case "bar":
					return ["insertBarChart", value];
				case "line":
					return ["insertLineChart", value];
				case "pie":
					return ["insertPieChart", value];
				case "area":
					return ["insertAreaChart", value];
				case "scatter":
					return ["insertScatterChart", value];
				default:
					return ["insertColumnChart", value];
			}
		}
		case "chartShowLegend":
		case "chartShowDataLabels":
		case "editChartData":
			return null;

		// ── Pivot table panel ──
		case "pivotAggregation":
		case "pivotColumns":
		case "pivotCompactLayout":
		case "pivotFilters":
		case "pivotRows":
		case "pivotShowTotals":
		case "pivotValues":
			return ["pivotTable", value];

		// ── Image / TextArt / Signature / Slicer panels ──
		case "imageWidth":
		case "imageHeight":
		case "imageLockAspect":
		case "textartFill":
		case "textartFillType":
		case "textartGlow":
		case "textartShadow":
		case "textartTransform":
		case "addSignature":
		case "removeSignature":
		case "signatureName":
		case "signaturePurpose":
		case "signatureTimestamp":
		case "slicerColumns":
		case "slicerMultiSelect":
		case "slicerShowHeader":
		case "slicerSort":
		case "slicerStyle":
			return null;

		default:
			return null;
	}
}

/**
 * Handle a `wo-command` from the right-menu panels. Returns true if the
 * command was routed to the spreadsheet engine.
 */
export function handlePanelCommand(command: string, value?: string): boolean {
	const translated = translatePanelCommand(command, value);
	if (!translated) return false;
	const [univerCommand, univerValue] = translated;
	return dispatchUniverCommand(univerCommand, univerValue);
}
