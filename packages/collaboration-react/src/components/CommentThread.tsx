import { useState } from "react"
import type { CollabComment } from "@world-office/editor-stores"
import { CommentInput } from "./CommentInput"

export interface CommentThreadProps {
  comment: CollabComment
  isCurrentUser: boolean
  onResolve: (commentId: string) => void
  onReply: (commentId: string, text: string) => void
  agentNames?: string[]
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString()
}

export function CommentThread({
  comment,
  isCurrentUser,
  onResolve,
  onReply,
  agentNames,
}: CommentThreadProps) {
  const [showReply, setShowReply] = useState(false)

  return (
    <div
      style={{
        padding: "8px 12px",
        borderLeft: `3px solid ${comment.resolved ? "#8bc34a" : "#1976d2"}`,
        marginBottom: 8,
        background: comment.resolved ? "#f9f9f9" : "#fff",
        borderRadius: "0 6px 6px 0",
      }}
    >
      {/* Comment header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{comment.userName}</span>
          {isCurrentUser && (
            <span style={{ fontSize: 11, color: "#888" }}>(you)</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#999" }}>{formatTime(comment.timestamp)}</span>
          {comment.resolved && (
            <span style={{ fontSize: 11, color: "#8bc34a" }}>Resolved</span>
          )}
        </div>
      </div>

      {/* Comment text */}
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
        {comment.text.split(/(@\w+)/g).map((part, i) =>
          part.startsWith("@") ? (
            <span key={i} style={{ color: "#1976d2", fontWeight: 500 }}>{part}</span>
          ) : (
            part
          )
        )}
      </p>

      {/* Actions row */}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {!comment.resolved && onResolve && (
          <button
            type="button"
            onClick={() => onResolve(comment.id)}
            style={{
              padding: "2px 8px",
              border: "1px solid #8bc34a",
              borderRadius: 4,
              background: "transparent",
              cursor: "pointer",
              fontSize: 11,
              color: "#558b2f",
            }}
          >
            Resolve
          </button>
        )}
        {!showReply && (
          <button
            type="button"
            onClick={() => setShowReply(true)}
            style={{
              padding: "2px 8px",
              border: "1px solid #ccc",
              borderRadius: 4,
              background: "transparent",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            Reply
          </button>
        )}
      </div>

      {/* Reply input */}
      {showReply && (
        <div style={{ marginTop: 8 }}>
          <CommentInput
            onSubmit={(text) => {
              onReply(comment.id, text)
              setShowReply(false)
            }}
            placeholder="Write a reply..."
            agentNames={agentNames}
            onCancel={() => setShowReply(false)}
          />
        </div>
      )}

      {/* Nested replies */}
      {comment.replies.length > 0 && (
        <div style={{ marginTop: 8, marginLeft: 12, borderLeft: "1px solid #e0e0e0", paddingLeft: 8 }}>
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              isCurrentUser={false}
              onResolve={onResolve}
              onReply={onReply}
              agentNames={agentNames}
            />
          ))}
        </div>
      )}
    </div>
  )
}
