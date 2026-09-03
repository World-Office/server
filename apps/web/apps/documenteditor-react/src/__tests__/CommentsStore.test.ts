// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { CommentsStore } from "../stores/CommentsStore"

// Helper: add a comment and return its generated id (addComment returns void).
function addCommentAndGetId(store: CommentsStore, author: string, text: string): string {
  store.addComment({ author, text })
  const comment = store.comments[store.comments.length - 1]
  expect(comment).toBeDefined()
  return comment.id
}

describe("CommentsStore", () => {
  describe("instantiation", () => {
    it("initializes with empty comments array", () => {
      const store = new CommentsStore()
      expect(store.comments).toEqual([])
    })

    it("has activeCount getter returning 0 initially", () => {
      const store = new CommentsStore()
      expect(store.activeCount).toBe(0)
    })

    it("has allComments getter returning empty array", () => {
      const store = new CommentsStore()
      expect(store.allComments).toEqual([])
    })
  })

  describe("addComment", () => {
    it("adds a comment with auto-generated id, timestamp, resolved=false, empty replies", () => {
      const store = new CommentsStore()
      store.addComment({
        author: "Alice",
        text: "This is a comment",
        from: 10,
        to: 20,
        anchorText: "selected text",
      })

      expect(store.comments).toHaveLength(1)
      const comment = store.comments[0]

      expect(comment.id).toBeDefined()
      expect(comment.id).toMatch(/^cmt-\d+-[a-z0-9]{4}$/)
      expect(comment.timestamp).toBeInstanceOf(Date)
      expect(comment.resolved).toBe(false)
      expect(comment.replies).toEqual([])

      expect(comment.author).toBe("Alice")
      expect(comment.text).toBe("This is a comment")
      expect(comment.from).toBe(10)
      expect(comment.to).toBe(20)
      expect(comment.anchorText).toBe("selected text")
    })

    it("generates unique ids for multiple comments", () => {
      const store = new CommentsStore()

      store.addComment({ author: "Alice", text: "Comment 1" })
      store.addComment({ author: "Bob", text: "Comment 2" })
      store.addComment({ author: "Charlie", text: "Comment 3" })

      const ids = store.comments.map((c) => c.id)
      const uniqueIds = new Set(ids)
      expect(ids.length).toBe(uniqueIds.size)
      expect(ids.length).toBe(3)
    })

    it("preserves comment text verbatim including unicode characters", () => {
      const store = new CommentsStore()

      const unicodeText = "Hello 世界 🌍 مرحبا بالعالم"
      store.addComment({ author: "Alice", text: unicodeText })

      expect(store.comments[0].text).toBe(unicodeText)
    })

    it("only requires author and text; anchors and selection are optional", () => {
      const store = new CommentsStore()

      store.addComment({ author: "Alice", text: "Comment" })
      expect(store.comments[0].from).toBeUndefined()
      expect(store.comments[0].to).toBeUndefined()
      expect(store.comments[0].anchorText).toBeUndefined()
    })

    it("increments activeCount after adding a comment", () => {
      const store = new CommentsStore()

      store.addComment({ author: "Alice", text: "Comment 1" })
      expect(store.activeCount).toBe(1)

      store.addComment({ author: "Bob", text: "Comment 2" })
      expect(store.activeCount).toBe(2)
    })

    it("increments allComments length after adding a comment", () => {
      const store = new CommentsStore()

      store.addComment({ author: "Alice", text: "Comment 1" })
      expect(store.allComments).toHaveLength(1)

      store.addComment({ author: "Bob", text: "Comment 2" })
      expect(store.allComments).toHaveLength(2)
    })

    it("is observable: newly pushed comments are visible on the comments array", () => {
      const store = new CommentsStore()
      store.addComment({ author: "Alice", text: "First" })
      store.addComment({ author: "Bob", text: "Second" })
      expect(store.comments.map((c) => c.text)).toEqual(["First", "Second"])
    })
  })

  describe("resolveComment", () => {
    it("toggles resolved flag from false to true", () => {
      const store = new CommentsStore()
      const commentId = addCommentAndGetId(store, "Alice", "Comment")
      expect(store.comments[0].resolved).toBe(false)

      store.resolveComment(commentId)
      expect(store.comments[0].resolved).toBe(true)
    })

    it("toggles resolved flag from true back to false", () => {
      const store = new CommentsStore()
      const commentId = addCommentAndGetId(store, "Alice", "Comment")
      store.resolveComment(commentId)
      expect(store.comments[0].resolved).toBe(true)

      store.resolveComment(commentId)
      expect(store.comments[0].resolved).toBe(false)
    })

    it("does nothing when commentId does not exist", () => {
      const store = new CommentsStore()
      store.addComment({ author: "Alice", text: "Comment" })
      expect(() => store.resolveComment("non-existent-id")).not.toThrow()
      expect(store.comments).toHaveLength(1)
    })

    it("decrements activeCount when comment is resolved", () => {
      const store = new CommentsStore()

      store.addComment({ author: "Alice", text: "Comment 1" })
      store.addComment({ author: "Bob", text: "Comment 2" })
      expect(store.activeCount).toBe(2)

      store.resolveComment(store.comments[0].id)
      expect(store.activeCount).toBe(1)
    })

    it("activeCount counts only unresolved comments", () => {
      const store = new CommentsStore()

      store.addComment({ author: "Alice", text: "Comment 1" })
      store.addComment({ author: "Bob", text: "Comment 2" })
      store.addComment({ author: "Charlie", text: "Comment 3" })

      expect(store.activeCount).toBe(3)

      store.resolveComment(store.comments[0].id)
      expect(store.activeCount).toBe(2)

      store.resolveComment(store.comments[1].id)
      expect(store.activeCount).toBe(1)
    })
  })

  describe("deleteComment", () => {
    it("removes only the target comment by id", () => {
      const store = new CommentsStore()

      store.addComment({ author: "Alice", text: "Comment 1" })
      store.addComment({ author: "Bob", text: "Comment 2" })
      store.addComment({ author: "Charlie", text: "Comment 3" })

      const targetId = store.comments[1].id
      store.deleteComment(targetId)

      expect(store.comments).toHaveLength(2)
      expect(store.comments.map((c) => c.id)).not.toContain(targetId)
      expect(store.comments[0].text).toBe("Comment 1")
      expect(store.comments[1].text).toBe("Comment 3")
    })

    it("does nothing when commentId does not exist", () => {
      const store = new CommentsStore()
      store.addComment({ author: "Alice", text: "Comment" })
      expect(() => store.deleteComment("non-existent-id")).not.toThrow()
      expect(store.comments).toHaveLength(1)
    })

    it("updates activeCount when an active comment is deleted", () => {
      const store = new CommentsStore()

      store.addComment({ author: "Alice", text: "Comment 1" })
      store.addComment({ author: "Bob", text: "Comment 2" })
      store.addComment({ author: "Charlie", text: "Comment 3" })

      expect(store.activeCount).toBe(3)

      store.deleteComment(store.comments[0].id)
      expect(store.activeCount).toBe(2)
    })

    it("updates allComments length after deletion", () => {
      const store = new CommentsStore()

      store.addComment({ author: "Alice", text: "Comment 1" })
      store.addComment({ author: "Bob", text: "Comment 2" })

      expect(store.allComments).toHaveLength(2)

      store.deleteComment(store.comments[0].id)
      expect(store.allComments).toHaveLength(1)
    })
  })

  describe("addReply", () => {
    it("adds a reply to an existing comment with auto-generated id and timestamp", () => {
      const store = new CommentsStore()
      const commentId = addCommentAndGetId(store, "Alice", "Comment")

      store.addReply(commentId, { author: "Bob", text: "Reply text" })

      const comment = store.comments[0]
      expect(comment.replies).toHaveLength(1)
      expect(comment.replies[0].id).toBeDefined()
      expect(comment.replies[0].id).toMatch(/^reply-\d+-[a-z0-9]{4}$/)
      expect(comment.replies[0].timestamp).toBeInstanceOf(Date)
      expect(comment.replies[0].author).toBe("Bob")
      expect(comment.replies[0].text).toBe("Reply text")
    })

    it("does nothing when commentId does not exist", () => {
      const store = new CommentsStore()
      expect(() => store.addReply("non-existent-id", { author: "Bob", text: "Reply" })).not.toThrow()
      expect(store.comments).toHaveLength(0)
    })

    it("preserves reply text verbatim including unicode characters", () => {
      const store = new CommentsStore()
      const commentId = addCommentAndGetId(store, "Alice", "Comment")

      const unicodeText = "Привет мир 你好 🌍"
      store.addReply(commentId, { author: "Bob", text: unicodeText })

      expect(store.comments[0].replies[0].text).toBe(unicodeText)
    })

    it("generates unique ids for multiple replies on the same comment", () => {
      const store = new CommentsStore()
      const commentId = addCommentAndGetId(store, "Alice", "Comment")

      store.addReply(commentId, { author: "Bob", text: "Reply 1" })
      store.addReply(commentId, { author: "Charlie", text: "Reply 2" })

      const replyIds = store.comments[0].replies.map((r) => r.id)
      const uniqueReplyIds = new Set(replyIds)
      expect(replyIds.length).toBe(uniqueReplyIds.size)
      expect(replyIds.length).toBe(2)
    })
  })

  describe("deleteReply", () => {
    it("removes only the target reply by replyId", () => {
      const store = new CommentsStore()
      const commentId = addCommentAndGetId(store, "Alice", "Comment")
      store.addReply(commentId, { author: "Bob", text: "Reply 1" })
      store.addReply(commentId, { author: "Charlie", text: "Reply 2" })

      const targetReplyId = store.comments[0].replies[0].id
      store.deleteReply(commentId, targetReplyId)

      expect(store.comments[0].replies).toHaveLength(1)
      expect(store.comments[0].replies[0].id).not.toBe(targetReplyId)
      expect(store.comments[0].replies[0].text).toBe("Reply 2")
    })

    it("does nothing when commentId does not exist", () => {
      const store = new CommentsStore()
      expect(() => store.deleteReply("non-existent-id", "some-reply-id")).not.toThrow()
    })

    it("does nothing when replyId does not exist", () => {
      const store = new CommentsStore()
      const commentId = addCommentAndGetId(store, "Alice", "Comment")
      store.addReply(commentId, { author: "Bob", text: "Reply" })
      expect(() => store.deleteReply(commentId, "non-existent-reply-id")).not.toThrow()
      expect(store.comments[0].replies).toHaveLength(1)
    })
  })

  describe("computed counts track mutations", () => {
    it("activeCount tracks adds, resolves, and deletes correctly", () => {
      const store = new CommentsStore()

      // Start at 0
      expect(store.activeCount).toBe(0)

      // Add first comment: activeCount = 1
      store.addComment({ author: "Alice", text: "Comment 1" })
      expect(store.activeCount).toBe(1)

      // Add second comment: activeCount = 2
      store.addComment({ author: "Bob", text: "Comment 2" })
      expect(store.activeCount).toBe(2)

      // Resolve first comment: activeCount = 1
      const id1 = store.comments[0].id
      store.resolveComment(id1)
      expect(store.activeCount).toBe(1)

      // Add third comment: activeCount = 2
      store.addComment({ author: "Charlie", text: "Comment 3" })
      expect(store.activeCount).toBe(2)

      // Delete the resolved first comment: comments[1] and comments[2] remain active
      store.deleteComment(id1)
      expect(store.activeCount).toBe(2)

      // Resolve one remaining: activeCount = 1
      store.resolveComment(store.comments[0].id)
      expect(store.activeCount).toBe(1)

      // Resolve the last one: activeCount = 0
      store.resolveComment(store.comments[1].id)
      expect(store.activeCount).toBe(0)
    })

    it("allComments length tracks adds, resolves, and deletes correctly", () => {
      const store = new CommentsStore()

      expect(store.allComments).toHaveLength(0)

      store.addComment({ author: "Alice", text: "Comment 1" })
      expect(store.allComments).toHaveLength(1)

      store.addComment({ author: "Bob", text: "Comment 2" })
      expect(store.allComments).toHaveLength(2)

      store.resolveComment(store.comments[0].id)
      expect(store.allComments).toHaveLength(2) // resolve doesn't change length

      store.deleteComment(store.comments[0].id)
      expect(store.allComments).toHaveLength(1)
    })
  })

  describe("id uniqueness across comments and replies", () => {
    it("comment ids are unique across many comments in the store", () => {
      const store = new CommentsStore()

      for (let i = 0; i < 10; i++) {
        store.addComment({ author: `User ${i}`, text: `Comment ${i}` })
      }

      const commentIds = store.comments.map((c) => c.id)
      expect(commentIds.length).toBe(10)
      expect(new Set(commentIds).size).toBe(10)
    })

    it("reply ids are unique within each comment's replies", () => {
      const store = new CommentsStore()
      const commentId = addCommentAndGetId(store, "Alice", "Comment")

      for (let i = 0; i < 10; i++) {
        store.addReply(commentId, { author: `Replier ${i}`, text: `Reply ${i}` })
      }

      const replyIds = store.comments[0].replies.map((r) => r.id)
      expect(replyIds.length).toBe(10)
      expect(new Set(replyIds).size).toBe(10)
    })
  })
})
