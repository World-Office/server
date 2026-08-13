import { observer } from "mobx-react-lite";
import { useCallback } from "react";
import { presentationStore } from "../../stores/PresentationStore";
import type { AnimationData } from "../../types/presentation";

/**
 * Dispatch a slide command through the FC-4 command router.
 * These commands will eventually be translated to ModelOp and sent to apply_op (SL-6).
 */
function dispatchSlideCommand(command: string, value?: unknown): void {
	window.dispatchEvent(
		new CustomEvent("wo-command", { detail: { command, value } }),
	);
}

const CATEGORY_ICONS: Record<string, string> = {
	entrance: "→",
	emphasis: "✦",
	exit: "←",
	motion: "↗",
};

const ObservedAnimationPanel = observer(function ObservedAnimationPanel() {
	const { slides, currentSlide, isPreviewPlaying, previewStep } =
		presentationStore;
	const slide = slides[currentSlide];
	const anims = slide?.animations ?? [];

	const handleRemoveAnimation = useCallback(
		(animId: string) => {
			dispatchSlideCommand("animationRemove", {
				slideIndex: currentSlide,
				animId,
			});
		},
		[currentSlide],
	);

	const handleMoveEarlier = useCallback(
		(idx: number) => {
			dispatchSlideCommand("animationMoveEarlier", {
				slideIndex: currentSlide,
				index: idx,
			});
		},
		[currentSlide],
	);

	const handleMoveLater = useCallback(
		(idx: number) => {
			dispatchSlideCommand("animationMoveLater", {
				slideIndex: currentSlide,
				index: idx,
			});
		},
		[currentSlide],
	);

	if (anims.length === 0) {
		return (
			<div className="prese-right-panel">
				<div className="prese-right-panel-header">Animation Pane</div>
				<div className="prese-right-panel-body">
					<p className="prese-right-panel-empty">
						No animations on this slide. Select a shape and add an animation
						from the Animation tab.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="prese-right-panel">
			<div className="prese-right-panel-header">Animation Pane</div>
			<div className="prese-right-panel-body">
				<div className="prese-animation-pane-list">
					{anims.map((anim: AnimationData, idx: number) => (
						<div
							key={anim.id}
							className={`prese-animation-pane-item${isPreviewPlaying && idx === previewStep ? " prese-animation-pane-item-active" : ""}`}
						>
							<div className="prese-animation-pane-order">{idx + 1}</div>
							<div className="prese-animation-pane-icon" title={anim.category}>
								{CATEGORY_ICONS[anim.category] ?? "•"}
							</div>
							<div className="prese-animation-pane-info">
								<div className="prese-animation-pane-name">{anim.effect}</div>
								<div className="prese-animation-pane-timing">
									{anim.start} · {anim.duration}s · {anim.delay}s delay
								</div>
							</div>
							<div className="prese-animation-pane-actions">
								<button
									type="button"
									className="prese-animation-pane-btn"
									title="Move Earlier"
									disabled={idx === 0}
									onClick={() => handleMoveEarlier(idx)}
								>
									↑
								</button>
								<button
									type="button"
									className="prese-animation-pane-btn"
									title="Move Later"
									disabled={idx === anims.length - 1}
									onClick={() => handleMoveLater(idx)}
								>
									↓
								</button>
								<button
									type="button"
									className="prese-animation-pane-btn prese-animation-pane-btn-danger"
									title="Remove"
									onClick={() => handleRemoveAnimation(anim.id)}
								>
									✕
								</button>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
});

export const AnimationPanel = ObservedAnimationPanel;
