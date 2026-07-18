import { observer } from "mobx-react-lite"
import { insertFootnoteCommand } from "../../lib/footnote-mark"
import { getActiveRichTextEditor } from "../../lib/rte-command"
import { insertTableOfContentsCommand, updateTableOfContentsCommand } from "../../lib/toc-extension"

const ObservedReferencesTab = observer(function ObservedReferencesTab() {
  return (
    <section
      className="de-referencestab-panel"
      data-tab="references"
      role="tabpanel"
      aria-labelledby="references"
    >
      <div className="de-referencestab-group">
        <div className="de-referencestab-elset">
          <button
            type="button"
            className="de-referencestab-btn"
            title="Table of Contents"
            onClick={() => {
              const editor = getActiveRichTextEditor()
              if (editor) insertTableOfContentsCommand(editor)
            }}
          >
            Table of Contents
          </button>
          <button
            type="button"
            className="de-referencestab-btn"
            title="Update TOC"
            onClick={() => {
              const editor = getActiveRichTextEditor()
              if (editor) updateTableOfContentsCommand(editor)
            }}
          >
            Update TOC
          </button>
        </div>
      </div>

      <div className="de-referencestab-separator" />

      <div className="de-referencestab-group">
        <div className="de-referencestab-elset">
          <button
            type="button"
            className="de-referencestab-btn"
            title="Insert Footnote"
            onClick={() => {
              const editor = getActiveRichTextEditor()
              if (editor) insertFootnoteCommand(editor)
            }}
          >
            Insert Footnote
          </button>
        </div>
      </div>

      <div className="de-referencestab-separator" />

      <div className="de-referencestab-group">
        <div className="de-referencestab-elset">
          <button
            type="button"
            className="de-referencestab-btn"
            title="Insert Citation"
            onClick={() => {}}
          >
            Insert Citation
          </button>
          <button
            type="button"
            className="de-referencestab-btn"
            title="Manage Sources"
            onClick={() => {}}
          >
            Manage Sources
          </button>
          <button
            type="button"
            className="de-referencestab-btn"
            title="Bibliography"
            onClick={() => {}}
          >
            Bibliography
          </button>
        </div>
      </div>

      <div className="de-referencestab-separator" />

      <div className="de-referencestab-group">
        <div className="de-referencestab-elset">
          <button
            type="button"
            className="de-referencestab-btn"
            title="Insert Caption"
            onClick={() => {}}
          >
            Insert Caption
          </button>
        </div>
      </div>

      <div className="de-referencestab-separator" />

      <div className="de-referencestab-group">
        <div className="de-referencestab-elset">
          <button
            type="button"
            className="de-referencestab-btn"
            title="Mark Entry"
            onClick={() => {}}
          >
            Mark Entry
          </button>
          <button
            type="button"
            className="de-referencestab-btn"
            title="Insert Index"
            onClick={() => {}}
          >
            Insert Index
          </button>
        </div>
      </div>
    </section>
  )
})

export { ObservedReferencesTab as ReferencesTab }
