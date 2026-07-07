import {
  BookImage,
  Divide,
  FileInput,
  Image,
  ImageDown,
  Link,
  SeparatorHorizontal,
  Shapes,
  Sigma,
  Table2,
  TextCursorInput,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import type { RichTextCommand } from "../../lib/rte-command"

interface InsertTabProps {
  onRichTextCommand: (command: RichTextCommand, value?: string) => void
}

const ObservedInsertTab = observer(function ObservedInsertTab({
  onRichTextCommand,
}: InsertTabProps) {
  return (
    <section
      className="de-inserttab-panel"
      data-tab="insert"
      role="tabpanel"
      aria-labelledby="insert"
    >
      {/* Pages */}
      <div className="de-inserttab-group">
        <span className="de-inserttab-label">Pages</span>
        <div className="de-inserttab-elset">
          <button type="button" className="de-inserttab-btn" title="Cover Page">
            <BookImage size={18} />
            <span>Cover</span>
          </button>
          <button type="button" className="de-inserttab-btn" title="Blank Page">
            <FileInput size={18} />
            <span>Blank</span>
          </button>
          <button
            type="button"
            className="de-inserttab-btn"
            onClick={() => onRichTextCommand("pageBreak")}
            title="Page Break"
          >
            <SeparatorHorizontal size={18} />
            <span>Break</span>
          </button>
        </div>
      </div>

      {/* Tables */}
      <div className="de-inserttab-group">
        <span className="de-inserttab-label">Table</span>
        <div className="de-inserttab-elset">
          <button
            type="button"
            className="de-inserttab-btn"
            onClick={() => onRichTextCommand("insertTable")}
            title="Insert Table"
          >
            <Table2 size={18} />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* Images */}
      <div className="de-inserttab-group">
        <span className="de-inserttab-label">Images</span>
        <div className="de-inserttab-elset">
          <button
            type="button"
            className="de-inserttab-btn"
            onClick={() => onRichTextCommand("image")}
            title="Pictures"
          >
            <Image size={18} />
            <span>Picture</span>
          </button>
          <button type="button" className="de-inserttab-btn" title="Shapes">
            <Shapes size={18} />
            <span>Shapes</span>
          </button>
          <button type="button" className="de-inserttab-btn" title="Icons">
            <ImageDown size={18} />
            <span>Icons</span>
          </button>
        </div>
      </div>

      {/* Links */}
      <div className="de-inserttab-group">
        <span className="de-inserttab-label">Links</span>
        <div className="de-inserttab-elset">
          <button
            type="button"
            className="de-inserttab-btn"
            onClick={() => onRichTextCommand("link")}
            title="Link"
          >
            <Link size={18} />
            <span>Link</span>
          </button>
        </div>
      </div>

      {/* Text */}
      <div className="de-inserttab-group">
        <span className="de-inserttab-label">Text</span>
        <div className="de-inserttab-elset">
          <button type="button" className="de-inserttab-btn" title="Text Box">
            <TextCursorInput size={18} />
            <span>Box</span>
          </button>
          <button
            type="button"
            className="de-inserttab-btn"
            onClick={() => onRichTextCommand("horizontalRule")}
            title="Horizontal Rule"
          >
            <SeparatorHorizontal size={18} />
            <span>HR</span>
          </button>
        </div>
        <div className="de-inserttab-elset">
          <button type="button" className="de-inserttab-btn" title="Equation">
            <Sigma size={18} />
            <span>Equation</span>
          </button>
          <button type="button" className="de-inserttab-btn" title="Symbol">
            <Divide size={18} />
            <span>Symbol</span>
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedInsertTab as InsertTab }
