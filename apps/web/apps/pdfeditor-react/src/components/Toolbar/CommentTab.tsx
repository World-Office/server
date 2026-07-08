import {
  BadgeCheck,
  Highlighter,
  MessageSquare,
  Shapes,
  Strikethrough,
  Underline,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import { pdfStore } from "../../stores/PdfStore"
import type { AnnotationTool } from "../../types/pdf"

const ObservedCommentTab = observer(function ObservedCommentTab() {
  function setAnnotationTool(tool: AnnotationTool | null) {
    pdfStore.setAnnotationTool(tool)
  }

  return (
    <section
      className="pdf-commenttab-panel"
      data-tab="comment"
      role="tabpanel"
      aria-labelledby="comment"
    >
      <div className="pdf-commenttab-group">
        <button
          type="button"
          className={`pdf-commenttab-btn${pdfStore.activeAnnotationTool === "text-comment" ? " active" : ""}`}
          onClick={() => setAnnotationTool("text-comment")}
          title="Text Comment"
        >
          <MessageSquare size={18} />
          Text Comment
        </button>
        <button
          type="button"
          className={`pdf-commenttab-btn${pdfStore.activeAnnotationTool === "stamp" ? " active" : ""}`}
          onClick={() => setAnnotationTool("stamp")}
          title="Stamp"
        >
          <BadgeCheck size={18} />
          Stamp
        </button>
        <button
          type="button"
          className={`pdf-commenttab-btn${pdfStore.activeAnnotationTool === "shape-comment" ? " active" : ""}`}
          onClick={() => setAnnotationTool("shape-comment")}
          title="Shape Comment"
        >
          <Shapes size={18} />
          Shape Comment
        </button>
      </div>

      <div className="pdf-commenttab-separator" />

      <div className="pdf-commenttab-group">
        <div className="pdf-commenttab-elset">
          <button
            type="button"
            className={`pdf-commenttab-btn${pdfStore.activeAnnotationTool === "highlight" ? " active" : ""}`}
            onClick={() => setAnnotationTool("highlight")}
            title="Highlight"
          >
            <Highlighter size={18} />
            Highlight
          </button>
        </div>
      </div>

      <div className="pdf-commenttab-separator" />

      <div className="pdf-commenttab-group">
        <div className="pdf-commenttab-elset">
          <button
            type="button"
            className={`pdf-commenttab-btn${pdfStore.activeAnnotationTool === "strikeout" ? " active" : ""}`}
            onClick={() => setAnnotationTool("strikeout")}
            title="Strikeout"
          >
            <Strikethrough size={18} />
            Strikeout
          </button>
        </div>
        <div className="pdf-commenttab-elset">
          <button
            type="button"
            className={`pdf-commenttab-btn${pdfStore.activeAnnotationTool === "underline" ? " active" : ""}`}
            onClick={() => setAnnotationTool("underline")}
            title="Underline"
          >
            <Underline size={18} />
            Underline
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedCommentTab as CommentTab }
