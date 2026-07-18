import { getActiveUniverAPI, onUniverChange } from "./univer-command";

export interface ActiveCellState {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strikethrough: boolean;
	align: "left" | "center" | "right" | "normal";
	fontSize: number;
	fontColor: string;
	fillColor: string;
	isMerged: boolean;
	isWrap: boolean;
	cellRef: string;
	row: number;
	col: number;
	value: string | number | null;
	formula: string | null;
}

const defaultState: ActiveCellState = {
	bold: false,
	italic: false,
	underline: false,
	strikethrough: false,
	align: "normal",
	fontSize: 11,
	fontColor: "#000000",
	fillColor: "#FFFFFF",
	isMerged: false,
	isWrap: false,
	cellRef: "",
	row: 0,
	col: 0,
	value: null,
	formula: null,
};

let currentState: ActiveCellState = { ...defaultState };
const stateListeners = new Set<() => void>();

function readCellState(): ActiveCellState {
	const api = getActiveUniverAPI();
	if (!api) return { ...defaultState };

	try {
		const workbook = api.getActiveWorkbook();
		if (!workbook) return { ...defaultState };

		const worksheet = workbook.getActiveSheet();
		if (!worksheet) return { ...defaultState };

		const range = worksheet.getSelection().getActiveRange();
		if (!range) return { ...defaultState };

		const fontWeight = safeCall(() => range.getFontWeight(), "normal");
		const fontStyle = safeCall(() => range.getFontStyle(), "normal");
		const fontLine = safeCall(() => range.getFontLine(), "none");

		return {
			bold: fontWeight === "bold",
			italic: fontStyle === "italic",
			underline: fontLine === "underline",
			strikethrough: fontLine === "line-through",
			align: safeCall(() => range.getHorizontalAlignment(), "normal") as
				| "left"
				| "center"
				| "right"
				| "normal",
			fontSize: safeCall(() => range.getFontSize(), 11),
			fontColor: safeCall(() => range.getFontColor(), "#000000"),
			fillColor: safeCall(() => range.getBackgroundColor(), "#FFFFFF"),
			isMerged: false,
			isWrap: safeCall(() => range.getWrap(), false),
			cellRef: safeCall(() => range.getCellRef(), ""),
			row: safeCall(() => range.getRow(), 0),
			col: safeCall(() => range.getColumn(), 0),
			value: safeCall(() => range.getValue(), null),
			formula: safeCall(() => range.getFormula(), null),
		};
	} catch {
		return { ...defaultState };
	}
}

function safeCall<T>(fn: () => T, fallback: T): T {
	try {
		const result = fn();
		return result ?? fallback;
	} catch {
		return fallback;
	}
}

let isTrackerInitialized = false;

export function initializeStateTracker(): void {
	if (isTrackerInitialized) return;
	isTrackerInitialized = true;

	onUniverChange(() => {
		currentState = readCellState();
		for (const listener of stateListeners) {
			listener();
		}
	});

	currentState = readCellState();
}

export function getActiveCellState(): ActiveCellState {
	return currentState;
}

export function onStateChange(callback: () => void): () => void {
	stateListeners.add(callback);
	return () => {
		stateListeners.delete(callback);
	};
}

export function subscribeCellState(
	callback: (state: ActiveCellState) => void,
): () => void {
	const listener = () => callback(currentState);
	stateListeners.add(listener);
	return () => {
		stateListeners.delete(listener);
	};
}
