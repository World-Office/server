import { ArrowDown, ArrowUp, Play, Sparkles } from "lucide-react";
import { observer } from "mobx-react-lite";
import { presentationStore } from "../../stores/PresentationStore";
import type {
	AnimationCategory,
	AnimationEffect,
	StartAnimation,
} from "../../types/presentation";

const CATEGORIES: { key: AnimationCategory; label: string }[] = [
	{ key: "none", label: "None" },
	{ key: "entrance", label: "Entrance" },
	{ key: "emphasis", label: "Emphasis" },
	{ key: "exit", label: "Exit" },
	{ key: "motion", label: "Motion Paths" },
];

const STARTS: { key: StartAnimation; label: string }[] = [
	{ key: "onClick", label: "Start: On Click" },
	{ key: "withPrevious", label: "Start: With Previous" },
	{ key: "afterPrevious", label: "Start: After Previous" },
];

const DURATIONS: { value: number; label: string }[] = [
	{ value: 0.5, label: "Fast" },
	{ value: 1, label: "Normal" },
	{ value: 2, label: "Slow" },
	{ value: 5, label: "Very Slow" },
];

const DELAYS: { value: number; label: string }[] = [
	{ value: 0, label: "0s" },
	{ value: 0.25, label: "0.25s" },
	{ value: 0.5, label: "0.5s" },
	{ value: 1, label: "1s" },
];

const CATEGORY_EFFECTS: Record<AnimationCategory, AnimationEffect> = {
	none: "none",
	entrance: "fade",
	emphasis: "growAndTurn",
	exit: "fade",
	motion: "path",
};

const ObservedAnimationTab = observer(function ObservedAnimationTab() {
	const {
		animationCategory,
		animationStart,
		animationDuration,
		animationDelay,
		currentSlide,
		slides,
		isPreviewPlaying,
		setAnimationCategory,
		setAnimationEffect,
		setAnimationStart,
		setAnimationDuration,
		setAnimationDelay,
		addAnimation,
		moveAnimationEarlier,
		moveAnimationLater,
		startPreview,
		stopPreview,
	} = presentationStore;

	const slideAnims = slides[currentSlide]?.animations ?? [];
	const hasAnimations = slideAnims.length > 0;

	const handleCategoryClick = (cat: AnimationCategory) => {
		setAnimationCategory(cat);
		if (cat !== "none") {
			const effect = CATEGORY_EFFECTS[cat];
			setAnimationEffect(effect);
			addAnimation(currentSlide, effect, cat);
		}
	};

	const handleStartClick = (start: StartAnimation) => {
		setAnimationStart(start);
		if (hasAnimations && slideAnims.length > 0) {
			const lastIdx = slideAnims.length - 1;
			presentationStore.updateAnimationTiming(
				currentSlide,
				slideAnims[lastIdx].id,
				start,
				animationDuration,
				animationDelay,
			);
		}
	};

	const handleDurationClick = (duration: number) => {
		setAnimationDuration(duration);
		if (hasAnimations && slideAnims.length > 0) {
			const lastIdx = slideAnims.length - 1;
			presentationStore.updateAnimationTiming(
				currentSlide,
				slideAnims[lastIdx].id,
				animationStart,
				duration,
				animationDelay,
			);
		}
	};

	const handleDelayClick = (delay: number) => {
		setAnimationDelay(delay);
		if (hasAnimations && slideAnims.length > 0) {
			const lastIdx = slideAnims.length - 1;
			presentationStore.updateAnimationTiming(
				currentSlide,
				slideAnims[lastIdx].id,
				animationStart,
				animationDuration,
				delay,
			);
		}
	};

	return (
		<section
			className="prese-animationtab-panel"
			data-tab="animation"
			role="tabpanel"
			aria-labelledby="animation"
		>
			<div className="prese-animationtab-group">
				<div className="prese-animationtab-elset">
					<span className="prese-animationtab-label">Animations</span>
				</div>
				{CATEGORIES.map((cat) => (
					<div key={cat.key} className="prese-animationtab-elset">
						<button
							type="button"
							className={`prese-animationtab-btn${animationCategory === cat.key ? " active" : ""}`}
							title={cat.label}
							onClick={() => handleCategoryClick(cat.key)}
						>
							<Sparkles size={18} />
							{cat.label}
						</button>
					</div>
				))}
			</div>

			<div className="prese-animationtab-separator" />

			{hasAnimations && (
				<>
					<div className="prese-animationtab-group">
						<div className="prese-animationtab-elset">
							<span className="prese-animationtab-label">Preview</span>
						</div>
						<div className="prese-animationtab-elset">
							<button
								type="button"
								className={`prese-animationtab-btn${isPreviewPlaying ? " active" : ""}`}
								title={isPreviewPlaying ? "Stop Preview" : "Preview Animation"}
								onClick={() =>
									isPreviewPlaying ? stopPreview() : startPreview()
								}
							>
								<Play size={18} />
								{isPreviewPlaying ? "Stop" : "Preview"}
							</button>
						</div>
					</div>

					<div className="prese-animationtab-separator" />
				</>
			)}

			<div className="prese-animationtab-group">
				<div className="prese-animationtab-elset">
					<span className="prese-animationtab-label">Advanced Animation</span>
				</div>
				<div className="prese-animationtab-elset">
					<button
						type="button"
						className="prese-animationtab-btn"
						title="Animation Pane"
						onClick={() => presentationStore.setActiveRightPanel("animation")}
					>
						<Sparkles size={18} />
						Animation Pane
					</button>
				</div>
			</div>

			<div className="prese-animationtab-separator" />

			<div className="prese-animationtab-group">
				<div className="prese-animationtab-elset">
					<span className="prese-animationtab-label">Timing</span>
				</div>
				{STARTS.map((s) => (
					<div key={s.key} className="prese-animationtab-elset">
						<button
							type="button"
							className={`prese-animationtab-btn${animationStart === s.key ? " active" : ""}`}
							title={s.label}
							onClick={() => handleStartClick(s.key)}
						>
							{s.label}
						</button>
					</div>
				))}
			</div>

			<div className="prese-animationtab-separator" />

			<div className="prese-animationtab-group">
				<div className="prese-animationtab-elset">
					<span className="prese-animationtab-label">Duration</span>
				</div>
				<div className="prese-animationtab-elset">
					{DURATIONS.map((d) => (
						<button
							key={d.value}
							type="button"
							className={`prese-animationtab-btn${animationDuration === d.value ? " active" : ""}`}
							title={`${d.label} (${d.value}s)`}
							onClick={() => handleDurationClick(d.value)}
						>
							{d.label}
						</button>
					))}
				</div>
			</div>

			<div className="prese-animationtab-separator" />

			<div className="prese-animationtab-group">
				<div className="prese-animationtab-elset">
					<span className="prese-animationtab-label">Delay</span>
				</div>
				<div className="prese-animationtab-elset">
					{DELAYS.map((d) => (
						<button
							key={d.value}
							type="button"
							className={`prese-animationtab-btn${animationDelay === d.value ? " active" : ""}`}
							title={`${d.label}`}
							onClick={() => handleDelayClick(d.value)}
						>
							{d.label}
						</button>
					))}
				</div>
			</div>

			{hasAnimations && (
				<>
					<div className="prese-animationtab-separator" />
					<div className="prese-animationtab-group">
						<div className="prese-animationtab-elset">
							<span className="prese-animationtab-label">Reorder</span>
						</div>
						<div className="prese-animationtab-elset">
							<button
								type="button"
								className="prese-animationtab-btn"
								title="Move Earlier"
								onClick={() =>
									moveAnimationEarlier(currentSlide, slideAnims.length - 1)
								}
							>
								<ArrowUp size={18} />
								Move Earlier
							</button>
						</div>
						<div className="prese-animationtab-elset">
							<button
								type="button"
								className="prese-animationtab-btn"
								title="Move Later"
								onClick={() => moveAnimationLater(currentSlide, 0)}
							>
								<ArrowDown size={18} />
								Move Later
							</button>
						</div>
					</div>
				</>
			)}
		</section>
	);
});

export { ObservedAnimationTab as AnimationTab };
