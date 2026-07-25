/**
 * Protocol types for the coauthoring-service WebSocket protocol.
 *
 * These types match the server's Rust structs exactly. The server uses
 * serde JSON serialization with camelCase field names.
 *
 * IMPORTANT: These types are READ-ONLY reference. The server protocol
 * is defined in services/coauthoring-service/src/main.rs.
 */

// ── Cursor & Selection ──

export interface CursorPosition {
  page: number
  x: number
  y: number
}

export interface Selection {
  page: number
  start: number
  end: number
}

// ── Participant ──

export interface Participant {
  user_id: string
  username: string
  color: string
  cursor_position: CursorPosition | null
  selection: Selection | null
}

// ── Spreadsheet Operation ──

/**
 * A cell reference in A1 notation (e.g., "A1", "B2", "AA10").
 */
export type CellRef = string

/**
 * A single cell value change.
 */
export interface CellValuePayload {
  sheet_name: string
  cell: CellRef
  value?: string | number | boolean | null
  formula?: string | null
}

/**
 * A cell style change.
 */
export interface CellStylePayload {
  sheet_name: string
  cell: CellRef
  bold?: boolean | null
  italic?: boolean | null
  underline?: boolean | null
  strikethrough?: boolean | null
  font_size?: number | null
  font_name?: string | null
  font_color?: string | null
  fill_color?: string | null
  horizontal_align?: string | null
  number_format?: string | null
  wrap?: boolean | null
}

/**
 * A sheet-level operation (add, delete, rename).
 */
export interface SheetActionPayload {
  action: "add" | "delete" | "rename" | "reorder"
  sheet_name: string
  new_name?: string | null
  position?: number | null
}

/**
 * Operation types for spreadsheet collaboration.
 */
export type SpreadsheetOperation =
  | { action: "set_cell_value"; payload: CellValuePayload }
  | { action: "set_cell_style"; payload: CellStylePayload }
  | { action: "set_cell_formula"; payload: CellValuePayload }
  | { action: "sheet_action"; payload: SheetActionPayload }
  | { action: "insert_row"; sheet_name: string; row: number; count: number }
  | { action: "delete_row"; sheet_name: string; row: number; count: number }
  | { action: "insert_column"; sheet_name: string; col: number; count: number }
  | { action: "delete_column"; sheet_name: string; col: number; count: number }
  | { action: "merge_cells"; sheet_name: string; range: string }
  | { action: "unmerge_cells"; sheet_name: string; range: string }

// ── Presentation Operation ──

export interface ShapePayload {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  z_index: number
  fill_color?: string | null
  stroke_color?: string | null
  stroke_width?: number | null
  text?: string | null
  font_size?: number | null
  font_color?: string | null
  image_data?: {
    src: string
    width: number
    height: number
  } | null
  group_id?: string | null
}

export type PresentationOperation =
  | { action: "shape_add"; slide_index: number; shape: ShapePayload }
  | { action: "shape_delete"; slide_index: number; shape_id: string }
  | {
      action: "shape_modify"
      slide_index: number
      shape_id: string
      properties: Record<string, unknown>
    }
  | { action: "shape_move"; slide_index: number; shape_id: string; x: number; y: number }
  | { action: "slide_add"; after_index: number }
  | { action: "slide_delete"; slide_index: number }
  | { action: "slide_reorder"; from_index: number; to_index: number }

// ── Edit Operation ──

/** Discriminated union for client-to-server edit messages. */
export type EditOperation = InsertOperation | DeleteOperation

export interface BaseEditOperation {
  session_id: string
  user_id: string
  revision: number
  timestamp: string
}

export interface InsertOperation extends BaseEditOperation {
  type: "insert"
  position: number
  length: 0
  content: string
}

export interface DeleteOperation extends BaseEditOperation {
  type: "delete"
  position: number
  length: number
  content: null
}

// ── Participant Update ──

/** Participant update event types. */
export type ParticipantEvent = "joined" | "left" | "cursor_moved"

/**
 * A presence update sent over WebSocket when a participant joins, leaves,
 * moves their cursor, or changes selection.
 */
export interface ParticipantUpdate {
  event: ParticipantEvent
  user_id: string
  username: string
  color: string
  cursor_position?: CursorPosition
  selection?: Selection
}

/**
 * A comment event broadcast over WebSocket (added/deleted/resolved).
 * Matches server CommentEventData struct.
 */
export interface CommentEventData {
  type: "added" | "deleted" | "resolved"
  comment_id: string
  document_id: string
  parent_id: string | null
  author_id: string
  author_name: string
  text: string
  resolved: boolean
  mentions: string
  created_at: string
}

/**
 * Client-to-server WebSocket message envelope.
 * Matches server WsMessage enum with serde @serde(tag = "type", rename_all = "snake_case").
 */
export type WsMessage =
  | { type: "edit"; operation: EditOperation }
  | { type: "participant_update"; update: ParticipantUpdate }
  | { type: "comment_event"; data: CommentEventData }
  | { type: "presentation_op"; operation: PresentationOperation }
  | { type: "spreadsheet_op"; session_id: string; user_id: string; operation: SpreadsheetOperation }

/**
 * Initial state sent to a new WebSocket client upon connect, containing
 * the current CRDT document bytes and all current participants.
 */
export interface InitialState {
  crdt_bytes: Uint8Array
  participants: Participant[]
  presentation_state?: PresentationStateData
}

/**
 * Discriminated union for all messages received from the server over WebSocket.
 */
export type ServerMessage =
  | { type: "edit"; operation: EditOperation }
  | { type: "participant_update"; update: ParticipantUpdate }
  | { type: "initial_state_msg"; state: InitialState }
  | { type: "comment_event"; data: CommentEventData }
  | { type: "presentation_op"; operation: PresentationOperation }
  | { type: "presentation_state"; state: PresentationStateData }
  | { type: "spreadsheet_op"; session_id: string; user_id: string; operation: SpreadsheetOperation }

export interface PresentationStateData {
  slides: Array<{
    shapes: Record<string, ShapePayload>
    shape_order: string[]
  }>
}

// ── Server REST Responses ──

export interface CreateSessionResponse {
  session_id: string
  document_id: string
  message: string
}

export interface JoinSessionResponse {
  session_id: string
  participants: Participant[]
  message: string
}

export interface EditorSession {
  session_id: string
  document_id: string
  created_at: string
  last_activity: string
  participants: Participant[]
}

// ── Helpers ──

/** Create an insert operation with auto-generated timestamp. */
export function createInsertOp(params: {
  session_id: string
  user_id: string
  position: number
  text: string
  revision?: number
}): InsertOperation {
  return {
    session_id: params.session_id,
    user_id: params.user_id,
    revision: params.revision ?? 0,
    type: "insert",
    position: params.position,
    length: 0,
    content: params.text,
    timestamp: new Date().toISOString(),
  }
}

/** Create a delete operation with auto-generated timestamp. */
export function createDeleteOp(params: {
  session_id: string
  user_id: string
  position: number
  length: number
  revision?: number
}): DeleteOperation {
  return {
    session_id: params.session_id,
    user_id: params.user_id,
    revision: params.revision ?? 0,
    type: "delete",
    position: params.position,
    length: params.length,
    content: null,
    timestamp: new Date().toISOString(),
  }
}

/** Parse a JSON string into a ServerMessage, or return null if invalid. */
export function parseServerMessage(json: string): ServerMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  if (typeof parsed !== "object" || parsed === null) return null
  const obj = parsed as Record<string, unknown>

  if (obj.type === "edit" && typeof obj.operation === "object") {
    return { type: "edit", operation: obj.operation as EditOperation }
  }
  if (obj.type === "participant_update" && typeof obj.update === "object") {
    return { type: "participant_update", update: obj.update as ParticipantUpdate }
  }
  if (obj.type === "initial_state_msg" && typeof obj.state === "object") {
    return { type: "initial_state_msg", state: obj.state as InitialState }
  }
  if (obj.type === "comment_event" && typeof obj.data === "object") {
    return { type: "comment_event", data: obj.data as CommentEventData }
  }
  if (obj.type === "presentation_op" && typeof obj.operation === "object") {
    return { type: "presentation_op", operation: obj.operation as PresentationOperation }
  }
  if (obj.type === "presentation_state" && typeof obj.state === "object") {
    return { type: "presentation_state", state: obj.state as PresentationStateData }
  }
  if (obj.type === "spreadsheet_op" && typeof obj.operation === "object") {
    return {
      type: "spreadsheet_op",
      session_id: obj.session_id as string,
      user_id: obj.user_id as string,
      operation: obj.operation as SpreadsheetOperation,
    }
  }

  return null
}

/** Create a participant update for cursor movement. */
export function createCursorUpdate(params: {
  session_id: string
  user_id: string
  username: string
  color: string
  cursor_position: CursorPosition
}): ParticipantUpdate {
  return {
    event: "cursor_moved",
    user_id: params.user_id,
    username: params.username,
    color: params.color,
    cursor_position: params.cursor_position,
  }
}

/** Create a participant update for selection change. */
export function createSelectionUpdate(params: {
  session_id: string
  user_id: string
  username: string
  color: string
  selection: Selection
}): ParticipantUpdate {
  return {
    event: "cursor_moved",
    user_id: params.user_id,
    username: params.username,
    color: params.color,
    selection: params.selection,
  }
}

/** Parse a JSON string into an EditOperation, or return null if invalid. */
export function parseMessage(json: string): EditOperation | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  if (typeof parsed !== "object" || parsed === null) return null
  const obj = parsed as Record<string, unknown>

  if (obj.type !== "insert" && obj.type !== "delete") return null
  if (typeof obj.session_id !== "string") return null
  if (typeof obj.user_id !== "string") return null

  return obj as unknown as EditOperation
}

/** Check if an operation was authored by a different user. */
export function isRemoteMessage(op: EditOperation, currentUserId: string): boolean {
  return op.user_id !== currentUserId
}
