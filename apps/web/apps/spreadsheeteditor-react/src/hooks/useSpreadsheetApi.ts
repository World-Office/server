import { sdkBridge } from "@world-office/sdk-bridge";
import { useEffect, useState } from "react";

export interface SpreadsheetApi {
	getActiveSheetIndex(): number;
	setActiveSheetIndex(index: number): void;
	getSheetName(index: number): string;
	getSheetCount(): number;
	addSheet(name: string): void;
	renameSheet(index: number, name: string): void;
	deleteSheet(index: number): void;
	getActiveCell(): { row: number; col: number };
	setActiveCell(row: number, col: number): void;
	getSelectionRange(): {
		startRow: number;
		startCol: number;
		endRow: number;
		endCol: number;
	};
	setSelectionRange(
		startRow: number,
		startCol: number,
		endRow: number,
		endCol: number,
	): void;
	getCellFormula(row: number, col: number): string;
	setCellFormula(row: number, col: number, formula: string): void;
	zoomIn(): void;
	zoomOut(): void;
	zoom(percent: number): void;
	zoomFitToPage(): void;
	zoomFitToWidth(): void;
	asc_enableKeyEvents(enable: boolean): void;
}

export function useSpreadsheetApi(): SpreadsheetApi | null {
	const [ready, setReady] = useState(sdkBridge.isReady);

	useEffect(() => {
		if (sdkBridge.isReady) {
			setReady(true);
			return;
		}
		sdkBridge.initializeFromGlobals();
		const interval = setInterval(() => {
			if (sdkBridge.isReady) {
				setReady(true);
				clearInterval(interval);
			}
		}, 100);
		return () => clearInterval(interval);
	}, []);

	return ready ? (sdkBridge as unknown as SpreadsheetApi) : null;
}
