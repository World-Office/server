import { observer } from "mobx-react-lite";
import { BUILTIN_THEME_PRESETS } from "../../lib/themes";
import { presentationStore } from "../../stores/PresentationStore";
import type { ThemePreset } from "../../types/presentation";

const ObservedDesignTab = observer(function ObservedDesignTab() {
	const { theme, setTheme, slideSize, setSlideSize } = presentationStore;

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
