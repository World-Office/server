import { useState } from "react"
import { getActiveRichTextEditor } from "../../lib/rte-command"
import {
  acceptAllChanges,
  acceptChange,
  isTrackChangesActive,
  nextChange,
  rejectAllChanges,
  rejectChange,
  toggleTrackChanges,
} from "../../lib/track-changes"

interface TrackChangesPanelProps {
  visible: boolean
}

export function TrackChangesPanel({ visible }: TrackChangesPanelProps) {
  const [message, setMessage] = useState<string | null>(null)
  const [selectedPos, setSelectedPos] = useState<number | null>(null)

  if (!visible) return null

  function withEditor(fn: (editor: ReturnType<typeof getActiveRichTextEditor>) => void) {
    const editor = getActiveRichTextEditor()
    if (!editor) {
      setMessage("No active document editor")
      return
    }
    fn(editor)
  }

  function handleToggle() {
    withEditor((editor) => {
      toggleTrackChanges(editor, "Current User", "local")
      setMessage(isTrackChangesActive() ? "Track changes disabled" : "Track changes enabled")
    })
  }

  function handleAccept() {
    if (selectedPos !== null) {
      withEditor((editor) => {
        acceptChange(editor, selectedPos)
        setSelectedPos(null)
        setMessage("Change accepted")
      })
    }
  }

  function handleReject() {
    if (selectedPos !== null) {
      withEditor((editor) => {
        rejectChange(editor, selectedPos)
        setSelectedPos(null)
        setMessage("Change rejected")
      })
    }
  }

  function handleAcceptAll() {
    withEditor((editor) => {
      acceptAllChanges(editor)
      setMessage("All changes accepted")
    })
  }

  function handleRejectAll() {
    withEditor((editor) => {
      rejectAllChanges(editor)
      setMessage("All changes rejected")
    })
  }

  function handleNext() {
    withEditor((editor) => {
      const found = nextChange(editor)
      if (found) {
        const { from } = editor.state.selection
        setSelectedPos(from)
        setMessage(null)
      } else {
        setMessage("No more changes")
      }
    })
  }

  return (
    <div className="de-track-changes-panel">
      <div className="de-track-changes-header">Track Changes</div>

      <div className="de-track-changes-body">
        <div className="de-track-changes-status">
          <label className="de-track-changes-toggle">
            <input type="checkbox" checked={isTrackChangesActive()} onChange={handleToggle} />
            <span>Record changes</span>
          </label>
        </div>

        <div className="de-track-changes-actions">
          <button type="button" className="de-track-btn" onClick={handleNext} title="Next change">
            Next Change
          </button>
          <button
            type="button"
            className="de-track-btn de-track-btn-accept"
            disabled={selectedPos === null}
            onClick={handleAccept}
            title="Accept selected change"
          >
            Accept
          </button>
          <button
            type="button"
            className="de-track-btn de-track-btn-reject"
            disabled={selectedPos === null}
            onClick={handleReject}
            title="Reject selected change"
          >
            Reject
          </button>
        </div>

        <div className="de-track-changes-bulk">
          <button
            type="button"
            className="de-track-btn de-track-btn-accept"
            onClick={handleAcceptAll}
            title="Accept all changes in document"
          >
            Accept All
          </button>
          <button
            type="button"
            className="de-track-btn de-track-btn-reject"
            onClick={handleRejectAll}
            title="Reject all changes in document"
          >
            Reject All
          </button>
        </div>

        {message && <div className="de-track-changes-message">{message}</div>}
      </div>
    </div>
  )
}
