import { useEffect } from "react";
import { presentationStore } from "../stores/PresentationStore";

export function useKeyboardShortcuts(): void {
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent): void {
			const { currentSlide, totalSlides } = presentationStore;
			const isCtrl = e.ctrlKey || e.metaKey;

			if (isCtrl) {
				if (e.key === "s" || e.key === "S") {
					if (!e.shiftKey) {
						e.preventDefault();
						presentationStore.save();
					}
					return;
				}
				if (e.key === "z" || e.key === "Z") {
					if (e.shiftKey) {
						e.preventDefault();
						presentationStore.redo();
					} else {
						e.preventDefault();
						presentationStore.undo();
					}
					return;
				}
				if (e.key === "=" || e.key === "+") {
					e.preventDefault();
					presentationStore.zoomIn();
					return;
				}
				if (e.key === "-") {
					e.preventDefault();
					presentationStore.zoomOut();
					return;
				}
				if (e.key === "0") {
					e.preventDefault();
					presentationStore.setZoomLevel(100);
					return;
				}
				if (e.key === "n" || e.key === "N") {
					e.preventDefault();
					presentationStore.addSlide();
					return;
				}
				if (e.key === "a" || e.key === "A") {
					e.preventDefault();
					presentationStore.selectAllShapes();
					return;
				}
			}

			if (e.key === "F5" && !presentationStore.isPresenting) {
				e.preventDefault();
				presentationStore.startPresentation();
				return;
			}

			if (e.key === "F5" && presentationStore.isPresenting) {
				e.preventDefault();
				return;
			}

			if (e.key === "Escape" && presentationStore.isPresenting) {
				return; // handled by SlidePresenter
			}

			switch (e.key) {
				case "ArrowLeft":
				case "PageUp":
					if (presentationStore.isPresenting) return; // handled by SlidePresenter
					// Don't slide-navigate when shapes are selected — shape nudge takes priority
					if (presentationStore.selectedShapeIds.length > 0) return;
					e.preventDefault();
					if (currentSlide > 0)
						presentationStore.setCurrentSlide(currentSlide - 1);
					break;
				case "ArrowRight":
				case "PageDown":
					// Don't slide-navigate when shapes are selected — shape nudge takes priority
					if (presentationStore.selectedShapeIds.length > 0) return;
					e.preventDefault();
					if (currentSlide < totalSlides - 1)
						presentationStore.setCurrentSlide(currentSlide + 1);
					break;
				case "Home":
					e.preventDefault();
					presentationStore.setCurrentSlide(0);
					break;
				case "End":
					e.preventDefault();
					presentationStore.setCurrentSlide(totalSlides - 1);
					break;
				case "Delete":
				case "Backspace": {
					if (presentationStore.selectedShapeIds.length > 0) {
						e.preventDefault();
						presentationStore.removeSelectedShapes();
					} else {
						e.preventDefault();
						presentationStore.deleteSlide(currentSlide);
					}
					break;
				}
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);
}
