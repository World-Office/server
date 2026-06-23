import { useEffect } from "react";
import { spreadsheetStore } from "../stores/SpreadsheetStore";

export function useKeyboardShortcuts(): void {
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent): void {
			if (e.ctrlKey || e.metaKey) {
				if (e.key === "=" || e.key === "+") {
					e.preventDefault();
					spreadsheetStore.zoomIn();
				} else if (e.key === "-") {
					e.preventDefault();
					spreadsheetStore.zoomOut();
				} else if (e.key === "0") {
					e.preventDefault();
					spreadsheetStore.setZoomLevel(100);
				} else if (e.key === "s") {
					e.preventDefault();
					spreadsheetStore.saveToWopi();
				}
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);
}
