import { describe, expect, it } from "vitest"
import {
  type CreateSessionResponse,
  type CursorPosition,
  type DeleteOperation,
  type EditOperation,
  type EditorSession,
  type InsertOperation,
  type JoinSessionResponse,
  type Participant,
  createDeleteOp,
  createInsertOp,
  isRemoteMessage,
  parseMessage,
} from "../src/protocol"

describe("EditOperation types", () => {
  it("should match the server's EditOperation shape for insert", () => {
    const op: InsertOperation = {
      session_id: "sess-1",
      user_id: "user-1",
      revision: 0,
      type: "insert",
      position: 5,
      length: 0,
      content: "Hello",
      timestamp: "2026-04-18T00:00:00+00:00",
    }
    expect(op.type).toBe("insert")
    expect(op.content).toBe("Hello")
    expect(op.position).toBe(5)
    expect(op.length).toBe(0)
  })

  it("should match the server's EditOperation shape for delete", () => {
    const op: DeleteOperation = {
      session_id: "sess-1",
      user_id: "user-1",
      revision: 0,
      type: "delete",
      position: 5,
      length: 3,
      content: null,
      timestamp: "2026-04-18T00:00:00+00:00",
    }
    expect(op.type).toBe("delete")
    expect(op.content).toBeNull()
    expect(op.position).toBe(5)
    expect(op.length).toBe(3)
  })
})

describe("createInsertOp", () => {
  it("should create an insert operation with defaults", () => {
    const op = createInsertOp({
      session_id: "sess-1",
      user_id: "user-1",
      position: 10,
      text: "world",
    })
    expect(op.type).toBe("insert")
    expect(op.position).toBe(10)
    expect(op.content).toBe("world")
    expect(op.length).toBe(0)
    expect(op.revision).toBe(0)
    expect(op.timestamp).toBeDefined()
    expect(typeof op.timestamp).toBe("string")
  })
})

describe("createDeleteOp", () => {
  it("should create a delete operation with defaults", () => {
    const op = createDeleteOp({
      session_id: "sess-1",
      user_id: "user-1",
      position: 5,
      length: 3,
    })
    expect(op.type).toBe("delete")
    expect(op.position).toBe(5)
    expect(op.length).toBe(3)
    expect(op.content).toBeNull()
  })
})

describe("parseMessage", () => {
  it("should parse a valid insert message", () => {
    const json = JSON.stringify({
      session_id: "s1",
      user_id: "u1",
      revision: 0,
      type: "insert",
      position: 0,
      length: 0,
      content: "Hi",
      timestamp: "2026-04-18T00:00:00+00:00",
    })
    const result = parseMessage(json)
    expect(result).not.toBeNull()
    expect(result?.type).toBe("insert")
    expect(result?.content).toBe("Hi")
  })

  it("should parse a valid delete message", () => {
    const json = JSON.stringify({
      session_id: "s1",
      user_id: "u1",
      revision: 0,
      type: "delete",
      position: 3,
      length: 2,
      content: null,
      timestamp: "2026-04-18T00:00:00+00:00",
    })
    const result = parseMessage(json)
    expect(result).not.toBeNull()
    expect(result?.type).toBe("delete")
    expect(result?.length).toBe(2)
  })

  it("should return null for invalid JSON", () => {
    const result = parseMessage("not json")
    expect(result).toBeNull()
  })

  it("should return null for valid JSON without type field", () => {
    const result = parseMessage('{"foo": "bar"}')
    expect(result).toBeNull()
  })

  it("should return null for unknown op type", () => {
    const result = parseMessage('{"type": "transpose", "position": 0}')
    expect(result).toBeNull()
  })
})

describe("isRemoteMessage", () => {
  it("should return true when author differs from current user", () => {
    const op: EditOperation = {
      session_id: "s1",
      user_id: "other-user",
      revision: 0,
      type: "insert",
      position: 0,
      length: 0,
      content: "x",
      timestamp: "2026-04-18T00:00:00+00:00",
    }
    expect(isRemoteMessage(op, "my-user")).toBe(true)
  })

  it("should return false when author matches current user", () => {
    const op: EditOperation = {
      session_id: "s1",
      user_id: "my-user",
      revision: 0,
      type: "insert",
      position: 0,
      length: 0,
      content: "x",
      timestamp: "2026-04-18T00:00:00+00:00",
    }
    expect(isRemoteMessage(op, "my-user")).toBe(false)
  })
})

describe("Server response types", () => {
  it("should accept CreateSessionResponse shape", () => {
    const resp: CreateSessionResponse = {
      session_id: "uuid-here",
      document_id: "doc-123",
      message: "Session created.",
    }
    expect(resp.session_id).toBe("uuid-here")
  })

  it("should accept JoinSessionResponse with participants", () => {
    const participant: Participant = {
      user_id: "u1",
      username: "alice",
      color: "#E74C3C",
      cursor_position: null,
    }
    const resp: JoinSessionResponse = {
      session_id: "uuid-here",
      participants: [participant],
      message: "Joined.",
    }
    expect(resp.participants).toHaveLength(1)
    expect(resp.participants[0].color).toBe("#E74C3C")
  })

  it("should accept EditorSession with cursor_position object", () => {
    const cursor: CursorPosition = { page: 1, x: 100.5, y: 200.3 }
    const participant: Participant = {
      user_id: "u1",
      username: "alice",
      color: "#3498DB",
      cursor_position: cursor,
    }
    const session: EditorSession = {
      session_id: "s1",
      document_id: "d1",
      created_at: "2026-04-18T00:00:00+00:00",
      last_activity: "2026-04-18T00:00:00+00:00",
      participants: [participant],
    }
    expect(session.participants[0].cursor_position?.x).toBe(100.5)
  })
})
