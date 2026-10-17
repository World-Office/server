/**
 * CommentsPanel — left-menu "Comments" toggle target (PDF editor).
 *
 * Page-anchored comment threads held in PdfStore (so they survive panel
 * toggles) and mirrored to sessionStorage per document. New comments anchor
 * to the page currently on screen; a thread's badge scrolls back to it.
 */
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { useEffect, useState } from "react"
import { pdfStore } from "../../stores/PdfStore"
import type { PdfCommentThread } from "../../types/pdf"

const STORAGE_KEY = "pdf-page-comments"

function storageId(): string {
  return `${STORAGE_KEY}:${pdfStore.document?.title ?? "untitled"}`
}

function loadThreads(): PdfCommentThread[] {
  try {
    const raw = sessionStorage.getItem(storageId())
    if (!raw) return []
    const parsed = JSON.parse(raw) as PdfCommentThread[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveThreads(threads: PdfCommentThread[]): void {
  try {
    sessionStorage.setItem(storageId(), JSON.stringify(threads))
  } catch {
    // storage full / disabled — comments stay in memory
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  })
}

function CommentsPanelInner({ active }: { active: boolean }): JSX.Element {
  const [text, setText] = useState("")
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [showResolved, setShowResolved] = useState(false)

  const threads = pdfStore.pageComments
  // No useMemo here: the store mutates pageComments in place (push/splice), so
  // the array reference stays identical and a memo would keep a stale list.
  const visible = threads.filter((t) => showResolved || !t.resolved)
  const currentPage = pdfStore.currentPage

  // load once per document, keep the store persisted on change
  useEffect(() => {
    pdfStore.setPageComments(loadThreads())
  }, [])
  useEffect(() => {
    saveThreads(threads)
  }, [threads])

  function addComment(): void {
    if (!pdfStore.addPageComment(currentPage, text)) return
    setText("")
  }

  function addReply(threadId: string): void {
    if (!pdfStore.addPageReply(threadId, replyText)) return
    setReplyText("")
    setReplyFor(null)
  }

  return (
    <div
      className="pdf-left-panel pdf-comments-panel"
      style={{ display: active ? "flex" : "none" }}
      data-panel="comments"
    >
      <div className="pdf-left-panel-header">
        <span>Comments</span>
        {pdfStore.commentCount > 0 && (
          <span className="pdf-left-panel-count">{pdfStore.commentCount}</span>
        )}
      </div>
      <div className="pdf-left-panel-body">
        <div className="pdf-left-panel-muted">
          Comment on: <span className="pdf-left-panel-badge">Page {currentPage + 1}</span>
        </div>
        <textarea
          className="pdf-left-panel-textarea"
          placeholder="Leave a comment on this page…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addComment()
          }}
          data-action="comment-text"
        />
        <div className="pdf-left-panel-actions">
          <button
            type="button"
            className="pdf-left-panel-btn pdf-left-panel-btn-primary"
            onClick={addComment}
            data-action="comment-add"
          >
            Comment
          </button>
          <label className="pdf-left-panel-check">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />
            Show resolved
          </label>
        </div>
        <ul className="pdf-left-panel-list">
          {visible.map((thread) => (
            <li
              key={thread.id}
              className={`pdf-comment-thread${thread.resolved ? " resolved" : ""}`}
            >
              <div className="pdf-comment-meta">
                <button
                  type="button"
                  className="pdf-left-panel-badge"
                  title="Go to page"
                  onClick={() => pdfStore.gotoPage(thread.pageIndex + 1)}
                >
                  Page {thread.pageIndex + 1}
                </button>
                <span className="pdf-comment-author">{thread.author}</span>
                <span className="pdf-left-panel-muted">{formatTime(thread.createdAt)}</span>
              </div>
              <div className="pdf-comment-text">{thread.text}</div>
              {thread.replies.map((reply) => (
                <div key={reply.id} className="pdf-comment-reply">
                  <span className="pdf-comment-author">{reply.author}</span>
                  <span className="pdf-comment-text">{reply.text}</span>
                </div>
              ))}
              <div className="pdf-left-panel-actions">
                <button
                  type="button"
                  className="pdf-left-panel-btn"
                  onClick={() =>
                    pdfStore.setPageCommentResolved(thread.id, !thread.resolved)
                  }
                  data-action="comment-resolve"
                >
                  {thread.resolved ? "Reopen" : "Resolve"}
                </button>
                <button
                  type="button"
                  className="pdf-left-panel-btn"
                  onClick={() => setReplyFor(thread.id)}
                  data-action="comment-reply"
                >
                  Reply
                </button>
                <button
                  type="button"
                  className="pdf-left-panel-btn pdf-left-panel-btn-danger"
                  onClick={() => pdfStore.deletePageComment(thread.id)}
                  data-action="comment-delete"
                >
                  Delete
                </button>
              </div>
              {replyFor === thread.id && (
                <div className="pdf-comment-reply-box">
                  <textarea
                    className="pdf-left-panel-textarea"
                    placeholder="Reply…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />
                  <div className="pdf-left-panel-actions">
                    <button
                      type="button"
                      className="pdf-left-panel-btn pdf-left-panel-btn-primary"
                      onClick={() => addReply(thread.id)}
                    >
                      Send
                    </button>
                    <button
                      type="button"
                      className="pdf-left-panel-btn"
                      onClick={() => {
                        setReplyFor(null)
                        setReplyText("")
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {threads.length === 0 && (
          <div className="pdf-left-panel-muted">
            No comments yet. Scroll to a page and write the first one.
          </div>
        )}
        {active && threads.length > 0 && visible.length === 0 && (
          <div className="pdf-left-panel-muted">All comments are resolved.</div>
        )}
      </div>
    </div>
  )
}

export const CommentsPanel = observer(CommentsPanelInner)
