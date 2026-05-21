// CollaborationStore — users, comments, chat, co-editing state

import { makeAutoObservable } from "mobx"

export interface CollabUser {
  id: string
  name: string
  color: string
  isCurrentUser: boolean
}

export interface CollabComment {
  id: string
  userId: string
  userName: string
  text: string
  timestamp: number
  resolved: boolean
  replies: CollabComment[]
}

export class CollaborationStore {
  isConnected = false
  users: CollabUser[] = []
  comments: CollabComment[] = []
  isCommentMode = false
  currentUser: CollabUser | null = null
  remoteSelections: Map<string, { page: number; start: number; end: number }> = new Map()

  connectionStatus: "disconnected" | "connecting" | "connected" | "reconnecting" = "disconnected"
  sessionId: string | null = null
  remoteCursors: Map<string, { page: number; x: number; y: number }> = new Map()

  constructor() {
    makeAutoObservable(this)
  }

  setConnected(connected: boolean): void {
    this.isConnected = connected
  }

  setConnectionStatus(status: "disconnected" | "connecting" | "connected" | "reconnecting"): void {
    this.connectionStatus = status
    this.isConnected = status === "connected"
  }

  setSessionId(id: string | null): void {
    this.sessionId = id
  }

  updateRemoteCursor(userId: string, cursor: { page: number; x: number; y: number }): void {
    this.remoteCursors.set(userId, cursor)
  }

  removeRemoteCursor(userId: string): void {
    this.remoteCursors.delete(userId)
  }

  updateRemoteSelection(userId: string, selection: { page: number; start: number; end: number }): void {
    this.remoteSelections.set(userId, selection)
  }

  removeRemoteSelection(userId: string): void {
    this.remoteSelections.delete(userId)
  }

  setUsers(users: CollabUser[]): void {
    this.users = users
    this.currentUser = users.find((u) => u.isCurrentUser) ?? null
  }

  addUser(user: CollabUser): void {
    if (!this.users.some((u) => u.id === user.id)) {
      this.users.push(user)
    }
  }

  removeUser(userId: string): void {
    this.users = this.users.filter((u) => u.id !== userId)
  }

  setComments(comments: CollabComment[]): void {
    this.comments = comments
  }

  addComment(comment: CollabComment): void {
    this.comments.push(comment)
  }

  resolveComment(commentId: string): void {
    const comment = this.comments.find((c) => c.id === commentId)
    if (comment) comment.resolved = true
  }

  addReply(commentId: string, reply: CollabComment): void {
    const comment = this.comments.find((c) => c.id === commentId)
    if (comment) comment.replies.push(reply)
  }

  setCommentMode(enabled: boolean): void {
    this.isCommentMode = enabled
  }

  reset(): void {
    this.isConnected = false
    this.users = []
    this.comments = []
    this.isCommentMode = false
    this.currentUser = null
    this.connectionStatus = "disconnected"
    this.sessionId = null
    this.remoteCursors.clear()
  }
}