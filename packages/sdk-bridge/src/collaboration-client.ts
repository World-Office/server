/**
 * Collaboration client for World Office SDK bridge.
 *
 * This module provides a TypeScript collaboration client that emits ModelOp
 * (structured operations) instead of plain text, matching the updated
 * coauthoring-service wire protocol.
 */

// ---------------------------------------------------------------------------
// Path addressing types (mirror wo-common::path)
// ---------------------------------------------------------------------------

/**
 * Address a specific position in a document tree.
 * Matches the Rust `Path` enum in wo-common.
 */
export type Path =
  | { kind: "text"; para: number; run: number; char: number }
  | {
      kind: "table"
      table: number
      row: number
      cell: number
      para: number
      run: number
      char: number
    }
  | { kind: "slide"; slide: number; shape: number; run: number; char: number }
  | { kind: "sheet"; sheet: string; row: number; col: number }

/**
 * A half-open range [start, end) over two Path addresses.
 * Matches the Rust `Range` struct in wo-common.
 */
export interface Range {
  start: Path
  end: Path
}

// ---------------------------------------------------------------------------
// ModelOp types (mirror wo-common::op::ModelOp)
// ---------------------------------------------------------------------------

/**
 * Formatting attributes for ModelOp.Format operations.
 * Uses Record<string, unknown> to allow any engine-specific attributes.
 */
export type FormatAttrs = Record<string, unknown>

/**
 * Universal mutation operations for any editable document model.
 * These match the Rust `ModelOp` enum in wo-common.
 *
 * Serialized as tagged JSON ("op": "insert", "op": "delete", etc.) for
 * transport over WebSocket collaboration channels.
 */
export type ModelOp =
  | { op: "insert"; at: Path; content: string }
  | { op: "delete"; range: Range }
  | { op: "replace"; at: Path; content: string }
  | { op: "format"; range: Range; attrs: FormatAttrs }
  | { op: "move"; from: Path; to: Path }

// ---------------------------------------------------------------------------
// ModelOpEnvelope types (mirror coauthoring-service::model_op::ModelOpEnvelope)
// ---------------------------------------------------------------------------

/** Current wire schema version for ModelOpEnvelope. */
export const WIRE_SCHEMA_VERSION = 1

/**
 * Collaboration wire envelope wrapping a ModelOp with session metadata.
 * This is the unit of exchange on the coauthoring WebSocket.
 *
 * Matches the Rust `ModelOpEnvelope` struct in coauthoring-service.
 */
export interface ModelOpEnvelope {
  /** Wire schema version. MUST equal WIRE_SCHEMA_VERSION. */
  version: number
  /** Session this operation belongs to. */
  session_id: string
  /** User who authored this operation. */
  user_id: string
  /** Monotonically increasing revision for causal ordering. */
  revision: number
  /** ISO 8601 timestamp of when the client authored the op. */
  timestamp: string
  /** The ModelOp flattened at the top level of the envelope. */
  op: string
  at?: Path
  content?: string
  range?: Range
  attrs?: FormatAttrs
  from?: Path
  to?: Path
}

// ---------------------------------------------------------------------------
// Helper functions for creating ModelOps
// ---------------------------------------------------------------------------

/**
 * Create a text path.
 */
export function textPath(para: number, run: number, char: number): Path {
  return { kind: "text", para, run, char }
}

/**
 * Create a table path.
 */
export function tablePath(
  table: number,
  row: number,
  cell: number,
  para: number,
  run: number,
  char: number,
): Path {
  return { kind: "table", table, row, cell, para, run, char }
}

/**
 * Create a slide path.
 */
export function slidePath(slide: number, shape: number, run: number, char: number): Path {
  return { kind: "slide", slide, shape, run, char }
}

/**
 * Create a sheet path.
 */
export function sheetPath(sheet: string, row: number, col: number): Path {
  return { kind: "sheet", sheet, row, col }
}

/**
 * Create a range from start and end paths.
 */
export function createRange(start: Path, end: Path): Range {
  return { start, end }
}

/**
 * Create a text range within the same paragraph.
 */
export function textRange(para: number, startChar: number, endChar: number): Range {
  return {
    start: { kind: "text", para, run: 0, char: startChar },
    end: { kind: "text", para, run: 0, char: endChar },
  }
}

// ---------------------------------------------------------------------------
// Helper functions for creating ModelOpEnvelopes
// ---------------------------------------------------------------------------

/**
 * Create an insert ModelOpEnvelope with auto-generated timestamp.
 */
export function createInsertOpEnvelope(params: {
  sessionId: string
  userId: string
  revision: number
  at: Path
  content: string
}): ModelOpEnvelope {
  return {
    version: WIRE_SCHEMA_VERSION,
    session_id: params.sessionId,
    user_id: params.userId,
    revision: params.revision,
    timestamp: new Date().toISOString(),
    op: "insert",
    at: params.at,
    content: params.content,
  }
}

/**
 * Create a delete ModelOpEnvelope with auto-generated timestamp.
 */
export function createDeleteOpEnvelope(params: {
  sessionId: string
  userId: string
  revision: number
  range: Range
}): ModelOpEnvelope {
  return {
    version: WIRE_SCHEMA_VERSION,
    session_id: params.sessionId,
    user_id: params.userId,
    revision: params.revision,
    timestamp: new Date().toISOString(),
    op: "delete",
    range: params.range,
  }
}

/**
 * Create a replace ModelOpEnvelope with auto-generated timestamp.
 */
export function createReplaceOpEnvelope(params: {
  sessionId: string
  userId: string
  revision: number
  at: Path
  content: string
}): ModelOpEnvelope {
  return {
    version: WIRE_SCHEMA_VERSION,
    session_id: params.sessionId,
    user_id: params.userId,
    revision: params.revision,
    timestamp: new Date().toISOString(),
    op: "replace",
    at: params.at,
    content: params.content,
  }
}

/**
 * Create a format ModelOpEnvelope with auto-generated timestamp.
 */
export function createFormatOpEnvelope(params: {
  sessionId: string
  userId: string
  revision: number
  range: Range
  attrs: FormatAttrs
}): ModelOpEnvelope {
  return {
    version: WIRE_SCHEMA_VERSION,
    session_id: params.sessionId,
    user_id: params.userId,
    revision: params.revision,
    timestamp: new Date().toISOString(),
    op: "format",
    range: params.range,
    attrs: params.attrs,
  }
}

/**
 * Create a move ModelOpEnvelope with auto-generated timestamp.
 */
export function createMoveOpEnvelope(params: {
  sessionId: string
  userId: string
  revision: number
  from: Path
  to: Path
}): ModelOpEnvelope {
  return {
    version: WIRE_SCHEMA_VERSION,
    session_id: params.sessionId,
    user_id: params.userId,
    revision: params.revision,
    timestamp: new Date().toISOString(),
    op: "move",
    from: params.from,
    to: params.to,
  }
}

// ---------------------------------------------------------------------------
// Serialization / Deserialization
// ---------------------------------------------------------------------------

/**
 * Serialize a ModelOpEnvelope to JSON string.
 */
export function serializeModelOpEnvelope(envelope: ModelOpEnvelope): string {
  return JSON.stringify(envelope)
}

/**
 * Deserialize a JSON string to a ModelOpEnvelope.
 * Returns null if the JSON is invalid or missing required fields.
 */
export function deserializeModelOpEnvelope(json: string): ModelOpEnvelope | null {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>

    // Validate required fields
    if (typeof parsed.version !== "number" || parsed.version !== WIRE_SCHEMA_VERSION) {
      return null
    }
    if (typeof parsed.session_id !== "string") {
      return null
    }
    if (typeof parsed.user_id !== "string") {
      return null
    }
    if (typeof parsed.revision !== "number") {
      return null
    }
    if (typeof parsed.timestamp !== "string") {
      return null
    }
    if (typeof parsed.op !== "string") {
      return null
    }

    return parsed as unknown as ModelOpEnvelope
  } catch {
    return null
  }
}

/**
 * Extract a ModelOp from a ModelOpEnvelope.
 * Returns null if the envelope is invalid or the op type is unknown.
 */
export function extractModelOp(envelope: ModelOpEnvelope): ModelOp | null {
  const op = envelope.op

  switch (op) {
    case "insert":
      if (envelope.at && typeof envelope.content === "string") {
        return { op: "insert", at: envelope.at, content: envelope.content }
      }
      return null
    case "delete":
      if (envelope.range) {
        return { op: "delete", range: envelope.range }
      }
      return null
    case "replace":
      if (envelope.at && typeof envelope.content === "string") {
        return { op: "replace", at: envelope.at, content: envelope.content }
      }
      return null
    case "format":
      if (envelope.range && envelope.attrs) {
        return { op: "format", range: envelope.range, attrs: envelope.attrs }
      }
      return null
    case "move":
      if (envelope.from && envelope.to) {
        return { op: "move", from: envelope.from, to: envelope.to }
      }
      return null
    default:
      return null
  }
}

/**
 * Convert a ModelOp to a ModelOpEnvelope.
 */
export function modelOpToEnvelope(
  op: ModelOp,
  sessionId: string,
  userId: string,
  revision: number,
): ModelOpEnvelope {
  const timestamp = new Date().toISOString()

  switch (op.op) {
    case "insert":
      return {
        version: WIRE_SCHEMA_VERSION,
        session_id: sessionId,
        user_id: userId,
        revision,
        timestamp,
        op: "insert",
        at: op.at,
        content: op.content,
      }
    case "delete":
      return {
        version: WIRE_SCHEMA_VERSION,
        session_id: sessionId,
        user_id: userId,
        revision,
        timestamp,
        op: "delete",
        range: op.range,
      }
    case "replace":
      return {
        version: WIRE_SCHEMA_VERSION,
        session_id: sessionId,
        user_id: userId,
        revision,
        timestamp,
        op: "replace",
        at: op.at,
        content: op.content,
      }
    case "format":
      return {
        version: WIRE_SCHEMA_VERSION,
        session_id: sessionId,
        user_id: userId,
        revision,
        timestamp,
        op: "format",
        range: op.range,
        attrs: op.attrs,
      }
    case "move":
      return {
        version: WIRE_SCHEMA_VERSION,
        session_id: sessionId,
        user_id: userId,
        revision,
        timestamp,
        op: "move",
        from: op.from,
        to: op.to,
      }
  }
}

// ---------------------------------------------------------------------------
// Legacy EditOperation type for backward compatibility
// ---------------------------------------------------------------------------

/**
 * Legacy edit operation type (plain text, position-based).
 * This is kept for migration purposes and will be removed in a future release.
 */
export type LegacyEditOperation = {
  session_id: string
  user_id: string
  revision: number
  timestamp: string
  type: "insert" | "delete"
  position: number
  length: number
  content: string | null
}

/**
 * Check if an operation envelope is a legacy text operation.
 * Legacy ops have type "insert"/"delete" and use position/length.
 */
export function isLegacyOperation(obj: Record<string, unknown>): boolean {
  const opType = obj.type as string | undefined
  return opType === "insert" || opType === "delete"
}

/**
 * Check if an operation envelope is a ModelOp envelope.
 * ModelOp envelopes have a version field and use the flattened ModelOp structure.
 */
export function isModelOpEnvelope(obj: Record<string, unknown>): boolean {
  return typeof obj.version === "number" && obj.version === WIRE_SCHEMA_VERSION
}

/**
 * Convert a legacy EditOperation to a ModelOpEnvelope.
 * This is for migration purposes.
 */
export function legacyToModelOpEnvelope(legacy: LegacyEditOperation): ModelOpEnvelope {
  const path: Path = { kind: "text", para: 0, run: 0, char: legacy.position }

  if (legacy.type === "insert") {
    return createInsertOpEnvelope({
      sessionId: legacy.session_id,
      userId: legacy.user_id,
      revision: legacy.revision,
      at: path,
      content: legacy.content || "",
    })
  }
  // For delete, we need to compute the range
  const endPath: Path = { kind: "text", para: 0, run: 0, char: legacy.position + legacy.length }
  return createDeleteOpEnvelope({
    sessionId: legacy.session_id,
    userId: legacy.user_id,
    revision: legacy.revision,
    range: { start: path, end: endPath },
  })
}
