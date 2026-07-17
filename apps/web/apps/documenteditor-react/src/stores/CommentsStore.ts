import { makeAutoObservable } from "mobx"

export interface CommentData {
  id: string
  author: string
  text: string
  timestamp: Date
  resolved: boolean
  replies: CommentReply[]
  /** The text range anchor (from/to positions in the document) */
  from?: number
  to?: number
  /** The selected text that was commented on */
  anchorText?: string
}

export interface CommentReply {
  id: string
  author: string
  text: string
  timestamp: Date
}

export class CommentsStore {
  comments: CommentData[] = []

  constructor() {
    makeAutoObservable(this)
  }

  addComment(comment: Omit<CommentData, "id" | "timestamp" | "resolved" | "replies">): void {
    this.comments.push({
      ...comment,
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date(),
      resolved: false,
      replies: [],
    })
  }

  addReply(commentId: string, reply: Omit<CommentReply, "id" | "timestamp">): void {
    const comment = this.comments.find((c) => c.id === commentId)
    if (!comment) return
    comment.replies.push({
      ...reply,
      id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date(),
    })
  }

  resolveComment(commentId: string): void {
    const comment = this.comments.find((c) => c.id === commentId)
    if (comment) {
      comment.resolved = !comment.resolved
    }
  }

  deleteComment(commentId: string): void {
    const idx = this.comments.findIndex((c) => c.id === commentId)
    if (idx >= 0) {
      this.comments.splice(idx, 1)
    }
  }

  deleteReply(commentId: string, replyId: string): void {
    const comment = this.comments.find((c) => c.id === commentId)
    if (!comment) return
    const idx = comment.replies.findIndex((r) => r.id === replyId)
    if (idx >= 0) {
      comment.replies.splice(idx, 1)
    }
  }

  get activeCount(): number {
    return this.comments.filter((c) => !c.resolved).length
  }

  get allComments(): CommentData[] {
    return [...this.comments]
  }
}

export const commentsStore = new CommentsStore()
