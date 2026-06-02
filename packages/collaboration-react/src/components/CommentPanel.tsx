import { useState } from "react"
import type { CollabComment } from "@world-office/editor-stores"
import { CommentInput } from "./CommentInput"
import { CommentThread } from "./CommentThread"

export interface CommentPanelProps {
  comments: CollabComment[]
  currentUserId: string
  onAddComment: (text: string) => void
  onResolveComment: (commentId: string) => void
  onReplyToComment: (commentId: string, text: string) => void
  agentNames?: string[]
  isOpen: boolean
  onToggle: () => void
}

export function CommentPanel({
  comments,
  currentUserId,
  onAddComment,
  onResolveComment,
  onReplyToComment,
  agentNames,
  isOpen,
  onToggle,
}: CommentPanelProps) {
  const [activeTab, setActiveTab] = useState<"all" | "resolved">("all")

  const filteredComments = comments.filter((c) => {
    if (activeTab === "all") return !c.resolved
    return c.resolved
  })

  const unresolvedCount = comments.filter((c) => !c.resolved).length

  return (
    <>
      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        title={isOpen ? "Close comments" : `Open comments (${unresolvedCount})`}
        style={{
          padding: "6px 10px",
          border: "none",
          background: isOpen ? "#1976d2" : "transparent",
          color: isOpen ? "#fff" : "#333",
          cursor: "pointer",
          fontSize: 14,
          borderRadius: 4,
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        💬
        {unresolvedCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "#e53935",
              color: "#fff",
              borderRadius: 10,
              padding: "1px 5px",
              fontSize: 10,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            {unresolvedCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: "100%",
            width: 320,
            height: "100%",
            background: "#f5f5f5",
            borderLeft: "1px solid #ddd",
            boxShadow: "-2px 0 8px rgba(0,0,0,0.08)",
            display: "flex",
            flexDirection: "column",
            zIndex: 100,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid #ddd",
              background: "#fff",
              fontWeight: 600,
              fontSize: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Comments</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                style={{
                  padding: "2px 8px",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 11,
                  background: activeTab === "all" ? "#1976d2" : "transparent",
                  color: activeTab === "all" ? "#fff" : "#666",
                }}
              >
                Active ({unresolvedCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("resolved")}
                style={{
                  padding: "2px 8px",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 11,
                  background: activeTab === "resolved" ? "#1976d2" : "transparent",
                  color: activeTab === "resolved" ? "#fff" : "#666",
                }}
              >
                Resolved
              </button>
            </div>
          </div>

          {/* Comment list */}
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {filteredComments.length === 0 && (
              <p style={{ textAlign: "center", color: "#999", fontSize: 13, marginTop: 32 }}>
                {activeTab === "all" ? "No active comments" : "No resolved comments"}
              </p>
            )}
            {filteredComments.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                isCurrentUser={comment.userId === currentUserId}
                onResolve={onResolveComment}
                onReply={onReplyToComment}
                agentNames={agentNames}
              />
            ))}
          </div>

          {/* New comment input */}
          <div style={{ padding: "8px 12px", borderTop: "1px solid #ddd", background: "#fff" }}>
            <CommentInput
              onSubmit={onAddComment}
              placeholder="Add a comment... (@name to mention)"
              agentNames={agentNames}
            />
          </div>
        </div>
      )}
    </>
  )
}
