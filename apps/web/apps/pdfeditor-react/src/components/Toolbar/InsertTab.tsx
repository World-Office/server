import {
  BarChart3,
  GitGraph,
  Image,
  Link,
  Omega,
  Paintbrush,
  Shapes,
  Sigma,
  Table2,
  Type,
} from "lucide-react"
import { observer } from "mobx-react-lite"

const ObservedInsertTab = observer(function ObservedInsertTab() {
  return (
    <section
      className="pdf-inserttab-panel"
      data-tab="insert"
      role="tabpanel"
      aria-labelledby="insert"
    >
      <div className="pdf-inserttab-group">
        <div className="pdf-inserttab-elset">
          <button type="button" className="pdf-inserttab-btn" title="Table">
            <Table2 size={18} />
            Table
          </button>
          <button type="button" className="pdf-inserttab-btn" title="Image">
            <Image size={18} />
            Image
          </button>
          <button type="button" className="pdf-inserttab-btn" title="Shape">
            <Shapes size={18} />
            Shape
          </button>
        </div>
      </div>

      <div className="pdf-inserttab-separator" />

      <div className="pdf-inserttab-group">
        <div className="pdf-inserttab-elset">
          <button type="button" className="pdf-inserttab-btn" title="Text">
            <Type size={18} />
            Text
          </button>
          <button type="button" className="pdf-inserttab-btn" title="Equation">
            <Sigma size={18} />
            Equation
          </button>
        </div>
      </div>

      <div className="pdf-inserttab-separator" />

      <div className="pdf-inserttab-group">
        <div className="pdf-inserttab-elset">
          <button type="button" className="pdf-inserttab-btn" title="Chart">
            <BarChart3 size={18} />
            Chart
          </button>
          <button type="button" className="pdf-inserttab-btn" title="SmartArt">
            <GitGraph size={18} />
            SmartArt
          </button>
        </div>
      </div>

      <div className="pdf-inserttab-separator" />

      <div className="pdf-inserttab-group">
        <div className="pdf-inserttab-elset">
          <button type="button" className="pdf-inserttab-btn" title="TextArt">
            <Paintbrush size={18} />
            TextArt
          </button>
          <button type="button" className="pdf-inserttab-btn" title="Symbol">
            <Omega size={18} />
            Symbol
          </button>
          <button type="button" className="pdf-inserttab-btn" title="Hyperlink">
            <Link size={18} />
            Hyperlink
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedInsertTab as InsertTab }
