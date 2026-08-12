/**
 * Tests for the collaboration-client module.
 * These tests verify that the frontend emits ModelOp (structured operations)
 * instead of plain text, matching the updated coauthoring-service wire protocol.
 */

import { describe, it, expect } from "vitest"
import {
  WIRE_SCHEMA_VERSION,
  textPath,
  tablePath,
  slidePath,
  sheetPath,
  createRange,
  textRange,
  createInsertOpEnvelope,
  createDeleteOpEnvelope,
  createReplaceOpEnvelope,
  createFormatOpEnvelope,
  createMoveOpEnvelope,
  serializeModelOpEnvelope,
  deserializeModelOpEnvelope,
  extractModelOp,
  modelOpToEnvelope,
  isLegacyOperation,
  isModelOpEnvelope,
  legacyToModelOpEnvelope,
  type Path,
  type Range,
  type ModelOp,
  type ModelOpEnvelope,
  type LegacyEditOperation,
} from "../src/collaboration-client"

// =============================================================================
// 1. Path type tests
// =============================================================================

describe("Path types", () => {
  describe("textPath", () => {
    it("should create a text path", () => {
      const path = textPath(3, 1, 14)
      expect(path).toEqual({ kind: "text", para: 3, run: 1, char: 14 })
    })

    it("should create a text path with zero indices", () => {
      const path = textPath(0, 0, 0)
      expect(path).toEqual({ kind: "text", para: 0, run: 0, char: 0 })
    })
  })

  describe("tablePath", () => {
    it("should create a table path", () => {
      const path = tablePath(0, 2, 1, 0, 0, 5)
      expect(path).toEqual({
        kind: "table",
        table: 0,
        row: 2,
        cell: 1,
        para: 0,
        run: 0,
        char: 5,
      })
    })
  })

  describe("slidePath", () => {
    it("should create a slide path", () => {
      const path = slidePath(1, 3, 0, 10)
      expect(path).toEqual({ kind: "slide", slide: 1, shape: 3, run: 0, char: 10 })
    })
  })

  describe("sheetPath", () => {
    it("should create a sheet path", () => {
      const path = sheetPath("Revenue", 10, 3)
      expect(path).toEqual({ kind: "sheet", sheet: "Revenue", row: 10, col: 3 })
    })

    it("should create a sheet path with different sheet name", () => {
      const path = sheetPath("Sheet1", 0, 0)
      expect(path).toEqual({ kind: "sheet", sheet: "Sheet1", row: 0, col: 0 })
    })
  })
})

// =============================================================================
// 2. Range type tests
// =============================================================================

describe("Range types", () => {
  describe("createRange", () => {
    it("should create a range from start and end paths", () => {
      const start = textPath(0, 0, 0)
      const end = textPath(0, 0, 5)
      const range = createRange(start, end)
      expect(range).toEqual({ start, end })
    })

    it("should create a range between different path types", () => {
      const start = textPath(0, 0, 0)
      const end = tablePath(0, 0, 0, 0, 0, 0)
      const range = createRange(start, end)
      expect(range).toEqual({ start, end })
    })
  })

  describe("textRange", () => {
    it("should create a text range within the same paragraph", () => {
      const range = textRange(0, 2, 10)
      expect(range).toEqual({
        start: { kind: "text", para: 0, run: 0, char: 2 },
        end: { kind: "text", para: 0, run: 0, char: 10 },
      })
    })

    it("should create a text range at position 0", () => {
      const range = textRange(1, 0, 0)
      expect(range).toEqual({
        start: { kind: "text", para: 1, run: 0, char: 0 },
        end: { kind: "text", para: 1, run: 0, char: 0 },
      })
    })

    it("should create a text range in a different paragraph", () => {
      const range = textRange(5, 0, 3)
      expect(range).toEqual({
        start: { kind: "text", para: 5, run: 0, char: 0 },
        end: { kind: "text", para: 5, run: 0, char: 3 },
      })
    })
  })
})

// =============================================================================
// 3. ModelOpEnvelope creation tests
// =============================================================================

describe("ModelOpEnvelope creation", () => {
  const commonParams = {
    sessionId: "test-session",
    userId: "user-1",
    revision: 1,
  }

  describe("createInsertOpEnvelope", () => {
    it("should create an insert envelope with correct fields", () => {
      const envelope = createInsertOpEnvelope({
        ...commonParams,
        at: textPath(0, 0, 5),
        content: "Hello",
      })

      expect(envelope.version).toBe(WIRE_SCHEMA_VERSION)
      expect(envelope.session_id).toBe("test-session")
      expect(envelope.user_id).toBe("user-1")
      expect(envelope.revision).toBe(1)
      expect(envelope.op).toBe("insert")
      expect(envelope.at).toEqual({ kind: "text", para: 0, run: 0, char: 5 })
      expect(envelope.content).toBe("Hello")
    })

    it("should include a timestamp", () => {
      const envelope = createInsertOpEnvelope({
        ...commonParams,
        at: textPath(0, 0, 0),
        content: "A",
      })

      expect(envelope.timestamp).toBeDefined()
      expect(typeof envelope.timestamp).toBe("string")
      expect(envelope.timestamp.length).toBeGreaterThan(0)
    })

    it("should work with table path", () => {
      const envelope = createInsertOpEnvelope({
        ...commonParams,
        at: tablePath(0, 0, 0, 0, 0, 0),
        content: "cell content",
      })

      expect(envelope.op).toBe("insert")
      expect(envelope.at).toEqual({
        kind: "table",
        table: 0,
        row: 0,
        cell: 0,
        para: 0,
        run: 0,
        char: 0,
      })
    })
  })

  describe("createDeleteOpEnvelope", () => {
    it("should create a delete envelope with correct fields", () => {
      const range = textRange(0, 2, 10)
      const envelope = createDeleteOpEnvelope({
        ...commonParams,
        range,
      })

      expect(envelope.version).toBe(WIRE_SCHEMA_VERSION)
      expect(envelope.op).toBe("delete")
      expect(envelope.range).toEqual(range)
    })

    it("should work with table range", () => {
      const range = createRange(
        tablePath(0, 0, 0, 0, 0, 0),
        tablePath(0, 0, 0, 0, 0, 5)
      )
      const envelope = createDeleteOpEnvelope({
        ...commonParams,
        range,
      })

      expect(envelope.op).toBe("delete")
      expect(envelope.range).toEqual(range)
    })
  })

  describe("createReplaceOpEnvelope", () => {
    it("should create a replace envelope with correct fields", () => {
      const envelope = createReplaceOpEnvelope({
        ...commonParams,
        at: textPath(0, 0, 3),
        content: "new",
      })

      expect(envelope.version).toBe(WIRE_SCHEMA_VERSION)
      expect(envelope.op).toBe("replace")
      expect(envelope.at).toEqual({ kind: "text", para: 0, run: 0, char: 3 })
      expect(envelope.content).toBe("new")
    })
  })

  describe("createFormatOpEnvelope", () => {
    it("should create a format envelope with correct fields", () => {
      const range = textRange(0, 0, 5)
      const attrs = { bold: true, italic: false, fontSize: 24 }
      const envelope = createFormatOpEnvelope({
        ...commonParams,
        range,
        attrs,
      })

      expect(envelope.version).toBe(WIRE_SCHEMA_VERSION)
      expect(envelope.op).toBe("format")
      expect(envelope.range).toEqual(range)
      expect(envelope.attrs).toEqual(attrs)
    })

    it("should work with empty attrs", () => {
      const range = textRange(0, 0, 5)
      const envelope = createFormatOpEnvelope({
        ...commonParams,
        range,
        attrs: {},
      })

      expect(envelope.op).toBe("format")
      expect(envelope.attrs).toEqual({})
    })

    it("should work with nested attrs", () => {
      const range = textRange(0, 0, 5)
      const attrs = {
        color: { r: 255, g: 0, b: 0 },
        style: { underline: "single", weight: "bold" },
      }
      const envelope = createFormatOpEnvelope({
        ...commonParams,
        range,
        attrs,
      })

      expect(envelope.attrs).toEqual(attrs)
    })
  })

  describe("createMoveOpEnvelope", () => {
    it("should create a move envelope with correct fields", () => {
      const from = textPath(0, 0, 0)
      const to = textPath(1, 0, 5)
      const envelope = createMoveOpEnvelope({
        ...commonParams,
        from,
        to,
      })

      expect(envelope.version).toBe(WIRE_SCHEMA_VERSION)
      expect(envelope.op).toBe("move")
      expect(envelope.from).toEqual(from)
      expect(envelope.to).toEqual(to)
    })
  })
})

// =============================================================================
// 4. Serialization tests
// =============================================================================

describe("Serialization", () => {
  describe("serializeModelOpEnvelope", () => {
    it("should serialize an insert envelope to JSON", () => {
      const envelope = createInsertOpEnvelope({
        sessionId: "session-1",
        userId: "user-1",
        revision: 1,
        at: textPath(0, 0, 0),
        content: "Hello",
      })
      const json = serializeModelOpEnvelope(envelope)

      const parsed = JSON.parse(json)
      expect(parsed.version).toBe(WIRE_SCHEMA_VERSION)
      expect(parsed.op).toBe("insert")
      expect(parsed.at.kind).toBe("text")
      expect(parsed.at.para).toBe(0)
      expect(parsed.content).toBe("Hello")
    })

    it("should serialize a delete envelope to JSON", () => {
      const envelope = createDeleteOpEnvelope({
        sessionId: "session-1",
        userId: "user-1",
        revision: 1,
        range: textRange(0, 2, 10),
      })
      const json = serializeModelOpEnvelope(envelope)

      const parsed = JSON.parse(json)
      expect(parsed.op).toBe("delete")
      expect(parsed.range.start.char).toBe(2)
      expect(parsed.range.end.char).toBe(10)
    })

    it("should serialize a format envelope to JSON", () => {
      const envelope = createFormatOpEnvelope({
        sessionId: "session-1",
        userId: "user-1",
        revision: 1,
        range: textRange(0, 0, 5),
        attrs: { bold: true },
      })
      const json = serializeModelOpEnvelope(envelope)

      const parsed = JSON.parse(json)
      expect(parsed.op).toBe("format")
      expect(parsed.attrs.bold).toBe(true)
    })

    it("should serialize a move envelope to JSON", () => {
      const envelope = createMoveOpEnvelope({
        sessionId: "session-1",
        userId: "user-1",
        revision: 1,
        from: textPath(0, 0, 0),
        to: textPath(1, 0, 5),
      })
      const json = serializeModelOpEnvelope(envelope)

      const parsed = JSON.parse(json)
      expect(parsed.op).toBe("move")
      expect(parsed.from.para).toBe(0)
      expect(parsed.to.para).toBe(1)
    })

    it("should serialize a replace envelope to JSON", () => {
      const envelope = createReplaceOpEnvelope({
        sessionId: "session-1",
        userId: "user-1",
        revision: 1,
        at: textPath(0, 0, 3),
        content: "replaced",
      })
      const json = serializeModelOpEnvelope(envelope)

      const parsed = JSON.parse(json)
      expect(parsed.op).toBe("replace")
      expect(parsed.content).toBe("replaced")
    })
  })

  describe("deserializeModelOpEnvelope", () => {
    it("should deserialize an insert envelope from JSON", () => {
      const json = JSON.stringify({
        version: WIRE_SCHEMA_VERSION,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "insert",
        at: { kind: "text", para: 0, run: 0, char: 5 },
        content: "Hello",
      })

      const envelope = deserializeModelOpEnvelope(json)
      expect(envelope).not.toBeNull()
      expect(envelope!.op).toBe("insert")
      expect(envelope!.content).toBe("Hello")
    })

    it("should deserialize a delete envelope from JSON", () => {
      const json = JSON.stringify({
        version: WIRE_SCHEMA_VERSION,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "delete",
        range: { start: { kind: "text", para: 0, run: 0, char: 2 }, end: { kind: "text", para: 0, run: 0, char: 10 } },
      })

      const envelope = deserializeModelOpEnvelope(json)
      expect(envelope).not.toBeNull()
      expect(envelope!.op).toBe("delete")
    })

    it("should return null for invalid JSON", () => {
      const envelope = deserializeModelOpEnvelope("not json")
      expect(envelope).toBeNull()
    })

    it("should return null for missing version", () => {
      const json = JSON.stringify({
        session_id: "session-1",
        op: "insert",
        at: { kind: "text", para: 0, run: 0, char: 0 },
        content: "A",
      })

      const envelope = deserializeModelOpEnvelope(json)
      expect(envelope).toBeNull()
    })

    it("should return null for wrong version", () => {
      const json = JSON.stringify({
        version: 999,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "insert",
        at: { kind: "text", para: 0, run: 0, char: 0 },
        content: "A",
      })

      const envelope = deserializeModelOpEnvelope(json)
      expect(envelope).toBeNull()
    })

    it("should return null for missing session_id", () => {
      const json = JSON.stringify({
        version: WIRE_SCHEMA_VERSION,
        user_id: "user-1",
        op: "insert",
        at: { kind: "text", para: 0, run: 0, char: 0 },
        content: "A",
      })

      const envelope = deserializeModelOpEnvelope(json)
      expect(envelope).toBeNull()
    })

    it("should return null for missing op", () => {
      const json = JSON.stringify({
        version: WIRE_SCHEMA_VERSION,
        session_id: "session-1",
        user_id: "user-1",
        at: { kind: "text", para: 0, run: 0, char: 0 },
        content: "A",
      })

      const envelope = deserializeModelOpEnvelope(json)
      expect(envelope).toBeNull()
    })
  })
})

// =============================================================================
// 5. ModelOp extraction tests
// =============================================================================

describe("ModelOp extraction", () => {
  describe("extractModelOp", () => {
    it("should extract insert ModelOp from envelope", () => {
      const envelope: ModelOpEnvelope = {
        version: WIRE_SCHEMA_VERSION,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "insert",
        at: textPath(0, 0, 5),
        content: "Hello",
      }

      const op = extractModelOp(envelope)
      expect(op).not.toBeNull()
      expect(op!.op).toBe("insert")
      if (op!.op === "insert") {
        expect(op!.at).toEqual(envelope.at)
        expect(op!.content).toBe(envelope.content)
      }
    })

    it("should extract delete ModelOp from envelope", () => {
      const range = textRange(0, 2, 10)
      const envelope: ModelOpEnvelope = {
        version: WIRE_SCHEMA_VERSION,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "delete",
        range,
      }

      const op = extractModelOp(envelope)
      expect(op).not.toBeNull()
      expect(op!.op).toBe("delete")
      if (op!.op === "delete") {
        expect(op!.range).toEqual(range)
      }
    })

    it("should extract format ModelOp from envelope", () => {
      const range = textRange(0, 0, 5)
      const envelope: ModelOpEnvelope = {
        version: WIRE_SCHEMA_VERSION,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "format",
        range,
        attrs: { bold: true },
      }

      const op = extractModelOp(envelope)
      expect(op).not.toBeNull()
      expect(op!.op).toBe("format")
      if (op!.op === "format") {
        expect(op!.range).toEqual(range)
        expect(op!.attrs).toEqual({ bold: true })
      }
    })

    it("should extract move ModelOp from envelope", () => {
      const from = textPath(0, 0, 0)
      const to = textPath(1, 0, 5)
      const envelope: ModelOpEnvelope = {
        version: WIRE_SCHEMA_VERSION,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "move",
        from,
        to,
      }

      const op = extractModelOp(envelope)
      expect(op).not.toBeNull()
      expect(op!.op).toBe("move")
      if (op!.op === "move") {
        expect(op!.from).toEqual(from)
        expect(op!.to).toEqual(to)
      }
    })

    it("should extract replace ModelOp from envelope", () => {
      const envelope: ModelOpEnvelope = {
        version: WIRE_SCHEMA_VERSION,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "replace",
        at: textPath(0, 0, 3),
        content: "replaced",
      }

      const op = extractModelOp(envelope)
      expect(op).not.toBeNull()
      expect(op!.op).toBe("replace")
    })

    it("should return null for incomplete insert envelope", () => {
      const envelope: ModelOpEnvelope = {
        version: WIRE_SCHEMA_VERSION,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "insert",
        // Missing: at, content
      }

      const op = extractModelOp(envelope)
      expect(op).toBeNull()
    })

    it("should return null for unknown op type", () => {
      const envelope: ModelOpEnvelope = {
        version: WIRE_SCHEMA_VERSION,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "unknown",
      }

      const op = extractModelOp(envelope)
      expect(op).toBeNull()
    })
  })
})

// =============================================================================
// 6. modelOpToEnvelope tests
// =============================================================================

describe("modelOpToEnvelope", () => {
  const sessionId = "session-1"
  const userId = "user-1"
  const revision = 1

  it("should convert insert ModelOp to envelope", () => {
    const op: ModelOp = {
      op: "insert",
      at: textPath(0, 0, 5),
      content: "Hello",
    }

    const envelope = modelOpToEnvelope(op, sessionId, userId, revision)
    expect(envelope.version).toBe(WIRE_SCHEMA_VERSION)
    expect(envelope.session_id).toBe(sessionId)
    expect(envelope.user_id).toBe(userId)
    expect(envelope.revision).toBe(revision)
    expect(envelope.op).toBe("insert")
    expect(envelope.at).toEqual(op.at)
    expect(envelope.content).toBe(op.content)
  })

  it("should convert delete ModelOp to envelope", () => {
    const op: ModelOp = {
      op: "delete",
      range: textRange(0, 2, 10),
    }

    const envelope = modelOpToEnvelope(op, sessionId, userId, revision)
    expect(envelope.op).toBe("delete")
    expect(envelope.range).toEqual(op.range)
  })

  it("should convert format ModelOp to envelope", () => {
    const op: ModelOp = {
      op: "format",
      range: textRange(0, 0, 5),
      attrs: { bold: true },
    }

    const envelope = modelOpToEnvelope(op, sessionId, userId, revision)
    expect(envelope.op).toBe("format")
    expect(envelope.range).toEqual(op.range)
    expect(envelope.attrs).toEqual(op.attrs)
  })

  it("should convert move ModelOp to envelope", () => {
    const op: ModelOp = {
      op: "move",
      from: textPath(0, 0, 0),
      to: textPath(1, 0, 5),
    }

    const envelope = modelOpToEnvelope(op, sessionId, userId, revision)
    expect(envelope.op).toBe("move")
    expect(envelope.from).toEqual(op.from)
    expect(envelope.to).toEqual(op.to)
  })

  it("should convert replace ModelOp to envelope", () => {
    const op: ModelOp = {
      op: "replace",
      at: textPath(0, 0, 3),
      content: "replaced",
    }

    const envelope = modelOpToEnvelope(op, sessionId, userId, revision)
    expect(envelope.op).toBe("replace")
    expect(envelope.at).toEqual(op.at)
    expect(envelope.content).toBe(op.content)
  })
})

// =============================================================================
// 7. Operation type detection tests
// =============================================================================

describe("Operation type detection", () => {
  describe("isLegacyOperation", () => {
    it("should return true for legacy insert operation", () => {
      const legacy: LegacyEditOperation = {
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        type: "insert",
        position: 5,
        length: 0,
        content: "Hello",
      }

      // Note: This function expects a Record<string, unknown> not a typed object
      // but we can test the behavior by converting
      expect(isLegacyOperation(legacy as unknown as Record<string, unknown>)).toBe(true)
    })

    it("should return true for legacy delete operation", () => {
      const legacy: LegacyEditOperation = {
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        type: "delete",
        position: 5,
        length: 3,
        content: null,
      }

      expect(isLegacyOperation(legacy as unknown as Record<string, unknown>)).toBe(true)
    })

    it("should return false for ModelOp envelope", () => {
      const envelope: ModelOpEnvelope = {
        version: WIRE_SCHEMA_VERSION,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "insert",
        at: textPath(0, 0, 5),
        content: "Hello",
      }

      expect(isLegacyOperation(envelope as unknown as Record<string, unknown>)).toBe(false)
    })

    it("should return false for other types", () => {
      expect(isLegacyOperation({ type: "format" } as Record<string, unknown>)).toBe(false)
      expect(isLegacyOperation({ type: "foo" } as Record<string, unknown>)).toBe(false)
    })
  })

  describe("isModelOpEnvelope", () => {
    it("should return true for ModelOp envelope", () => {
      const envelope: ModelOpEnvelope = {
        version: WIRE_SCHEMA_VERSION,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "insert",
        at: textPath(0, 0, 5),
        content: "Hello",
      }

      expect(isModelOpEnvelope(envelope as unknown as Record<string, unknown>)).toBe(true)
    })

    it("should return false for legacy operation", () => {
      const legacy: LegacyEditOperation = {
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        type: "insert",
        position: 5,
        length: 0,
        content: "Hello",
      }

      expect(isModelOpEnvelope(legacy as unknown as Record<string, unknown>)).toBe(false)
    })

    it("should return false for wrong version", () => {
      const envelope = {
        version: 999,
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        op: "insert",
        at: textPath(0, 0, 5),
        content: "Hello",
      }

      expect(isModelOpEnvelope(envelope as unknown as Record<string, unknown>)).toBe(false)
    })
  })
})

// =============================================================================
// 8. Legacy to ModelOp conversion tests
// =============================================================================

describe("Legacy to ModelOp conversion", () => {
  describe("legacyToModelOpEnvelope", () => {
    it("should convert legacy insert to ModelOp envelope", () => {
      const legacy: LegacyEditOperation = {
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        type: "insert",
        position: 5,
        length: 0,
        content: "Hello",
      }

      const envelope = legacyToModelOpEnvelope(legacy)
      expect(envelope.op).toBe("insert")
      expect(envelope.at).toEqual({ kind: "text", para: 0, run: 0, char: 5 })
      expect(envelope.content).toBe("Hello")
    })

    it("should convert legacy delete to ModelOp envelope", () => {
      const legacy: LegacyEditOperation = {
        session_id: "session-1",
        user_id: "user-1",
        revision: 1,
        timestamp: "2026-01-01T00:00:00Z",
        type: "delete",
        position: 5,
        length: 3,
        content: null,
      }

      const envelope = legacyToModelOpEnvelope(legacy)
      expect(envelope.op).toBe("delete")
      expect(envelope.range).toEqual({
        start: { kind: "text", para: 0, run: 0, char: 5 },
        end: { kind: "text", para: 0, run: 0, char: 8 },
      })
    })

    it("should preserve metadata", () => {
      const legacy: LegacyEditOperation = {
        session_id: "session-123",
        user_id: "user-456",
        revision: 42,
        timestamp: "2026-01-01T00:00:00Z",
        type: "insert",
        position: 10,
        length: 0,
        content: "Test",
      }

      const envelope = legacyToModelOpEnvelope(legacy)
      expect(envelope.session_id).toBe("session-123")
      expect(envelope.user_id).toBe("user-456")
      expect(envelope.revision).toBe(42)
      expect(envelope.version).toBe(WIRE_SCHEMA_VERSION)
    })
  })
})

// =============================================================================
// 9. Round-trip tests
// =============================================================================

describe("Round-trip tests", () => {
  it("should serialize and deserialize insert envelope", () => {
    const original = createInsertOpEnvelope({
      sessionId: "session-1",
      userId: "user-1",
      revision: 1,
      at: textPath(0, 0, 5),
      content: "Hello",
    })

    const json = serializeModelOpEnvelope(original)
    const deserialized = deserializeModelOpEnvelope(json)

    expect(deserialized).not.toBeNull()
    expect(deserialized!.op).toBe(original.op)
    expect(deserialized!.content).toBe(original.content)
  })

  it("should serialize and deserialize delete envelope with range", () => {
    const range = textRange(0, 2, 10)
    const original = createDeleteOpEnvelope({
      sessionId: "session-1",
      userId: "user-1",
      revision: 1,
      range,
    })

    const json = serializeModelOpEnvelope(original)
    const deserialized = deserializeModelOpEnvelope(json)

    expect(deserialized).not.toBeNull()
    expect(deserialized!.op).toBe("delete")
  })

  it("should serialize, deserialize, and extract ModelOp", () => {
    const op: ModelOp = {
      op: "format",
      range: textRange(0, 0, 5),
      attrs: { bold: true, color: "#FF0000" },
    }

    const envelope = modelOpToEnvelope(op, "session-1", "user-1", 1)
    const json = serializeModelOpEnvelope(envelope)
    const deserialized = deserializeModelOpEnvelope(json)
    const extracted = extractModelOp(deserialized!)

    expect(extracted).not.toBeNull()
    expect(extracted!.op).toBe("format")
    if (extracted!.op === "format") {
      expect(extracted!.range).toEqual(op.range)
      expect(extracted!.attrs).toEqual(op.attrs)
    }
  })

  it("should handle full round-trip for all op types", () => {
    const ops: ModelOp[] = [
      { op: "insert", at: textPath(0, 0, 0), content: "A" },
      { op: "delete", range: textRange(0, 0, 1) },
      { op: "replace", at: textPath(0, 0, 2), content: "B" },
      { op: "format", range: textRange(0, 3, 5), attrs: { bold: true } },
      { op: "move", from: textPath(0, 0, 6), to: textPath(0, 0, 10) },
    ]

    for (const op of ops) {
      const envelope = modelOpToEnvelope(op, "session-1", "user-1", 1)
      const json = serializeModelOpEnvelope(envelope)
      const deserialized = deserializeModelOpEnvelope(json)
      const extracted = extractModelOp(deserialized!)

      expect(extracted).not.toBeNull()
      expect(extracted!.op).toBe(op.op)
    }
  })
})

// =============================================================================
// 10. Edge case tests
// =============================================================================

describe("Edge cases", () => {
  it("should handle empty content in insert", () => {
    const envelope = createInsertOpEnvelope({
      sessionId: "session-1",
      userId: "user-1",
      revision: 1,
      at: textPath(0, 0, 0),
      content: "",
    })

    expect(envelope.content).toBe("")
    const op = extractModelOp(envelope)
    expect(op).not.toBeNull()
    if (op!.op === "insert") {
      expect(op!.content).toBe("")
    }
  })

  it("should handle empty attrs in format", () => {
    const envelope = createFormatOpEnvelope({
      sessionId: "session-1",
      userId: "user-1",
      revision: 1,
      range: textRange(0, 0, 5),
      attrs: {},
    })

    const op = extractModelOp(envelope)
    expect(op).not.toBeNull()
    if (op!.op === "format") {
      expect(Object.keys(op!.attrs).length).toBe(0)
    }
  })

  it("should handle same start and end path in range", () => {
    const range: Range = {
      start: textPath(0, 0, 5),
      end: textPath(0, 0, 5),
    }

    const envelope = createDeleteOpEnvelope({
      sessionId: "session-1",
      userId: "user-1",
      revision: 1,
      range,
    })

    const op = extractModelOp(envelope)
    expect(op).not.toBeNull()
    if (op!.op === "delete") {
      expect(op!.range).toEqual(range)
    }
  })

  it("should handle large character indices", () => {
    const envelope = createInsertOpEnvelope({
      sessionId: "session-1",
      userId: "user-1",
      revision: 1,
      at: textPath(0, 0, 1000000),
      content: "X",
    })

    const op = extractModelOp(envelope)
    expect(op).not.toBeNull()
    if (op!.op === "insert" && op!.at.kind === "text") {
      expect(op!.at.char).toBe(1000000)
    }
  })

  it("should handle Unicode characters in content", () => {
    const envelope = createInsertOpEnvelope({
      sessionId: "session-1",
      userId: "user-1",
      revision: 1,
      at: textPath(0, 0, 0),
      content: "Hello 🌍! 😀",
    })

    const op = extractModelOp(envelope)
    expect(op).not.toBeNull()
    if (op!.op === "insert") {
      expect(op!.content).toBe("Hello 🌍! 😀")
    }
  })
})
