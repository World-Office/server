import { observer } from "mobx-react-lite";
import { BUILTIN_THEME_PRESETS } from "../../lib/themes";
import { presentationStore } from "../../stores/PresentationStore";
import type { ThemePreset } from "../../types/presentation";

const ObservedDesignTab = observer(function ObservedDesignTab() {
	const { theme, setTheme, slideSize, setSlideSize, slides, currentSlide } = presentationStore;
	const slide = slides[currentSlide];
	const bg = slide?.background;

	const handleThemeSelect = (preset: ThemePreset) => {
		setTheme({
			name: preset.name,
			colorScheme: preset.colorScheme,
			fontScheme: preset.fontScheme,
			formatScheme: undefined,
		});
	};

	const isThemeActive = (preset: ThemePreset) => {
		return theme.name === preset.name;
	};

	return (
		<section
			className="prese-designtab-panel"
			data-tab="design"
			role="tabpanel"
			aria-labelledby="design"
		>
			<div className="prese-designtab-group">
				<div className="prese-designtab-elset">
					<span className="prese-designtab-label">Themes</span>
				</div>
				<div className="prese-designtab-elset">
					{BUILTIN_THEME_PRESETS.map((preset) => (
						<button
							key={preset.name}
							type="button"
							className={`prese-designtab-btn ${isThemeActive(preset) ? "active" : ""}`}
							title={`${preset.name}: ${preset.description}`}
							onClick={() => handleThemeSelect(preset)}
							style={{
								backgroundColor: slideSize === preset.name ? "" : "",
								border: isThemeActive(preset)
									? "2px solid var(--wo-prese-accent)"
									: "1px solid transparent",
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "8px",
									padding: "4px 8px",
								}}
							>
								<div
									style={{
										width: "24px",
										height: "24px",
										backgroundColor: `#${preset.colorScheme.colors.find((c) => c.name === "accent1")?.color || "4472C4"}`,
										borderRadius: "4px",
									}}
								/>
								<span>{preset.name}</span>
							</div>
						</button>
					))}
				</div>
			</div>

			<div className="prese-designtab-separator" />

			{/* Slide Background */}
			<div className="prese-designtab-group">
				<div className="prese-designtab-elset">
					<span className="prese-designtab-label">Background</span>
				</div>
				<div className="prese-designtab-elset">
					{(["none", "solid", "gradient"] as const).map((type) => (
						<button
							key={type}
							type="button"
							className={`prese-designtab-btn ${bg?.type === type ? "active" : ""}`}
							onClick={() => {
								presentationStore.setSlideBackground(currentSlide, {
									type,
									color: type === "solid" ? "#ffffff" : undefined,
									...(type === "gradient"
										? {
												gradientStops: [
													{ position: 0, color: "#ffffff" },
													{ position: 1, color: "#4472C4" },
												],
												gradientAngle: 0,
											}
										: {}),
								});
							}}
						>
							{type === "none" ? "None" : type === "solid" ? "Solid" : "Gradient"}
						</button>
					))}
					{slide?.background?.type !== undefined && slide.background.type !== "none" && (
						<button
							type="button"
							className="prese-designtab-btn"
							onClick={() => presentationStore.setSlideBackground(currentSlide, undefined)}
						>
							Reset
						</button>
					)}
				</div>
				{bg?.type === "solid" && (
					<div className="prese-designtab-elset">
						<label className="prese-designtab-label" style={{ fontSize: "12px" }}>
							Color
						</label>
						<input
							type="color"
							value={bg.color || "#ffffff"}
							onChange={(e) =>
								presentationStore.setSlideBackground(currentSlide, {
									type: "solid",
									color: e.target.value,
								})
							}
							style={{ width: "36px", height: "28px", padding: 0, border: "none", cursor: "pointer" }}
						/>
					</div>
				)}
				{bg?.type === "gradient" && (
					<>
						<div className="prese-designtab-elset">
							<label className="prese-designtab-label" style={{ fontSize: "12px" }}>
								Start Color
							</label>
							<input
								type="color"
								value={bg.gradientStops?.[0]?.color || "#ffffff"}
								onChange={(e) =>
									presentationStore.setSlideBackground(currentSlide, {
										type: "gradient",
										gradientStops: [
											{ position: 0, color: e.target.value },
											bg.gradientStops?.[1] || { position: 1, color: "#4472C4" },
										],
										gradientAngle: bg.gradientAngle ?? 0,
									})
								}
								style={{ width: "36px", height: "28px", padding: 0, border: "none", cursor: "pointer" }}
							/>
							<label className="prese-designtab-label" style={{ fontSize: "12px", marginLeft: "8px" }}>
								End Color
							</label>
							<input
								type="color"
								value={bg.gradientStops?.[1]?.color || "#4472C4"}
								onChange={(e) =>
									presentationStore.setSlideBackground(currentSlide, {
										type: "gradient",
										gradientStops: [
											bg.gradientStops?.[0] || { position: 0, color: "#ffffff" },
											{ position: 1, color: e.target.value },
										],
										gradientAngle: bg.gradientAngle ?? 0,
									})
								}
								style={{ width: "36px", height: "28px", padding: 0, border: "none", cursor: "pointer" }}
							/>
						</div>
						<div className="prese-designtab-elset">
							<label className="prese-designtab-label" style={{ fontSize: "12px" }}>
								Angle: {bg.gradientAngle ?? 0}°
							</label>
							<input
								type="range"
								min={0}
								max={360}
								value={bg.gradientAngle ?? 0}
								onChange={(e) =>
									presentationStore.setSlideBackground(currentSlide, {
										type: "gradient",
										gradientStops: bg.gradientStops || [
											{ position: 0, color: "#ffffff" },
											{ position: 1, color: "#4472C4" },
										],
										gradientAngle: Number(e.target.value),
									})
								}
								style={{ width: "120px" }}
							/>
						</div>
					</>
				)}
			</div>

			<div className="prese-designtab-separator" />

			{/* Slide Size */}
			<div className="prese-designtab-group">
				<div className="prese-designtab-elset">
					<span className="prese-designtab-label">Slide Size</span>
				</div>
				<div className="prese-designtab-elset">
					<button
						type="button"
						className={`prese-designtab-btn ${slideSize === "standard" ? "active" : ""}`}
						title="Standard (4:3)"
						onClick={() => setSlideSize("standard")}
					>
						Standard (4:3)
					</button>
				</div>
				<div className="prese-designtab-elset">
					<button
						type="button"
						className={`prese-designtab-btn ${slideSize === "widescreen" ? "active" : ""}`}
						title="Widescreen (16:9)"
						onClick={() => setSlideSize("widescreen")}
					>
						Widescreen (16:9)
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedDesignTab as DesignTab };
