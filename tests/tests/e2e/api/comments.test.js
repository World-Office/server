/**
 * Comments E2E Tests
 *
 * Tests the full comment lifecycle through the storage-service REST API:
 * - Creating comments with @agent mentions
 * - Listing comments with threaded replies
 * - Adding replies
 * - Resolving comments
 * - Mention discovery via /mentions/{agent_name}
 */
"use strict"

const { describe, test, expect, beforeAll } = require("@jest/globals")
const axios = require("axios")
const config = require("../../setup")

const SS_URL = config.storageServiceUrl

let serviceAvailable = false
let documentId = null

beforeAll(async () => {
  try {
    const response = await axios.get(`${SS_URL}/health`, { timeout: 5000 })
    serviceAvailable = response.status === 200
  } catch {
    serviceAvailable = false
  }
})

/**
 * Helper: create a document and return its ID.
 */
async function createDocument(name) {
  const body = {
    name,
    content_type: "text/plain",
    data: "Hello, World Office!",
  }
  const response = await axios.post(`${SS_URL}/files`, body, { timeout: 10000 })
  return response.data.file.id
}

describe("Comments API", () => {
  if (!serviceAvailable) {
    test.skip("storage-service is not available in this stack", () => {})
    return
  }

  describe("Full Comment Lifecycle", () => {
    let topCommentId = null
    let replyId = null
    const agentName = "test-bot"

    test("0. Setup: create a document", async () => {
      documentId = await createDocument("e2e-comment-test-doc")
      expect(documentId).toBeDefined()
      expect(typeof documentId).toBe("string")
      console.log(`📄 Document ID: ${documentId}`)
    })

    test("1. POST /documents/{id}/comments — create a top-level comment with @agent mention", async () => {
      const body = {
        author_id: "e2e-user-1",
        author_name: "E2E User",
        text: `This needs review cc @${agentName}`,
      }
      const response = await axios.post(
        `${SS_URL}/documents/${documentId}/comments`,
        body,
        { timeout: 10000 },
      )
      expect(response.status).toBe(201)
      expect(response.data).toHaveProperty("id")
      expect(response.data).toHaveProperty("document_id", documentId)
      expect(response.data.author_name).toBe("E2E User")
      expect(response.data.text).toContain(`@${agentName}`)
      expect(response.data.resolved).toBe(false)
      expect(response.data.parent_id).toBeNull()
      // Mentions should be auto-extracted
      expect(JSON.parse(response.data.mentions)).toEqual([agentName])
      topCommentId = response.data.id
      console.log(`💬 Created comment: ${topCommentId}`)
    })

    test("2. POST /documents/{id}/comments — create a second comment (no mention)", async () => {
      const body = {
        author_id: "e2e-user-1",
        author_name: "E2E User",
        text: "Just a note",
      }
      const response = await axios.post(
        `${SS_URL}/documents/${documentId}/comments`,
        body,
        { timeout: 10000 },
      )
      expect(response.status).toBe(201)
      expect(JSON.parse(response.data.mentions)).toEqual([])
    })

    test("3. GET /documents/{id}/comments — list top-level comments with threaded replies", async () => {
      const response = await axios.get(
        `${SS_URL}/documents/${documentId}/comments`,
        { timeout: 10000 },
      )
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("comments")
      expect(Array.isArray(response.data.comments)).toBe(true)
      expect(response.data.comments.length).toBeGreaterThanOrEqual(2)
      expect(response.data).toHaveProperty("count")
      expect(response.data.count).toBeGreaterThanOrEqual(2)
      console.log(`📋 ${response.data.comments.length} top-level comments, total: ${response.data.count}`)
    })

    test("4. POST /comments/{id}/replies — add a reply to the first comment", async () => {
      const body = {
        author_id: "e2e-user-2",
        author_name: "Reviewer Bot",
        text: "Looks good, approved!",
      }
      const response = await axios.post(
        `${SS_URL}/comments/${topCommentId}/replies`,
        body,
        { timeout: 10000 },
      )
      expect(response.status).toBe(201)
      expect(response.data.parent_id).toBe(topCommentId)
      expect(response.data.author_name).toBe("Reviewer Bot")
      replyId = response.data.id
      console.log(`↩️ Reply ID: ${replyId}`)
    })

    test("5. GET /documents/{id}/comments — reply appears nested under parent", async () => {
      const response = await axios.get(
        `${SS_URL}/documents/${documentId}/comments`,
        { timeout: 10000 },
      )
      expect(response.status).toBe(200)
      const parentComment = response.data.comments.find((c) => c.id === topCommentId)
      expect(parentComment).toBeDefined()
      expect(parentComment.replies).toBeDefined()
      expect(Array.isArray(parentComment.replies)).toBe(true)
      expect(parentComment.replies.length).toBeGreaterThanOrEqual(1)
      expect(parentComment.replies[0].id).toBe(replyId)
      console.log(`✅ Reply appears threaded under parent: ${parentComment.replies[0].author_name}`)
    })

    test("6. POST /comments/{id}/resolve — resolve the first comment", async () => {
      const response = await axios.post(
        `${SS_URL}/comments/${topCommentId}/resolve`,
        {},
        { timeout: 10000 },
      )
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("success", true)
      console.log(`✅ Comment ${topCommentId} resolved`)

      // Verify it's resolved
      const listResponse = await axios.get(
        `${SS_URL}/documents/${documentId}/comments`,
        { timeout: 10000 },
      )
      const resolvedComment = listResponse.data.comments.find((c) => c.id === topCommentId)
      expect(resolvedComment.resolved).toBe(true)
    })

    test("7. GET /comments/{id}/replies — verify replies are still accessible", async () => {
      // Replies to a resolved comment should still exist
      const response = await axios.get(
        `${SS_URL}/documents/${documentId}/comments`,
        { timeout: 10000 },
      )
      const parentComment = response.data.comments.find((c) => c.id === topCommentId)
      expect(parentComment.replies.length).toBeGreaterThanOrEqual(1)
    })

    test("8. GET /mentions/{agent_name} — list comments mentioning the agent", async () => {
      const response = await axios.get(
        `${SS_URL}/mentions/${agentName}`,
        { timeout: 10000 },
      )
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty("comments")
      expect(Array.isArray(response.data.comments)).toBe(true)
      // The comment was resolved, so it should no longer appear in unresolved mentions
      // But we can check the mention was parsed
      console.log(`📢 Mentions for @${agentName}: ${response.data.comments.length} unresolved comments`)
    })

    test("9. GET /mentions/{non_existent_agent} — returns empty array", async () => {
      const response = await axios.get(
        `${SS_URL}/mentions/no-one-here`,
        { timeout: 10000 },
      )
      expect(response.status).toBe(200)
      expect(response.data.comments).toEqual([])
      expect(response.data.count).toBe(0)
    })

    test("10. Cleanup: delete the test document", async () => {
      const response = await axios.delete(
        `${SS_URL}/files/${documentId}`,
        { timeout: 10000 },
      )
      expect(response.status).toBe(200)
      console.log(`🗑️ Deleted test document: ${documentId}`)
    })
  })

  describe("Error Handling", () => {
    test("POST /documents/{nonexistent}/comments — returns 500 for missing document", async () => {
      try {
        await axios.post(
          `${SS_URL}/documents/no-such-doc/comments`,
          { author_id: "u", author_name: "U", text: "test" },
          { timeout: 5000 },
        )
        // If it somehow succeeds, that's unexpected
        expect(false).toBe(true)
      } catch (err) {
        expect(err.response).toBeDefined()
        expect(err.response.status).toBeGreaterThanOrEqual(400)
      }
    })

    test("POST /documents/{id}/comments — rejects missing required fields", async () => {
      try {
        await axios.post(
          `${SS_URL}/documents/test-id/comments`,
          { text: "missing author" },
          { timeout: 5000 },
        )
        expect(false).toBe(true)
      } catch (err) {
        expect(err.response).toBeDefined()
        expect(err.response.status).toBeGreaterThanOrEqual(400)
      }
    })
  })
})
