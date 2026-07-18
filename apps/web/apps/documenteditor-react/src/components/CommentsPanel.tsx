import { observer } from "mobx-react-lite"
import { useState } from "react"
import { getActiveRichTextEditor } from "../lib/rte-command"
import { commentsStore } from "../stores/CommentsStore"
import { documentStore } from "../stores/DocumentStore"

// ── Preset comment authors ──

const DEFAULT_AUTHOR = "Current User"

interface CommentsPanelProps {
  visible: boolean
}

const ObservedCommentsPanel = observer(function ObservedCommentsPanel({
  visible,
}: CommentsPanelProps) {
  const [newCommentText, setNewCommentText] = useState("")
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({})

  if (!visible) return null

  const editor = getActiveRichTextEditor()

  function handleAddComment() {
    if (!newCommentText.trim() || !editor) return

    const { from, to } = editor.state.selection
    let anchorText: string | undefined
    if (from !== to) {
      anchorText = editor.state.doc.textBetween(from, to, " ")
    }

    commentsStore.addComment({
      author: DEFAULT_AUTHOR,
      text: newCommentText.trim(),
      from: from !== to ? from : undefined,
      to: from !== to ? to : undefined,
      anchorText,
    })
    setNewCommentText("")
  }

  function handleAddReply(commentId: string) {
    const text = replyTexts[commentId]
    if (!text?.trim()) return
    commentsStore.addReply(commentId, {
      author: DEFAULT_AUTHOR,
      text: text.trim(),
    })
    setReplyTexts((prev) => ({ ...prev, [commentId]: "" }))
  }

  function handleNavigateToComment(from?: number, to?: number) {
    if (!editor || from === undefined || to === undefined) return
    editor.commands.setTextSelection({ from, to })
    editor.commands.scrollIntoView()
  }

  const unresolved = commentsStore.comments.filter((c) => !c.resolved)
  const resolved = commentsStore.comments.filter((c) => c.resolved)

  return (
    <div
      className="de-comments-panel"
      style={{
        position: "absolute",
        right: 48,
        top: 0,
        width: 300,
        height: "100%",
        background: "#fff",
        borderLeft: "1px solid #e0e0e0",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Aptos', 'Calibri', 'Segoe UI', Roboto, sans-serif",
        fontSize: 13,
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e0e0e0",
          fontWeight: 600,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#f8f9fa",
        }}
      >
        <span>
          Comments {commentsStore.activeCount > 0 ? `(${commentsStore.activeCount})` : ""}
        </span>
        <button
          type="button"
          onClick={() => documentStore.setActiveRightPanel(null)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            color: "#666",
            padding: "2px 6px",
            borderRadius: 3,
          }}
          title="Close"
        >
          &times;
        </button>
      </div>

      {/* New comment input */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <textarea
          value={newCommentText}
          onChange={(e) => setNewCommentText(e.target.value)}
          placeholder={
            editor?.state.selection.from !== editor?.state.selection.to
              ? "Comment on selected text\u2026"
              : "Select text first, then add a comment\u2026"
          }
          rows={3}
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid #ccc",
            borderRadius: 4,
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          onClick={handleAddComment}
          disabled={
            !newCommentText.trim() ||
            !editor ||
            editor.state.selection.from === editor.state.selection.to
          }
          style={{
            padding: "6px 16px",
            background: "#2ecc71",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            alignSelf: "flex-end",
            opacity:
              !newCommentText.trim() ||
              !editor ||
              editor.state.selection.from === editor.state.selection.to
                ? 0.5
                : 1,
          }}
        >
          Add Comment
        </button>
      </div>

      {/* Comments list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {unresolved.length === 0 && resolved.length === 0 && (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "#999",
              fontSize: 13,
            }}
          >
            No comments yet. Select text and add a comment above.
          </div>
        )}

        {/* Unresolved comments */}
        {unresolved.map((comment) =>
          renderComment(
            comment,
            replyTexts,
            handleAddReply,
            handleNavigateToComment,
            setReplyTexts,
          ),
        )}

        {/* Resolved comments section */}
        {resolved.length > 0 && (
          <>
            <div
              style={{
                padding: "8px 16px",
                fontWeight: 600,
                fontSize: 12,
                color: "#888",
                borderTop: "1px solid #e0e0e0",
                marginTop: 8,
              }}
            >
              Resolved ({resolved.length})
            </div>
            {resolved.map((comment) =>
              renderComment(
                comment,
                replyTexts,
                handleAddReply,
                handleNavigateToComment,
                setReplyTexts,
              ),
            )}
          </>
        )}
      </div>
    </div>
  )
})

function renderComment(
  comment: (typeof commentsStore.comments)[0],
  replyTexts: Record<string, string>,
  handleAddReply: (id: string) => void,
  handleNavigateToComment: (from?: number, to?: number) => void,
  setReplyTexts: React.Dispatch<React.SetStateAction<Record<string, string>>>,
) {
  return (
    <div
      key={comment.id}
      style={{
        padding: "10px 16px",
        borderBottom: "1px solid #f0f0f0",
        opacity: comment.resolved ? 0.6 : 1,
      }}
    >
      {/* Comment header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 12 }}>{comment.author}</span>
        <div style={{ display: "flex", gap: 4 }}>
          {comment.from !== undefined && comment.to !== undefined && (
            <button
              type="button"
              onClick={() => handleNavigateToComment(comment.from, comment.to)}
              title="Navigate to comment"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                color: "#2ecc71",
              }}
            >
              Go to
            </button>
          )}
          <button
            type="button"
            onClick={() => commentsStore.resolveComment(comment.id)}
            title={comment.resolved ? "Unresolve" : "Resolve"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              color: comment.resolved ? "#f0ad4e" : "#888",
            }}
          >
            {comment.resolved ? "Unresolve" : "Resolve"}
          </button>
          <button
            type="button"
            onClick={() => commentsStore.deleteComment(comment.id)}
            title="Delete"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              color: "#e74c3c",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Anchor text */}
      {comment.anchorText && (
        <div
          style={{
            fontSize: 11,
            color: "#888",
            fontStyle: "italic",
            marginBottom: 4,
            padding: "2px 6px",
            background: "#f5f5f5",
            borderRadius: 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          &ldquo;{comment.anchorText}&rdquo;
        </div>
      )}

      {/* Comment text */}
      <div style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 6, whiteSpace: "pre-wrap" }}>
        {comment.text}
      </div>

      {/* Timestamp */}
      <div style={{ fontSize: 11, color: "#aaa", marginBottom: 4 }}>
        {comment.timestamp.toLocaleString()}
      </div>

      {/* Replies */}
      {comment.replies.map((reply) => (
        <div
          key={reply.id}
          style={{
            marginLeft: 16,
            padding: "6px 10px",
            background: "#f8f9fa",
            borderRadius: 6,
            marginBottom: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 2,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 11 }}>{reply.author}</span>
            <button
              type="button"
              onClick={() => commentsStore.deleteReply(comment.id, reply.id)}
              title="Delete reply"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                color: "#e74c3c",
                lineHeight: 1,
                padding: 0,
              }}
            >
              &times;
            </button>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.3 }}>{reply.text}</div>
          <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>
            {reply.timestamp.toLocaleString()}
          </div>
        </div>
      ))}

      {/* Reply input */}
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        <input
          type="text"
          value={replyTexts[comment.id] ?? ""}
          onChange={(e) => setReplyTexts((prev) => ({ ...prev, [comment.id]: e.target.value }))}
          placeholder="Reply\u2026"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleAddReply(comment.id)
            }
          }}
          style={{
            flex: 1,
            padding: "4px 8px",
            border: "1px solid #ddd",
            borderRadius: 4,
            fontSize: 12,
            fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          onClick={() => handleAddReply(comment.id)}
          disabled={!replyTexts[comment.id]?.trim()}
          style={{
            padding: "4px 10px",
            background: "#3498db",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 11,
            opacity: !replyTexts[comment.id]?.trim() ? 0.5 : 1,
          }}
        >
          Reply
        </button>
      </div>
    </div>
  )
}

export { ObservedCommentsPanel as CommentsPanel }
