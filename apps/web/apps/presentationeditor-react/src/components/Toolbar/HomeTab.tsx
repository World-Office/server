import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { presentationStore } from "../../stores/PresentationStore";
import { ZOOM_LEVELS } from "../../types/presentation";
import type { MonacoCommand } from "./MonacoCommand";

interface HomeTabProps {
	onMonacoCommand: (command: MonacoCommand) => void;
}

const ObservedHomeTab = observer(function ObservedHomeTab({
	onMonacoCommand,
}: HomeTabProps) {
	const [arrangeOpen, setArrangeOpen] = useState(false);
	const arrangeRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!arrangeOpen) return;
		const handler = (e: MouseEvent) => {
			if (
				arrangeRef.current &&
				!arrangeRef.current.contains(e.target as Node)
			) {
				setArrangeOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [arrangeOpen]);
	function goToFirstSlide() {
		presentationStore.setCurrentSlide(0);
	}

	function goToPrevSlide() {
		presentationStore.setCurrentSlide(
			Math.max(0, presentationStore.currentSlide - 1),
		);
	}

	function goToNextSlide() {
		presentationStore.setCurrentSlide(
			Math.min(
				presentationStore.totalSlides - 1,
				presentationStore.currentSlide + 1,
			),
		);
	}

	function goToLastSlide() {
		presentationStore.setCurrentSlide(presentationStore.totalSlides - 1);
	}

	return (
		<section
			className="prese-hometab-panel"
			data-tab="home"
			role="tabpanel"
			aria-labelledby="home"
		>
			{/* Clipboard */}
			<div className="prese-hometab-group">
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={() => onMonacoCommand("cut")}
						title="Cut"
					>
						Cut
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={() => onMonacoCommand("copy")}
						title="Copy"
					>
						Copy
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={() => onMonacoCommand("paste")}
						title="Paste"
					>
						Paste
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={() => {}}
						title="Format Painter"
					>
						Format Painter
					</button>
				</div>
			</div>

			<div className="prese-hometab-separator" />

			{/* Slides */}
			<div className="prese-hometab-group">
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={goToFirstSlide}
						title="First Slide"
					>
						First
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={goToPrevSlide}
						title="Previous Slide"
					>
						Previous
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={goToNextSlide}
						title="Next Slide"
					>
						Next
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={goToLastSlide}
						title="Last Slide"
					>
						Last
					</button>
				</div>
				<div className="prese-hometab-elset">
					<span className="prese-hometab-label">
						Slide {presentationStore.currentSlide + 1} of{" "}
						{presentationStore.totalSlides}
					</span>
				</div>
				<div className="prese-hometab-elset">
					<button type="button" className="prese-hometab-btn" title="New Slide">
						New Slide
					</button>
				</div>
			</div>

			<div className="prese-hometab-separator" />

			{/* Font */}
			<div className="prese-hometab-group">
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Bold (not available in code editor)"
					>
						B
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Italic (not available in code editor)"
					>
						I
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Underline (not available in code editor)"
					>
						U
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Strikethrough (not available in code editor)"
					>
						S
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Increase Font Size (not available in code editor)"
					>
						A+
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Decrease Font Size (not available in code editor)"
					>
						A-
					</button>
				</div>
				<div className="prese-hometab-elset">
					<span className="prese-hometab-label">Font Size</span>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Text Color (not available in code editor)"
					>
						A
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Text Highlight Color (not available in code editor)"
					>
						Ab
					</button>
				</div>
			</div>

			<div className="prese-hometab-separator" />

			{/* Paragraph */}
			<div className="prese-hometab-group">
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Bullets (not available in code editor)"
					>
						Bullets
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Numbering (not available in code editor)"
					>
						Numbering
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Align Left (not available in code editor)"
					>
						Align Left
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Align Center (not available in code editor)"
					>
						Align Center
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Align Right (not available in code editor)"
					>
						Align Right
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Align Top (not available in code editor)"
					>
						Align Top
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Align Middle (not available in code editor)"
					>
						Align Middle
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Align Bottom (not available in code editor)"
					>
						Align Bottom
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Distribute Horizontally (not available in code editor)"
					>
						Distribute H
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Distribute Vertically (not available in code editor)"
					>
						Distribute V
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Decrease Indent (not available in code editor)"
					>
						Decrease Indent
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Increase Indent (not available in code editor)"
					>
						Increase Indent
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Line Spacing (not available in code editor)"
					>
						Line Spacing
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Text Direction (not available in code editor)"
					>
						Text Direction
					</button>
				</div>
			</div>

			<div className="prese-hometab-separator" />

			{/* Drawing */}
			<div className="prese-hometab-group">
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Shapes (not available in code editor)"
					>
						Shapes
					</button>
				</div>
				<div
					className="prese-hometab-elset"
					ref={arrangeRef}
					style={{ position: "relative" }}
				>
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Arrange (not available in code editor)"
					>
						Arrange ▾
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Quick Styles (not available in code editor)"
					>
						Quick Styles
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={() => onMonacoCommand("selectAll")}
						title="Select All (Ctrl+A)"
					>
						Select All
					</button>
				</div>
			</div>

			<div className="prese-hometab-group">
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						disabled
						title="Start Slide Show (not available in code editor)"
					>
						▶ Start Slide Show
					</button>
				</div>
			</div>

			<div className="prese-hometab-separator" />

			{/* Editing */}
			<div className="prese-hometab-group">
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={() => onMonacoCommand("find")}
						title="Find"
					>
						Find
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={() => onMonacoCommand("replace")}
						title="Replace"
					>
						Replace
					</button>
				</div>
			</div>

			<div className="prese-hometab-separator" />

			{/* Zoom */}
			<div className="prese-hometab-group">
				<div className="prese-hometab-elset">
					<select
						className="prese-hometab-zoom-select"
						value={presentationStore.zoomLevel}
						onChange={(e) =>
							presentationStore.setZoomLevel(Number(e.target.value))
						}
						aria-label="Zoom"
					>
						{ZOOM_LEVELS.map((level) => (
							<option key={level} value={level}>{`${level}%`}</option>
						))}
					</select>
				</div>
				<div className="prese-hometab-elset">
					<span className="prese-hometab-label">Zoom</span>
				</div>
			</div>

			<div className="prese-hometab-group">
				<div className="prese-hometab-elset">
					<button
						type="button"
						className={`prese-hometab-btn${presentationStore.fitToPage ? " active" : ""}`}
						onClick={() =>
							presentationStore.setFitToPage(!presentationStore.fitToPage)
						}
						title="Fit to Page"
					>
						Fit to Page
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className={`prese-hometab-btn${presentationStore.fitToWidth ? " active" : ""}`}
						onClick={() =>
							presentationStore.setFitToWidth(!presentationStore.fitToWidth)
						}
						title="Fit to Width"
					>
						Fit to Width
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedHomeTab as HomeTab };
