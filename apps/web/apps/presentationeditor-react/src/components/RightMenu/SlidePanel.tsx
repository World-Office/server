import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { presentationStore } from "../../stores/PresentationStore"
import type { SlideLayout } from "../../types/presentation"

const LAYOUTS: SlideLayout[] = [
  "blank",
  "title",
  "content",
  "comparison",
  "sectionHeader",
  "twoContent",
  "captionOnly",
  "verticalText",
  "verticalTitleAndText",
  "verticalTitleAndTextOverContent",
]

function SlidePanelInner(): JSX.Element {
  const { slides, currentSlide, setSlideLayout, setSlideNotes } = presentationStore
  const slide = slides[currentSlide]
  if (!slide) return <div className="prese-slide-panel-empty">No slide selected</div>

  return (
    <div className="prese-slide-panel">
      <div className="prese-slide-panel-header">Slide Properties</div>

      <div className="prese-slide-panel-info">
        Slide {currentSlide + 1} of {slides.length}
      </div>

      <label className="prese-slide-panel-label">
        Layout
        <select
          className="prese-slide-panel-select"
          value={slide.layout}
          onChange={(e) => setSlideLayout(currentSlide, e.target.value as SlideLayout)}
        >
          {LAYOUTS.map((l) => (
            <option key={l} value={l}>
              {l.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
            </option>
          ))}
        </select>
      </label>

      <label className="prese-slide-panel-label">
        Speaker Notes
        <textarea
          className="prese-slide-panel-notes"
          value={slide.notes || ""}
          onChange={(e) => setSlideNotes(currentSlide, e.target.value)}
          placeholder="Add speaker notes…"
          rows={6}
        />
      </label>
    </div>
  )
}

export const SlidePanel = observer(SlidePanelInner)
