import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { presentationStore } from "../stores/PresentationStore";
import { SlideCanvas } from "./SlideCanvas";

const ObservedDocumentHolder = observer(
	function ObservedDocumentHolder(): JSX.Element {
		const { currentSlide, totalSlides } = presentationStore;
		const canPrev = currentSlide > 0;
		const canNext = currentSlide < totalSlides - 1;

		return (
			<div className="prese-document-holder">
				<SlideCanvas />
				<div className="prese-slide-nav">
					<button
						type="button"
						className="prese-slide-nav-btn"
						disabled={!canPrev}
						onClick={() => presentationStore.setCurrentSlide(currentSlide - 1)}
						aria-label="Previous slide"
					>
						‹ Prev
					</button>
					<span className="prese-slide-nav-label">
						Slide {currentSlide + 1} of {totalSlides}
					</span>
					<button
						type="button"
						className="prese-slide-nav-btn"
						disabled={!canNext}
						onClick={() => presentationStore.setCurrentSlide(currentSlide + 1)}
						aria-label="Next slide"
					>
						Next ›
					</button>
				</div>
			</div>
		);
	},
);

export const DocumentHolder = ObservedDocumentHolder;
