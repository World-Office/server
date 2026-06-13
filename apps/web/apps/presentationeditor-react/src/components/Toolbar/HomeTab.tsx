import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { presentationStore } from "../../stores/PresentationStore";
import { ZOOM_LEVELS } from "../../types/presentation";

const ObservedHomeTab = observer(function ObservedHomeTab() {
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
						onClick={() => presentationStore.cutShape()}
						title="Cut"
						disabled={presentationStore.selectedShapeIds.length === 0}
					>
						Cut
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={() => presentationStore.copyShape()}
						title="Copy"
						disabled={presentationStore.selectedShapeIds.length === 0}
					>
						Copy
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={() => presentationStore.pasteShape()}
						title="Paste"
						disabled={presentationStore.clipboardShapes.length === 0}
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
					<button type="button" className="prese-hometab-btn" title="Bold">
						B
					</button>
					<button type="button" className="prese-hometab-btn" title="Italic">
						I
					</button>
					<button type="button" className="prese-hometab-btn" title="Underline">
						U
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						title="Strikethrough"
					>
						S
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						title="Increase Font Size"
					>
						A+
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						title="Decrease Font Size"
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
						title="Text Color"
					>
						A
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						title="Text Highlight Color"
					>
						Ab
					</button>
				</div>
			</div>

			<div className="prese-hometab-separator" />

			{/* Paragraph */}
			<div className="prese-hometab-group">
				<div className="prese-hometab-elset">
					<button type="button" className="prese-hometab-btn" title="Bullets">
						Bullets
					</button>
					<button type="button" className="prese-hometab-btn" title="Numbering">
						Numbering
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						title="Align Left"
					>
						Align Left
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						title="Align Center"
					>
						Align Center
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						title="Align Right"
					>
						Align Right
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						title="Decrease Indent"
					>
						Decrease Indent
					</button>
					<button
						type="button"
						className="prese-hometab-btn"
						title="Increase Indent"
					>
						Increase Indent
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						title="Line Spacing"
					>
						Line Spacing
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						title="Text Direction"
					>
						Text Direction
					</button>
				</div>
			</div>

			<div className="prese-hometab-separator" />

			{/* Drawing */}
			<div className="prese-hometab-group">
				<div className="prese-hometab-elset">
					<button type="button" className="prese-hometab-btn" title="Shapes">
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
						title="Arrange"
						onClick={() => setArrangeOpen(!arrangeOpen)}
					>
						Arrange ▾
					</button>
					{arrangeOpen && (
						<div
							className="prese-hometab-arrange-dropdown"
							style={{
								position: "absolute",
								top: "100%",
								left: 0,
								zIndex: 2000,
								background: "white",
								border: "1px solid #ccc",
								borderRadius: "4px",
								boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
								minWidth: 140,
								padding: "4px 0",
							}}
						>
							<button
								type="button"
								className="prese-hometab-arrange-item"
								style={{
									display: "block",
									width: "100%",
									padding: "6px 12px",
									border: "none",
									background: "none",
									cursor: "pointer",
									textAlign: "left",
									fontSize: 13,
								}}
								onClick={() => {
									presentationStore.bringForwardSelected();
									setArrangeOpen(false);
								}}
								disabled={presentationStore.selectedShapeIds.length === 0}
							>
								Bring Forward
							</button>
							<button
								type="button"
								className="prese-hometab-arrange-item"
								style={{
									display: "block",
									width: "100%",
									padding: "6px 12px",
									border: "none",
									background: "none",
									cursor: "pointer",
									textAlign: "left",
									fontSize: 13,
								}}
								onClick={() => {
									presentationStore.sendBackwardSelected();
									setArrangeOpen(false);
								}}
								disabled={presentationStore.selectedShapeIds.length === 0}
							>
								Send Backward
							</button>
							<div
								style={{ height: 1, background: "#e0e0e0", margin: "4px 0" }}
							/>
							<button
								type="button"
								className="prese-hometab-arrange-item"
								style={{
									display: "block",
									width: "100%",
									padding: "6px 12px",
									border: "none",
									background: "none",
									cursor: "pointer",
									textAlign: "left",
									fontSize: 13,
								}}
								onClick={() => {
									presentationStore.bringToFrontSelected();
									setArrangeOpen(false);
								}}
								disabled={presentationStore.selectedShapeIds.length === 0}
							>
								Bring to Front
							</button>
							<button
								type="button"
								className="prese-hometab-arrange-item"
								style={{
									display: "block",
									width: "100%",
									padding: "6px 12px",
									border: "none",
									background: "none",
									cursor: "pointer",
									textAlign: "left",
									fontSize: 13,
								}}
								onClick={() => {
									presentationStore.sendToBackSelected();
									setArrangeOpen(false);
								}}
								disabled={presentationStore.selectedShapeIds.length === 0}
							>
								Send to Back
							</button>
							<div
								style={{ height: 1, background: "#e0e0e0", margin: "4px 0" }}
							/>
							{(
								["left", "center", "right", "top", "middle", "bottom"] as const
							).map((align) => (
								<button
									key={align}
									type="button"
									className="prese-hometab-arrange-item"
									style={{
										display: "block",
										width: "100%",
										padding: "6px 12px",
										border: "none",
										background: "none",
										cursor: "pointer",
										textAlign: "left",
										fontSize: 13,
									}}
									onClick={() => {
										presentationStore.alignSelectedShapes(align);
										setArrangeOpen(false);
									}}
									disabled={presentationStore.selectedShapeIds.length === 0}
								>
									Align {align.charAt(0).toUpperCase() + align.slice(1)}
								</button>
							))}
							<div
								style={{ height: 1, background: "#e0e0e0", margin: "4px 0" }}
							/>
							<button
								type="button"
								className="prese-hometab-arrange-item"
								style={{
									display: "block",
									width: "100%",
									padding: "6px 12px",
									border: "none",
									background: "none",
									cursor: "pointer",
									textAlign: "left",
									fontSize: 13,
								}}
								onClick={() => {
									presentationStore.groupSelected();
									setArrangeOpen(false);
								}}
								disabled={presentationStore.selectedShapeIds.length < 2}
							>
								Group
							</button>
							<button
								type="button"
								className="prese-hometab-arrange-item"
								style={{
									display: "block",
									width: "100%",
									padding: "6px 12px",
									border: "none",
									background: "none",
									cursor: "pointer",
									textAlign: "left",
									fontSize: 13,
								}}
								onClick={() => {
									presentationStore.ungroupSelected();
									setArrangeOpen(false);
								}}
								disabled={presentationStore.selectedShapeIds.length === 0}
							>
								Ungroup
							</button>
						</div>
					)}
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						title="Quick Styles"
					>
						Quick Styles
					</button>
				</div>
				<div className="prese-hometab-elset">
					<button
						type="button"
						className="prese-hometab-btn"
						onClick={() => presentationStore.selectAllShapes()}
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
						onClick={() => presentationStore.startPresentation()}
						title="Start Slide Show (F5)"
					>
						▶ Start Slide Show
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
