import { Copy } from "lucide-react";
import { observer } from "mobx-react-lite";
import { presentationStore } from "../../stores/PresentationStore";
import type { TransitionEffect } from "../../types/presentation";

function TransitionBtn({
	active,
	title,
	onClick,
	children,
}: {
	active: boolean;
	title: string;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			className={`prese-transitionstab-btn${active ? " active" : ""}`}
			title={title}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

const ObservedTransitionsTab = observer(function ObservedTransitionsTab() {
	const {
		currentSlide,
		transitionDuration,
		transitionSoundEnabled,
		advanceMode,
		advanceTiming,
	} = presentationStore;
	const trans = presentationStore.getEffectiveTransition(currentSlide);
	const activeEffect = trans.effect;

	const durationOpts: { label: string; value: number; title: string }[] = [
		{ label: "Very Fast", value: 0.1, title: "Very Fast (0.1s)" },
		{ label: "Fast", value: 0.25, title: "Fast (0.25s)" },
		{ label: "Normal", value: 0.5, title: "Normal (0.5s)" },
		{ label: "Slow", value: 1, title: "Slow (1s)" },
		{ label: "Very Slow", value: 2, title: "Very Slow (2s)" },
	];

	const effects: { label: string; value: TransitionEffect }[] = [
		{ label: "None", value: "none" },
		{ label: "Fade", value: "fade" },
		{ label: "Push", value: "push" },
		{ label: "Wipe", value: "wipe" },
		{ label: "Split", value: "split" },
		{ label: "Reveal", value: "reveal" },
		{ label: "Checker", value: "checker" },
		{ label: "Zoom", value: "zoom" },
		{ label: "Morph", value: "morp" },
		{ label: "Circle", value: "circle" },
		{ label: "Uncover", value: "uncover" },
		{ label: "Cover", value: "cover" },
	];

	const afterTimings = [0, 2, 3, 5, 10];

	return (
		<section
			className="prese-transitionstab-panel"
			data-tab="transitions"
			role="tabpanel"
			aria-labelledby="transitions"
		>
			{/* Transition to This Slide */}
			<div className="prese-transitionstab-group">
				<div className="prese-transitionstab-elset">
					<span className="prese-transitionstab-label">
						Transition to This Slide
					</span>
				</div>
				<div className="prese-transitionstab-elset">
					<TransitionBtn
						active={activeEffect === "none"}
						title="No Transition"
						onClick={() =>
							presentationStore.setSlideTransition(currentSlide, "none")
						}
					>
						None
					</TransitionBtn>
				</div>
			</div>
			<div className="prese-transitiontab-separator" />

			{/* Effect */}
			<div className="prese-transitionstab-group">
				<div className="prese-transitionstab-elset">
					<span className="prese-transitionstab-label">Effect</span>
				</div>
				<div className="prese-transitionstab-elset">
					{effects.slice(1).map((e) => (
						<TransitionBtn
							key={e.value}
							active={activeEffect === e.value}
							title={e.label}
							onClick={() =>
								presentationStore.setSlideTransition(currentSlide, e.value)
							}
						>
							{e.label}
						</TransitionBtn>
					))}
				</div>
			</div>

			<div className="prese-transitiontab-separator" />

			{/* Duration */}
			<div className="prese-transitionstab-group">
				<div className="prese-transitionstab-elset">
					<span className="prese-transitionstab-label">Duration</span>
				</div>
				<div className="prese-transitionstab-elset">
					{durationOpts.map((d) => (
						<TransitionBtn
							key={d.value}
							active={transitionDuration === d.value}
							title={d.title}
							onClick={() => presentationStore.setTransitionDuration(d.value)}
						>
							{d.label}
						</TransitionBtn>
					))}
				</div>
			</div>

			<div className="prese-transitiontab-separator" />

			{/* Sound */}
			<div className="prese-transitionstab-group">
				<div className="prese-transitionstab-elset">
					<span className="prese-transitionstab-label">Sound</span>
				</div>
				<div className="prese-transitionstab-elset">
					<TransitionBtn
						active={!transitionSoundEnabled}
						title="No Sound"
						onClick={() => presentationStore.setTransitionSoundEnabled(false)}
					>
						No Sound
					</TransitionBtn>
					<TransitionBtn
						active={transitionSoundEnabled}
						title="Sound"
						onClick={() => presentationStore.setTransitionSoundEnabled(true)}
					>
						Sound
					</TransitionBtn>
				</div>
			</div>

			<div className="prese-transitiontab-separator" />

			{/* Advance Slide */}
			<div className="prese-transitionstab-group">
				<div className="prese-transitionstab-elset">
					<span className="prese-transitionstab-label">Advance Slide</span>
				</div>
				<div className="prese-transitionstab-elset">
					<TransitionBtn
						active={advanceMode === "click"}
						title="On Mouse Click"
						onClick={() => presentationStore.setAdvanceMode("click")}
					>
						On Mouse Click
					</TransitionBtn>
					<TransitionBtn
						active={advanceMode === "after"}
						title="After"
						onClick={() => presentationStore.setAdvanceMode("after")}
					>
						After
					</TransitionBtn>
				</div>
				<div className="prese-transitionstab-elset">
					{afterTimings.map((t) => (
						<TransitionBtn
							key={t}
							active={advanceMode === "after" && advanceTiming === t}
							title={`After (${t}s)`}
							onClick={() => {
								presentationStore.setAdvanceMode("after");
								presentationStore.setAdvanceTiming(t);
							}}
						>
							{t}s
						</TransitionBtn>
					))}
				</div>
			</div>

			<div className="prese-transitiontab-separator" />

			{/* Apply to All */}
			<div className="prese-transitionstab-group">
				<div className="prese-transitionstab-elset">
					<button
						type="button"
						className="prese-transitionstab-btn"
						title="Apply to All Slides"
						onClick={() => presentationStore.applyTransitionToAll()}
					>
						<Copy size={18} />
						Apply to All
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedTransitionsTab as TransitionsTab };
