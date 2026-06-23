import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";

function ZoomControls(): JSX.Element {
	return (
		<>
			<div className="se-statusbar-separator" />
			<button
				type="button"
				className={`se-statusbar-btn${spreadsheetStore.fitToPage ? " active" : ""}`}
				title="Fit to page"
				onClick={() =>
					spreadsheetStore.setFitToPage(!spreadsheetStore.fitToPage)
				}
			>
				⊞
			</button>
			<button
				type="button"
				className={`se-statusbar-btn${spreadsheetStore.fitToWidth ? " active" : ""}`}
				title="Fit to width"
				onClick={() =>
					spreadsheetStore.setFitToWidth(!spreadsheetStore.fitToWidth)
				}
			>
				⇔
			</button>
			<button
				type="button"
				className="se-statusbar-btn"
				title="Zoom Out"
				onClick={() => spreadsheetStore.zoomOut()}
			>
				−
			</button>
			<div className="se-statusbar-zoom-label">
				<span className="se-statusbar-label">{`${spreadsheetStore.zoomLevel}%`}</span>
			</div>
			<button
				type="button"
				className="se-statusbar-btn"
				title="Zoom In"
				onClick={() => spreadsheetStore.zoomIn()}
			>
				+
			</button>
		</>
	);
}

const ObservedStatusBar = observer(function ObservedStatusBar(): JSX.Element {
	const {
		sheets,
		activeSheetIndex,
		filteredCount,
		showStatistics,
		activeStatistics,
		languageCode,
	} = spreadsheetStore;

	return (
		<div className="se-statusbar">
			{/* Sheet navigation */}
			<div className="se-statusbar-sheet-nav">
				<button
					type="button"
					className="se-statusbar-btn"
					title="Previous sheet"
					disabled={activeSheetIndex <= 0}
					onClick={() =>
						spreadsheetStore.setActiveSheetIndex(
							Math.max(0, activeSheetIndex - 1),
						)
					}
				>
					‹
				</button>
				<div className="se-statusbar-sheet-dropdown">
					<select
						className="se-statusbar-select"
						value={activeSheetIndex}
						onChange={(e) =>
							spreadsheetStore.setActiveSheetIndex(Number(e.target.value))
						}
						aria-label="Active sheet"
					>
						{sheets.map((sheet) => (
							<option key={sheet.index} value={sheet.index}>
								{sheet.name}
							</option>
						))}
					</select>
				</div>
				<button
					type="button"
					className="se-statusbar-btn"
					title="Add sheet"
					onClick={() => spreadsheetStore.addSheet("Sheet")}
				>
					+
				</button>
			</div>

			{/* Sheet tab bar */}
			<div className="se-statusbar-sheet-tabs">
				{sheets.map((sheet) => (
					<div
						key={sheet.index}
						className={`se-statusbar-sheet-tab${sheet.active ? " active" : ""}`}
						onClick={() => spreadsheetStore.setActiveSheetIndex(sheet.index)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								spreadsheetStore.setActiveSheetIndex(sheet.index);
							}
						}}
						role="tab"
						tabIndex={0}
					>
						{sheet.name}
					</div>
				))}
			</div>

			<div className="se-statusbar-separator" />

			{/* Statistics display */}
			{showStatistics && (
				<div className="se-statusbar-tools">
					<button
						type="button"
						className={`se-statusbar-btn${activeStatistics.has("average") ? " active" : ""}`}
						title="Average"
						onClick={() => spreadsheetStore.toggleStatistics("average")}
					>
						Avg
					</button>
					<button
						type="button"
						className={`se-statusbar-btn${activeStatistics.has("count") ? " active" : ""}`}
						title="Count"
						onClick={() => spreadsheetStore.toggleStatistics("count")}
					>
						Count
					</button>
					<button
						type="button"
						className={`se-statusbar-btn${activeStatistics.has("min") ? " active" : ""}`}
						title="Min"
						onClick={() => spreadsheetStore.toggleStatistics("min")}
					>
						Min
					</button>
					<button
						type="button"
						className={`se-statusbar-btn${activeStatistics.has("max") ? " active" : ""}`}
						title="Max"
						onClick={() => spreadsheetStore.toggleStatistics("max")}
					>
						Max
					</button>
					<button
						type="button"
						className={`se-statusbar-btn${activeStatistics.has("sum") ? " active" : ""}`}
						title="Sum"
						onClick={() => spreadsheetStore.toggleStatistics("sum")}
					>
						Sum
					</button>
				</div>
			)}

			{/* Filtered records indicator */}
			{filteredCount > 0 && (
				<>
					<div className="se-statusbar-separator" />
					<div className="se-statusbar-tools">
						<span className="se-statusbar-label">{`${filteredCount} of ${spreadsheetStore.sheets.length * 100} records found`}</span>
					</div>
				</>
			)}

			<div className="se-statusbar-separator" />

			{/* Language selector */}
			<div className="se-statusbar-tools">
				<select
					className="se-statusbar-select"
					value={languageCode}
					onChange={(e) => spreadsheetStore.setLanguageCode(e.target.value)}
					aria-label="Language"
				>
					<option value="en-US">English (US)</option>
					<option value="es-ES">Spanish (ES)</option>
					<option value="fr-FR">French (FR)</option>
					<option value="de-DE">German (DE)</option>
					<option value="it-IT">Italian (IT)</option>
					<option value="pt-BR">Portuguese (PT)</option>
					<option value="ru-RU">Russian (RU)</option>
					<option value="zh-CN">Chinese (ZH)</option>
					<option value="ja-JP">Japanese (JA)</option>
				</select>
			</div>

			{/* Zoom controls */}
			<div className="se-statusbar-zoom-box">
				<ZoomControls />
			</div>
		</div>
	);
});

export { ObservedStatusBar as StatusBar };
