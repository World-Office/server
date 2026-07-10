import { CommentPanel } from "@world-office/collaboration-react"
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { collaborationStore, collabSendCommentRef, currentUser } from "../../lib/collaboration"
import { documentStore } from "../../stores/DocumentStore"

interface CommentsPanelProps {
  style?: React.CSSProperties
}

function CommentsPanelInner({ style }: CommentsPanelProps): JSX.Element {
  const isOpen = documentStore.activeLeftPanel === "comments"

  const handleAddComment = (text: string) => {
    const comment = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      userName: currentUser.username,
      text,
      timestamp: Date.now(),
      resolved: false,
      replies: [],
    }
    collaborationStore.addComment(comment)
    collabSendCommentRef.send?.({
      type: "added",
      comment_id: comment.id,
      document_id: documentStore.filePath ?? "default",
      parent_id: null,
      author_id: currentUser.id,
      author_name: currentUser.username,
      text,
      resolved: false,
      mentions: "",
      created_at: new Date().toISOString(),
    })
  }

  const handleResolveComment = (commentId: string) => {
    collaborationStore.resolveComment(commentId)
    collabSendCommentRef.send?.({
      type: "resolved",
      comment_id: commentId,
      document_id: documentStore.filePath ?? "default",
      parent_id: null,
      author_id: currentUser.id,
      author_name: currentUser.username,
      text: "",
      resolved: true,
      mentions: "",
      created_at: new Date().toISOString(),
    })
  }

  const handleReplyToComment = (commentId: string, text: string) => {
    const reply = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      userName: currentUser.username,
      text,
      timestamp: Date.now(),
      resolved: false,
      replies: [],
    }
    collaborationStore.addReply(commentId, reply)
    collabSendCommentRef.send?.({
      type: "added",
      comment_id: reply.id,
      document_id: documentStore.filePath ?? "default",
      parent_id: commentId,
      author_id: currentUser.id,
      author_name: currentUser.username,
      text,
      resolved: false,
      mentions: "",
      created_at: new Date().toISOString(),
    })
  }

  const handleToggle = () => {
    documentStore.toggleLeftPanel("comments")
  }

  return (
    <div className="de-comments-panel" style={style}>
      <CommentPanel
        comments={collaborationStore.comments}
        currentUserId={currentUser.id}
        isOpen={isOpen}
        onToggle={handleToggle}
        onAddComment={handleAddComment}
        onResolveComment={handleResolveComment}
        onReplyToComment={handleReplyToComment}
      />
    </div>
  )
}

export const CommentsPanel = observer(CommentsPanelInner)
