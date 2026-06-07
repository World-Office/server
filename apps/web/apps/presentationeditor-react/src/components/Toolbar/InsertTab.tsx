import { observer } from "mobx-react-lite"
import { ShapesGallery } from "./ShapesGallery"
import { ChartTypePicker } from "./ChartTypePicker"
import { TablePicker } from "./TablePicker"
import { presentationStore } from "../../stores/PresentationStore"

function addTextBox() {
  const slideIndex = presentationStore.currentSlide
  const slide = presentationStore.slides[slideIndex]
  if (!slide) return
  const existing = slide.shapes?.length || 0
  presentationStore.addShape(slideIndex, {
    id: `textbox-${Date.now()}`,
    type: "textbox",
    x: 50 + existing * 30,
    y: 50 + existing * 20,
    width: 200,
    height: 60,
    zIndex: existing,
    fillColor: "transparent",
    strokeColor: "transparent",
    strokeWidth: 0,
    rotation: 0,
    text: "Text",
    fontSize: 18,
    fontColor: "#333333",
  })
}

const ObservedInsertTab = observer(function ObservedInsertTab() {
  return (
    <section
      className="prese-inserttab-panel"
      data-tab="insert"
      role="tabpanel"
      aria-labelledby="insert"
    >
      {/* Slides */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="New Slide">
            New Slide
          </button>
        </div>
      </div>

      <div className="prese-inserttab-separator" />

      {/* Tables */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <TablePicker />
        </div>
      </div>

      <div className="prese-inserttab-separator" />

      {/* Illustrations */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <ShapesGallery />
          <ChartTypePicker />
          <button type="button" className="prese-inserttab-btn" title="Icons">
            Icons
          </button>
          <button type="button" className="prese-inserttab-btn" title="3D Models">
            3D Models
          </button>
        </div>
      </div>

      <div className="prese-inserttab-separator" />

      {/* Images */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Pictures">
            Pictures
          </button>
          <button type="button" className="prese-inserttab-btn" title="Online Pictures">
            Online Pictures
          </button>
          <button type="button" className="prese-inserttab-btn" title="Photo Album">
            Photo Album
          </button>
        </div>
      </div>

      <div className="prese-inserttab-separator" />

      {/* Links */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Link">
            Link
          </button>
        </div>
      </div>

      <div className="prese-inserttab-separator" />

      {/* Text */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <button
            type="button"
            className="prese-inserttab-btn"
            title="Text Box"
            onClick={addTextBox}
          >
            Text Box
          </button>
        </div>
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="WordArt">
            WordArt
          </button>
        </div>
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Header & Footer">
            Header & Footer
          </button>
        </div>
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Date & Time">
            Date & Time
          </button>
        </div>
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Slide Number">
            Slide Number
          </button>
        </div>
      </div>

      <div className="prese-inserttab-separator" />

      {/* Media */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Video">
            Video
          </button>
        </div>
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Audio">
            Audio
          </button>
        </div>
      </div>

      <div className="prese-inserttab-separator" />

      {/* Symbols */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Equation">
            Equation
          </button>
        </div>
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Symbol">
            Symbol
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedInsertTab as InsertTab }
