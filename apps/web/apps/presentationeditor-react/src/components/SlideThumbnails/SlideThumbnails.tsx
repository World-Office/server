import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { presentationStore } from "../../stores/PresentationStore";

const ObservedSlideThumbnails = observer(
	function ObservedSlideThumbnails(): JSX.Element {
		const { slides, currentSlide } = presentationStore;

		const handleAddSlide = () => {
			presentationStore.addSlide();
		};

		const handleDeleteSlide = () => {
			presentationStore.deleteSlide(currentSlide);
		};

		const handleDuplicateSlide = () => {
			presentationStore.duplicateSlide(currentSlide);
		};

		return (
			<div className="prese-slide-thumbnails">
				<div className="prese-slide-thumbnails-header">
					<span className="prese-slide-thumbnails-title">Slides</span>
					<div className="prese-slide-thumbnails-actions">
						<button
							type="button"
							className="prese-slide-thumb-btn"
							onClick={handleAddSlide}
							title="Add slide"
							aria-label="Add slide"
						>
							+
						</button>
						<button
							type="button"
							className="prese-slide-thumb-btn"
							onClick={handleDuplicateSlide}
							disabled={slides.length === 0}
							title="Duplicate slide"
							aria-label="Duplicate slide"
						>
							⊞
						</button>
						<button
							type="button"
							className="prese-slide-thumb-btn"
							onClick={handleDeleteSlide}
							disabled={slides.length <= 1}
							title="Delete slide"
							aria-label="Delete slide"
						>
							−
						</button>
					</div>
				</div>

				<div className="prese-slide-thumbnails-list">
					{slides.map((slide, index) => (
						<button
							type="button"
							key={slide.id}
							className={`prese-slide-thumb-item ${index === currentSlide ? "active" : ""}`}
							onClick={() => presentationStore.setCurrentSlide(index)}
							aria-label={`Slide ${index + 1}: ${slide.title || "Untitled"}`}
						>
							<div className="prese-slide-thumb-preview">
								<div className="prese-slide-thumb-label">{index + 1}</div>
								{slide.transitionEffect &&
									slide.transitionEffect !== "none" && (
										<span
											className="prese-slide-thumb-transition"
											title={`Transition: ${slide.transitionEffect}`}
											aria-label={`Transition: ${slide.transitionEffect}`}
										>
											✦
										</span>
									)}
							</div>
							<div className="prese-slide-thumb-title">
								{slide.title || `Slide ${index + 1}`}
							</div>
						</button>
					))}
				</div>
			</div>
		);
	},
);

export const SlideThumbnails = ObservedSlideThumbnails;
