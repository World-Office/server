import {
  Box,
  Calendar,
  FilePlus,
  FileText,
  Globe,
  Hash,
  Image,
  Images,
  Link,
  Omega,
  Pen,
  Sigma,
  Smile,
  Type,
  Video,
  Volume2,
  Workflow,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import { presentationStore } from "../../stores/PresentationStore"
import { ChartTypePicker } from "./ChartTypePicker"
import { ShapesGallery } from "./ShapesGallery"
import { TablePicker } from "./TablePicker"

function addConnector(type: string) {
  presentationStore.addConnectorToSlide(presentationStore.currentSlide, type)
}

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
          <button
            type="button"
            className="prese-inserttab-btn"
            title="New Slide"
            onClick={() => presentationStore.addSlide()}
          >
            <FilePlus size={18} />
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
          <div className="prese-inserttab-btn-group" title="Connector">
            <button
              type="button"
              className="prese-inserttab-btn"
              onClick={() => addConnector("straight")}
            >
              <Workflow size={18} />
              ──
            </button>
            <button
              type="button"
              className="prese-inserttab-btn"
              onClick={() => addConnector("bent")}
            >
              <Workflow size={18} />┐
            </button>
            <button
              type="button"
              className="prese-inserttab-btn"
              onClick={() => addConnector("curved")}
            >
              <Workflow size={18} />⌒
            </button>
          </div>
          <ChartTypePicker />
          <button type="button" className="prese-inserttab-btn" title="Icons">
            <Smile size={18} />
            Icons
          </button>
          <button type="button" className="prese-inserttab-btn" title="3D Models">
            <Box size={18} />
            3D Models
          </button>
        </div>
      </div>

      <div className="prese-inserttab-separator" />

      {/* Images */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <input
            type="file"
            accept="image/*"
            id="prese-image-picker"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                presentationStore.addImageToSlide(presentationStore.currentSlide, file)
              }
              e.target.value = ""
            }}
          />
          <button
            type="button"
            className="prese-inserttab-btn"
            title="Pictures"
            onClick={() => document.getElementById("prese-image-picker")?.click()}
          >
            <Image size={18} />
            Pictures
          </button>
          <button type="button" className="prese-inserttab-btn" title="Online Pictures">
            <Globe size={18} />
            Online Pictures
          </button>
          <button type="button" className="prese-inserttab-btn" title="Photo Album">
            <Images size={18} />
            Photo Album
          </button>
        </div>
      </div>

      <div className="prese-inserttab-separator" />

      {/* Links */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Link">
            <Link size={18} />
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
            <Type size={18} />
            Text Box
          </button>
        </div>
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="WordArt">
            <Pen size={18} />
            WordArt
          </button>
        </div>
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Header & Footer">
            <FileText size={18} />
            Header & Footer
          </button>
        </div>
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Date & Time">
            <Calendar size={18} />
            Date & Time
          </button>
        </div>
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Slide Number">
            <Hash size={18} />
            Slide Number
          </button>
        </div>
      </div>

      <div className="prese-inserttab-separator" />

      {/* Media */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Video">
            <Video size={18} />
            Video
          </button>
        </div>
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Audio">
            <Volume2 size={18} />
            Audio
          </button>
        </div>
      </div>

      <div className="prese-inserttab-separator" />

      {/* Symbols */}
      <div className="prese-inserttab-group">
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Equation">
            <Sigma size={18} />
            Equation
          </button>
        </div>
        <div className="prese-inserttab-elset">
          <button type="button" className="prese-inserttab-btn" title="Symbol">
            <Omega size={18} />
            Symbol
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedInsertTab as InsertTab }
