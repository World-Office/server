import { observer } from "mobx-react-lite"
import { presentationStore } from "../../stores/PresentationStore"
import type { AnimationData } from "../../types/presentation"

const CATEGORY_ICONS: Record<string, string> = {
  entrance: "→",
  emphasis: "✦",
  exit: "←",
  motion: "↗",
}

const ObservedAnimationPanel = observer(function ObservedAnimationPanel() {
  const { slides, currentSlide, removeAnimation, moveAnimationEarlier, moveAnimationLater } =
    presentationStore
  const slide = slides[currentSlide]
  const anims = slide?.animations ?? []

  if (anims.length === 0) {
    return (
      <div className="prese-right-panel">
        <div className="prese-right-panel-header">Animation Pane</div>
        <div className="prese-right-panel-body">
          <p className="prese-right-panel-empty">
            No animations on this slide. Select a shape and add an animation from the Animation tab.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="prese-right-panel">
      <div className="prese-right-panel-header">Animation Pane</div>
      <div className="prese-right-panel-body">
        <div className="prese-animation-pane-list">
          {anims.map((anim: AnimationData, idx: number) => (
            <div key={anim.id} className="prese-animation-pane-item">
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
                  onClick={() => moveAnimationEarlier(currentSlide, idx)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="prese-animation-pane-btn"
                  title="Move Later"
                  disabled={idx === anims.length - 1}
                  onClick={() => moveAnimationLater(currentSlide, idx)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="prese-animation-pane-btn prese-animation-pane-btn-danger"
                  title="Remove"
                  onClick={() => removeAnimation(currentSlide, anim.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

export const AnimationPanel = ObservedAnimationPanel
