import { useEffect } from "react";
import { presentationStore } from "../stores/PresentationStore";

export function usePresentationKeyboard(): void {
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent): void {
			if (presentationStore.editingShapeId) return;

			const isCtrl = e.ctrlKey || e.metaKey;
			const isShift = e.shiftKey;
			const ids = presentationStore.selectedShapeIds;
			const hasSelection = ids.length > 0;

			if (isCtrl && !isShift && (e.key === "d" || e.key === "D")) {
				if (!hasSelection) return;
				e.preventDefault();
				presentationStore.copyShape();
				presentationStore.pasteShape();
				return;
			}

			if (isCtrl && !isShift && (e.key === "g" || e.key === "G")) {
				if (!hasSelection) return;
				e.preventDefault();
				presentationStore.groupSelected();
				return;
			}

			if (isCtrl && isShift && (e.key === "g" || e.key === "G")) {
				if (!hasSelection) return;
				e.preventDefault();
				presentationStore.ungroupSelected();
				return;
			}

			if (!hasSelection) return;

			let dx = 0;
			let dy = 0;
			switch (e.key) {
				case "ArrowUp":
					dy = -1;
					break;
				case "ArrowDown":
					dy = 1;
					break;
				case "ArrowLeft":
					dx = -1;
					break;
				case "ArrowRight":
					dx = 1;
					break;
				default:
					return;
			}

			e.preventDefault();

			if (isShift) {
				dx *= 10;
				dy *= 10;
			}

			const slide = presentationStore.slides[presentationStore.currentSlide];
			if (!slide?.shapes) return;

			for (const id of ids) {
				const shape = slide.shapes.find((s) => s.id === id);
				if (shape) {
					shape.x += dx;
					shape.y += dy;
				}
			}

			// moveShape pushes a snapshot then sets position — re-setting the same
			// position is a no-op but gives us a clean undo entry for the batch nudge
			const firstShape = slide.shapes.find((s) => s.id === ids[0]);
			if (firstShape) {
				presentationStore.moveShape(
					presentationStore.currentSlide,
					ids[0],
					firstShape.x,
					firstShape.y,
				);
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);
}
