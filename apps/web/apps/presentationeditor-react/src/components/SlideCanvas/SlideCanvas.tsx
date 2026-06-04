import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { presentationStore } from "../../stores/PresentationStore"

const ObservedSlideCanvas = observer(function ObservedSlideCanvas(): JSX.Element {
  const { slides, currentSlide, zoomLevel, slideSize } = presentationStore
  const slide = slides[currentSlide]
  if (!slide) return <div className="prese-canvas-empty">No slides</div>

  const aspectRatio = slideSize === "widescreen" ? 16 / 9 : 4 / 3
  const baseWidth = 960
  const baseHeight = baseWidth / aspectRatio
  const scale = zoomLevel / 100
  const canvasWidth = baseWidth * scale
  const canvasHeight = baseHeight * scale

  return (
    <div className="prese-canvas-container">
      <div
        className="prese-canvas-slide"
        style={{
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div className="prese-canvas-background" />

        {slide.layout === "title" && (
          <div className="prese-canvas-placeholder prese-canvas-placeholder-title">
            <div
              className="prese-canvas-placeholder-text"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) =>
                presentationStore.setSlideTitle(
                  currentSlide,
                  e.currentTarget.textContent || "",
                )
              }
            >
              {slide.title || "Click to add title"}
            </div>
          </div>
        )}

        {slide.layout === "content" && (
          <>
            <div className="prese-canvas-placeholder prese-canvas-placeholder-title">
              <div
                className="prese-canvas-placeholder-text"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) =>
                  presentationStore.setSlideTitle(
                    currentSlide,
                    e.currentTarget.textContent || "",
                  )
                }
              >
                {slide.title || "Click to add title"}
              </div>
            </div>
            <div className="prese-canvas-placeholder prese-canvas-placeholder-body">
              <div className="prese-canvas-placeholder-text placeholder-muted">
                Click to add content
              </div>
            </div>
          </>
        )}

        {slide.layout === "blank" && (
          <div className="prese-canvas-placeholder prese-canvas-placeholder-blank">
            <div
              className="prese-canvas-placeholder-text"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) =>
                presentationStore.setSlideTitle(
                  currentSlide,
                  e.currentTarget.textContent || "",
                )
              }
            >
              {slide.title || "Click to add title"}
            </div>
          </div>
        )}

        {slide.notes && (
          <div className="prese-canvas-notes-indicator" title={slide.notes}>
            📝
          </div>
        )}
      </div>
    </div>
  )
})

export const SlideCanvas = ObservedSlideCanvas
