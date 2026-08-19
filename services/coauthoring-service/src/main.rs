//! coauthoring-service — World-Office real-time collaboration microservice
//!
//! Manages WebSocket connections, operational transforms, and
//! document lock/sync for multi-user editing sessions.
//!
//! Session metadata is persisted to SQLite via `SessionRepository`.
//! Broadcast channels (tokio::sync::broadcast) are ephemeral and
//! reconstructed at runtime — they are not persisted.

use axum::{
    Json, Router,
    extract::{
        Path, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::StatusCode,
    routing::{get, post},
};
use chrono::Utc;
use diamond_types::list::{ListCRDT, encoding::EncodeOptions};
use futures_util::{SinkExt, StreamExt};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

static METRICS: LazyLock<PrometheusHandle> = LazyLock::new(|| {
    PrometheusBuilder::new()
        .install_recorder()
        .expect("failed to install prometheus recorder")
});

fn describe_metrics() {
    metrics::describe_counter!(
        "connection_refused_total",
        "Total number of WebSocket connection attempts refused (session not found)"
    );
    metrics::describe_gauge!(
        "sessions_active",
        "Current number of active collaboration sessions"
    );
}

async fn metrics_handler() -> String {
    METRICS.render()
}

use tokio::sync::{Mutex, broadcast};

use coauthoring_service::model_op::ModelOpEnvelope;

/// A connected editor session.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct EditorSession {
    session_id: String,
    document_id: String,
    created_at: String,
    last_activity: String,
    participants: Vec<Participant>,
}

/// A participant in a co-authoring session.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Participant {
    user_id: String,
    username: String,
    color: String,
    cursor_position: Option<CursorPos>,
    selection: Option<Selection>,
}

/// Cursor position for visual feedback.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CursorPos {
    page: u32,
    x: f64,
    y: f64,
}

/// Text selection for visual feedback.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Selection {
    page: u32,
    start: u64,
    end: u64,
}

/// An operational transform edit.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct EditOperation {
    session_id: String,
    user_id: String,
    revision: u64,
    #[serde(rename = "type")]
    op_type: String, // "insert", "delete", "format"
    position: u64,
    length: u64,
    content: Option<String>,
    timestamp: String,
}

/// A participant update event sent over WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ParticipantUpdate {
    #[serde(rename = "type")]
    event: ParticipantEvent,
    user_id: String,
    username: String,
    color: String,
    cursor_position: Option<CursorPos>,
    selection: Option<Selection>,
}

/// The event type for a participant update.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ParticipantEvent {
    Joined,
    Left,
    CursorMoved,
}

/// Initial state sent to a new WebSocket client upon connect.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct InitialState {
    crdt_bytes: Vec<u8>,
    participants: Vec<Participant>,
    #[serde(skip_serializing_if = "Option::is_none")]
    presentation_state: Option<PresentationState>,
}

/// A comment event broadcast over WebSocket (added/updated/deleted/resolved).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentEventData {
    #[serde(rename = "type")]
    pub event_type: String, // "added", "deleted", "resolved"
    pub comment_id: String,
    pub document_id: String,
    pub parent_id: Option<String>,
    pub author_id: String,
    pub author_name: String,
    pub text: String,
    pub resolved: bool,
    pub mentions: String,
    pub created_at: String,
}

/// A spreadsheet-level operation for real-time coauthoring.
/// Operations are broadcast to all session participants and applied
/// last-writer-wins (no CRDT — cell edits are applied optimistically).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum SpreadsheetOp {
    SetCellValue {
        payload: CellValuePayload,
    },
    SetCellStyle {
        payload: CellStylePayload,
    },
    SetCellFormula {
        payload: CellValuePayload,
    },
    SheetAction {
        payload: SheetActionPayload,
    },
    InsertRow {
        sheet_name: String,
        row: u32,
        count: u32,
    },
    DeleteRow {
        sheet_name: String,
        row: u32,
        count: u32,
    },
    InsertColumn {
        sheet_name: String,
        col: u32,
        count: u32,
    },
    DeleteColumn {
        sheet_name: String,
        col: u32,
        count: u32,
    },
    MergeCells {
        sheet_name: String,
        range: String,
    },
    UnmergeCells {
        sheet_name: String,
        range: String,
    },
}

/// PDF annotation collaboration operation (relayed as-is, no server-side state).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum PdfAnnotationOp {
    AddAnnotation {
        payload: PdfAnnotationPayload,
    },
    RemoveAnnotation {
        annotation_id: String,
    },
    ModifyAnnotation {
        annotation_id: String,
        changes: serde_json::Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfAnnotationPayload {
    pub id: String,
    pub page: u32,
    #[serde(rename = "type")]
    pub annotation_type: String,
    pub x: f64,
    pub y: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

/// Visio diagram collaboration operation (relayed as-is, no server-side state).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum VisioDiagramOp {
    ShapeAdd {
        shape_id: String,
        shape_data: String,
    },
    ShapeDelete {
        shape_id: String,
    },
    ShapeModify {
        shape_id: String,
        changes: serde_json::Value,
    },
    ShapeMove {
        shape_id: String,
        x: f64,
        y: f64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CellValuePayload {
    pub sheet_name: String,
    pub cell: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formula: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CellStylePayload {
    pub sheet_name: String,
    pub cell: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub number_format: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetActionPayload {
    pub action: String,
    pub sheet_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<u32>,
}

/// A presentation-level shape operation for real-time coauthoring.
/// Operations are broadcast to all session participants and applied
/// last-writer-wins (no CRDT merge — shapes are ID-based).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum PresentationOp {
    ShapeAdd {
        slide_index: u32,
        shape: ShapePayload,
    },
    ShapeDelete {
        slide_index: u32,
        shape_id: String,
    },
    ShapeModify {
        slide_index: u32,
        shape_id: String,
        properties: serde_json::Value,
    },
    ShapeMove {
        slide_index: u32,
        shape_id: String,
        x: f64,
        y: f64,
    },
    SlideAdd {
        after_index: u32,
    },
    SlideDelete {
        slide_index: u32,
    },
    SlideReorder {
        from_index: u32,
        to_index: u32,
    },
}

/// Payload for a shape being added or updated in a presentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShapePayload {
    pub id: String,
    #[serde(rename = "type")]
    pub shape_type: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub z_index: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stroke_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_src: Option<String>,
}

/// The top-level WebSocket message enum.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum WsMessage {
    Edit {
        operation: EditOperation,
    },
    ParticipantUpdate {
        update: ParticipantUpdate,
    },
    InitialStateMsg {
        state: InitialState,
    },
    CommentEvent {
        data: CommentEventData,
    },
    PresentationOp {
        session_id: String,
        user_id: String,
        operation: PresentationOp,
    },
    SpreadsheetOp {
        session_id: String,
        user_id: String,
        operation: SpreadsheetOp,
    },
    PdfAnnotationOp {
        session_id: String,
        user_id: String,
        operation: PdfAnnotationOp,
    },
    VisioDiagramOp {
        session_id: String,
        user_id: String,
        operation: VisioDiagramOp,
    },
    /// Document operations using ModelOp format (new path-addressed mutation engine).
    /// Used by CanvasEditor — wraps a ModelOpEnvelope with session/user metadata.
    DocumentOp {
        envelope: ModelOpEnvelope,
    },
}

/// A collaborative document backed by diamond-types CRDT.
///
/// Each session has one `Document`. Multiple clients (agents) can insert
/// and delete text concurrently; diamond-types resolves conflicts
/// automatically so all replicas converge to the same content.
struct Document {
    crdt: ListCRDT,
    /// Tracks the next agent ID index for new participants.
    agent_counter: u32,
    /// Maps user_id -> diamond-types AgentId.
    agent_map: HashMap<String, u32>,
}

#[allow(dead_code)]
impl Document {
    /// Create a new empty collaborative document.
    fn new() -> Self {
        Self {
            crdt: ListCRDT::new(),
            agent_counter: 0,
            agent_map: HashMap::new(),
        }
    }

    /// Register a user as an agent in this document.
    /// Returns the diamond-types `AgentId` assigned to this user.
    fn register_agent(&mut self, user_id: &str) -> u32 {
        if let Some(&id) = self.agent_map.get(user_id) {
            return id;
        }
        let id = self.crdt.get_or_create_agent_id(user_id);
        self.agent_map.insert(user_id.to_string(), id);
        self.agent_counter = self.agent_counter.max(id + 1);
        id
    }

    /// Apply an `EditOperation` to this document.
    ///
    /// - `"insert"`: inserts `content` at `position`
    /// - `"delete"`: deletes `length` characters starting at `position`
    /// - `"format"`: ignored in plain-text v1 (no-op)
    ///
    /// Returns `Ok(())` on success, or an error description on failure.
    fn apply_edit(&mut self, op: &EditOperation) -> Result<(), String> {
        let agent = self.register_agent(&op.user_id);

        match op.op_type.as_str() {
            "insert" => {
                let content = op.content.as_deref().unwrap_or("");
                let pos = op.position as usize;
                self.crdt.insert(agent, pos, content);
                Ok(())
            }
            "delete" => {
                let start = op.position as usize;
                let end = start + op.length as usize;
                self.crdt.delete(agent, start..end);
                Ok(())
            }
            "format" => {
                // Plain text v1 — formatting ops are no-ops
                Ok(())
            }
            other => Err(format!("unknown op_type: {other}")),
        }
    }

    /// Get the current text content of the document.
    fn text(&self) -> String {
        self.crdt.branch.content().to_string()
    }

    /// Merge another document's history into this one (replication).
    ///
    /// Uses binary encoding to properly transfer operations between
    /// independent CRDT replicas with different local time spaces.
    fn merge_from(&mut self, other: &Document) {
        let encoded = other.crdt.oplog.encode(EncodeOptions::default());
        self.crdt.oplog.decode_and_add(&encoded).unwrap();
        // Update the branch to include the newly merged operations
        let version = self.crdt.oplog.local_version_ref().to_vec();
        self.crdt.branch.merge(&self.crdt.oplog, &version);
    }
}

/// In-memory presentation state for shape-level coauthoring.
/// Used for late-joining participants to receive current state.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PresentationState {
    pub slides: Vec<SlideState>,
}

/// A single slide in a presentation's collaborative state.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SlideState {
    /// Shape map: shape_id -> JSON value with all properties.
    pub shapes: HashMap<String, serde_json::Value>,
    /// Ordered shape IDs for z-order rendering.
    pub shape_order: Vec<String>,
}

/// SQLite-backed session repository for co-authoring sessions.
struct SessionRepository {
    conn: Connection,
}

#[allow(dead_code)]
impl SessionRepository {
    /// Create a new repository backed by an in-memory database.
    fn new_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        let repo = Self { conn };
        repo.init_table()?;
        Ok(repo)
    }

    /// Create a new repository backed by a file database.
    fn new_file(path: &str) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        let repo = Self { conn };
        repo.init_table()?;
        Ok(repo)
    }

    /// Create the editor_sessions table if it does not exist.
    fn init_table(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS editor_sessions (
                id              TEXT PRIMARY KEY,
                document_id     TEXT NOT NULL,
                created_at      TEXT NOT NULL,
                last_activity   TEXT NOT NULL,
                participants    TEXT NOT NULL DEFAULT '[]'
            );",
        )?;
        Ok(())
    }

    /// Insert a new session into the database.
    fn insert(&self, session: &EditorSession) -> Result<(), rusqlite::Error> {
        let participants_json =
            serde_json::to_string(&session.participants).unwrap_or_else(|_| "[]".to_string());
        self.conn.execute(
            "INSERT INTO editor_sessions (id, document_id, created_at, last_activity, participants)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                session.session_id,
                session.document_id,
                session.created_at,
                session.last_activity,
                participants_json,
            ],
        )?;
        Ok(())
    }

    /// Get a session by ID.
    fn get(&self, id: &str) -> Result<Option<EditorSession>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, document_id, created_at, last_activity, participants
             FROM editor_sessions WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![id])?;
        match rows.next()? {
            Some(row) => Ok(Some(Self::row_to_session(row)?)),
            None => Ok(None),
        }
    }

    /// List all sessions.
    fn get_all(&self) -> Result<Vec<EditorSession>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, document_id, created_at, last_activity, participants
             FROM editor_sessions",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Self::row_to_session(row).expect("failed to read session row"))
        })?;
        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row?);
        }
        Ok(sessions)
    }

    /// Update a session (e.g., after a participant joins).
    fn update(&self, session: &EditorSession) -> Result<bool, rusqlite::Error> {
        let participants_json =
            serde_json::to_string(&session.participants).unwrap_or_else(|_| "[]".to_string());
        let count = self.conn.execute(
            "UPDATE editor_sessions SET last_activity = ?1, participants = ?2 WHERE id = ?3",
            params![session.last_activity, participants_json, session.session_id],
        )?;
        Ok(count > 0)
    }

    /// Delete a session by ID.
    fn delete(&self, id: &str) -> Result<bool, rusqlite::Error> {
        let count = self
            .conn
            .execute("DELETE FROM editor_sessions WHERE id = ?1", params![id])?;
        Ok(count > 0)
    }

    fn row_to_session(row: &rusqlite::Row<'_>) -> Result<EditorSession, rusqlite::Error> {
        let participants_str: String = row.get(4)?;
        let participants: Vec<Participant> =
            serde_json::from_str(&participants_str).unwrap_or_default();
        Ok(EditorSession {
            session_id: row.get(0)?,
            document_id: row.get(1)?,
            created_at: row.get(2)?,
            last_activity: row.get(3)?,
            participants,
        })
    }
}

/// Application state.
#[derive(Clone)]
struct AppState {
    sessions: Arc<Mutex<SessionRepository>>,
    /// Broadcast channels per session for real-time edits (ephemeral, not persisted).
    edit_channels: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
    /// Broadcast channels per session for presence updates (joined/left/cursor).
    presence_channels: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
    /// Collaborative documents per session, backed by diamond-types CRDT.
    documents: Arc<Mutex<HashMap<String, Document>>>,
    /// In-memory presentation state per session for shape-level coauthoring.
    presentation_state: Arc<Mutex<HashMap<String, PresentationState>>>,
    /// Broadcast channels per session for presentation operations (shape add/delete/modify).
    presentation_channels: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
    /// Broadcast channels per session for spreadsheet operations.
    spreadsheet_channels: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
    /// Broadcast channels per session for PDF annotation operations.
    pdf_annotation_channels: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
    /// Broadcast channels per session for Visio diagram operations.
    visio_diagram_channels: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
    /// Broadcast channels per session for DocumentOp (ModelOp) operations.
    document_op_channels: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
}

/// Health check response.
#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

/// Create session request.
#[derive(Deserialize)]
struct CreateSessionRequest {
    document_id: String,
}

/// Create session response.
#[derive(Serialize)]
struct CreateSessionResponse {
    session_id: String,
    document_id: String,
    message: String,
}

/// Join session request.
#[derive(Deserialize)]
struct JoinSessionRequest {
    user_id: String,
    username: String,
}

/// Join session response.
#[derive(Serialize)]
struct JoinSessionResponse {
    session_id: String,
    participants: Vec<Participant>,
    message: String,
}

/// Error response.
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    code: u16,
}

/// Preset editor colors for participant differentiation.
const EDITOR_COLORS: &[&str] = &[
    "#E74C3C", "#3498DB", "#2ECC71", "#F39C12", "#9B59B6", "#1ABC9C", "#E67E22", "#34495E",
];

/// POST /sessions — create a new co-authoring session.
async fn create_session(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<Json<CreateSessionResponse>, (StatusCode, Json<ErrorResponse>)> {
    if payload.document_id.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "document_id is required".into(),
                code: 400,
            }),
        ));
    }

    let session_id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let session = EditorSession {
        session_id: session_id.clone(),
        document_id: payload.document_id.clone(),
        created_at: now.clone(),
        last_activity: now.clone(),
        participants: Vec::new(),
    };

    // Persist session to SQLite
    {
        let repo = state.sessions.lock().await;
        repo.insert(&session).map_err(|e| {
            tracing::error!(error = %e, "failed to insert session");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to create session".into(),
                    code: 500,
                }),
            )
        })?;
    }

    // Create ephemeral broadcast channel for this session
    let (tx, _) = broadcast::channel::<String>(256);
    {
        let mut channels = state.edit_channels.lock().await;
        channels.insert(session_id.clone(), tx);
    }

    // Create ephemeral presence broadcast channel for this session
    let (presence_tx, _) = broadcast::channel::<String>(256);
    {
        let mut presence = state.presence_channels.lock().await;
        presence.insert(session_id.clone(), presence_tx);
    }

    // Create collaborative document for this session
    {
        let mut docs = state.documents.lock().await;
        docs.insert(session_id.clone(), Document::new());
    }

    // Create ephemeral presentation broadcast channel for this session
    let (presentation_tx, _) = broadcast::channel::<String>(256);
    {
        let mut pchannels = state.presentation_channels.lock().await;
        pchannels.insert(session_id.clone(), presentation_tx);
    }

    // Create ephemeral spreadsheet broadcast channel for this session
    let (spreadsheet_tx, _) = broadcast::channel::<String>(256);
    {
        let mut schannels = state.spreadsheet_channels.lock().await;
        schannels.insert(session_id.clone(), spreadsheet_tx);
    }

    // Create ephemeral PDF annotation broadcast channel for this session
    let (pdf_annotation_tx, _) = broadcast::channel::<String>(256);
    {
        let mut pachannels = state.pdf_annotation_channels.lock().await;
        pachannels.insert(session_id.clone(), pdf_annotation_tx);
    }

    // Create ephemeral Visio diagram broadcast channel for this session
    let (visio_diagram_tx, _) = broadcast::channel::<String>(256);
    {
        let mut vdchannels = state.visio_diagram_channels.lock().await;
        vdchannels.insert(session_id.clone(), visio_diagram_tx);
    }

    // Create ephemeral DocumentOp broadcast channel for this session
    let (document_op_tx, _) = broadcast::channel::<String>(256);
    {
        let mut dochannels = state.document_op_channels.lock().await;
        dochannels.insert(session_id.clone(), document_op_tx);
    }

    metrics::gauge!("sessions_active").set(1.0);

    // Initialize presentation state (will be populated as operations arrive)
    {
        let mut pstate = state.presentation_state.lock().await;
        pstate.insert(session_id.clone(), PresentationState::default());
    }

    tracing::info!(
        session_id = %session_id,
        document_id = %payload.document_id,
        "co-authoring session created"
    );

    Ok(Json(CreateSessionResponse {
        session_id,
        document_id: payload.document_id,
        message: "Session created. Connect via WebSocket at /ws/{session_id}.".into(),
    }))
}

/// POST /sessions/{id}/join — join an existing session.
async fn join_session(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
    Json(payload): Json<JoinSessionRequest>,
) -> Result<Json<JoinSessionResponse>, (StatusCode, Json<ErrorResponse>)> {
    let mut session = {
        let repo = state.sessions.lock().await;
        repo.get(&session_id)
            .map_err(|e| {
                tracing::error!(error = %e, "database error getting session");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Internal server error".into(),
                        code: 500,
                    }),
                )
            })?
            .ok_or_else(|| {
                (
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: format!("Session {} not found", session_id),
                        code: 404,
                    }),
                )
            })?
    };

    let color_index = session.participants.len() % EDITOR_COLORS.len();
    let username = payload.username.clone();
    let participant = Participant {
        user_id: payload.user_id,
        username: payload.username,
        color: EDITOR_COLORS[color_index].to_string(),
        cursor_position: None,
        selection: None,
    };

    session.participants.push(participant.clone());
    session.last_activity = Utc::now().to_rfc3339();
    let participants = session.participants.clone();

    // Persist updated session
    {
        let repo = state.sessions.lock().await;
        repo.update(&session).map_err(|e| {
            tracing::error!(error = %e, "failed to update session");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to update session".into(),
                    code: 500,
                }),
            )
        })?;
    }

    tracing::info!(
        session_id = %session_id,
        username = %username,
        "participant joined session"
    );

    Ok(Json(JoinSessionResponse {
        session_id,
        participants,
        message: "Joined session successfully.".into(),
    }))
}

/// GET /sessions/{id} — get session info.
async fn get_session(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<Json<EditorSession>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.sessions.lock().await;

    match repo.get(&session_id) {
        Ok(Some(session)) => Ok(Json(session)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Session {} not found", session_id),
                code: 404,
            }),
        )),
        Err(e) => {
            tracing::error!(error = %e, "database error getting session");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Internal server error".into(),
                    code: 500,
                }),
            ))
        }
    }
}

/// GET /sessions — list all active sessions.
async fn list_sessions(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<EditorSession>>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.sessions.lock().await;

    match repo.get_all() {
        Ok(all) => Ok(Json(all)),
        Err(e) => {
            tracing::error!(error = %e, "database error listing sessions");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Internal server error".into(),
                    code: 500,
                }),
            ))
        }
    }
}

/// GET /ws/{session_id} — WebSocket upgrade for real-time editing.
async fn ws_upgrade(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
    ws: WebSocketUpgrade,
) -> impl axum::response::IntoResponse {
    let user_id = params
        .get("user_id")
        .cloned()
        .unwrap_or_else(|| "anonymous".to_string());
    let username = params
        .get("username")
        .cloned()
        .unwrap_or_else(|| "Anonymous".to_string());
    ws.on_upgrade(move |socket| handle_ws(socket, state, session_id, user_id, username))
}

/// Handle an individual WebSocket connection.
async fn handle_ws(
    mut socket: WebSocket,
    state: Arc<AppState>,
    session_id: String,
    user_id: String,
    username: String,
) {
    let presence_rx = {
        let channels = state.presence_channels.lock().await;
        channels.get(&session_id).map(|tx| tx.subscribe())
    };

    let presence_rx = match presence_rx {
        Some(rx) => rx,
        None => {
            metrics::counter!("connection_refused_total").increment(1);
            let _ = socket
                .send(Message::Text(
                    format!(r#"{{"error":"Session {} not found"}}"#, session_id).into(),
                ))
                .await;
            return;
        }
    };

    let edit_rx = {
        let channels = state.edit_channels.lock().await;
        channels.get(&session_id).map(|tx| tx.subscribe())
    };

    let edit_rx = match edit_rx {
        Some(rx) => rx,
        None => {
            let _ = socket
                .send(Message::Text(
                    format!(r#"{{"error":"Session {} not found"}}"#, session_id).into(),
                ))
                .await;
            return;
        }
    };

    let presentation_rx = {
        let channels = state.presentation_channels.lock().await;
        channels.get(&session_id).map(|tx| tx.subscribe())
    };

    let presentation_rx = match presentation_rx {
        Some(rx) => rx,
        None => {
            let _ = socket
                .send(Message::Text(
                    format!(r#"{{"error":"Session {} not found"}}"#, session_id).into(),
                ))
                .await;
            return;
        }
    };

    let spreadsheet_rx = {
        let channels = state.spreadsheet_channels.lock().await;
        channels.get(&session_id).map(|tx| tx.subscribe())
    };

    let spreadsheet_rx = match spreadsheet_rx {
        Some(rx) => rx,
        None => {
            let _ = socket
                .send(Message::Text(
                    format!(r#"{{"error":"Session {} not found"}}"#, session_id).into(),
                ))
                .await;
            return;
        }
    };

    let pdf_annotation_rx = {
        let channels = state.pdf_annotation_channels.lock().await;
        channels.get(&session_id).map(|tx| tx.subscribe())
    };

    let pdf_annotation_rx = match pdf_annotation_rx {
        Some(rx) => rx,
        None => {
            let _ = socket
                .send(Message::Text(
                    format!(r#"{{"error":"Session {} not found"}}"#, session_id).into(),
                ))
                .await;
            return;
        }
    };

    let visio_diagram_rx = {
        let channels = state.visio_diagram_channels.lock().await;
        channels.get(&session_id).map(|tx| tx.subscribe())
    };

    let visio_diagram_rx = match visio_diagram_rx {
        Some(rx) => rx,
        None => {
            let _ = socket
                .send(Message::Text(
                    format!(r#"{{"error":"Session {} not found"}}"#, session_id).into(),
                ))
                .await;
            return;
        }
    };

    let document_op_rx = {
        let channels = state.document_op_channels.lock().await;
        channels.get(&session_id).map(|tx| tx.subscribe())
    };

    let document_op_rx = match document_op_rx {
        Some(rx) => rx,
        None => {
            let _ = socket
                .send(Message::Text(
                    format!(r#"{{"error":"Session {} not found"}}"#, session_id).into(),
                ))
                .await;
            return;
        }
    };

    tracing::info!(session_id = %session_id, user_id = %user_id, "WebSocket connected");

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Single mpsc channel for all outgoing WS messages
    let (out_tx, mut out_rx) = tokio::sync::mpsc::channel::<String>(256);

    let presence_tx = {
        let channels = state.presence_channels.lock().await;
        channels.get(&session_id).cloned()
    };

    let session_color = {
        let repo = state.sessions.lock().await;
        repo.get(&session_id)
            .ok()
            .flatten()
            .and_then(|s| {
                s.participants
                    .iter()
                    .find(|p| p.user_id == user_id)
                    .map(|p| p.color.clone())
            })
            .unwrap_or_else(|| "#E74C3C".to_string())
    };

    let initial_state = {
        let doc_bytes = {
            let docs = state.documents.lock().await;
            docs.get(&session_id)
                .map(|doc| doc.crdt.oplog.encode(EncodeOptions::default()))
        };
        let repo = state.sessions.lock().await;
        let participants = repo
            .get(&session_id)
            .ok()
            .flatten()
            .map(|s| s.participants.clone())
            .unwrap_or_default();
        let pres_state = {
            let pstate = state.presentation_state.lock().await;
            pstate.get(&session_id).cloned()
        };
        WsMessage::InitialStateMsg {
            state: InitialState {
                crdt_bytes: doc_bytes.unwrap_or_default(),
                participants,
                presentation_state: pres_state,
            },
        }
    };
    if let Ok(json) = serde_json::to_string(&initial_state) {
        let _ = out_tx.try_send(json);
    }

    let joined = ParticipantUpdate {
        event: ParticipantEvent::Joined,
        user_id: user_id.clone(),
        username: username.clone(),
        color: session_color.clone(),
        cursor_position: None,
        selection: None,
    };
    if let Some(ref tx) = presence_tx
        && let Ok(json) = serde_json::to_string(&WsMessage::ParticipantUpdate { update: joined })
    {
        let _ = tx.send(json);
    }

    // Forward all outgoing messages to the WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });
    drop(send_task);

    // Forward presence updates to the shared outgoing channel
    let out_tx_presence = out_tx.clone();
    let recv_presence = tokio::spawn(async move {
        let mut presence_rx = presence_rx;
        while let Ok(presence) = presence_rx.recv().await {
            let _ = out_tx_presence.send(presence).await;
        }
    });

    // Forward edit broadcasts to the shared outgoing channel
    let out_tx_edit = out_tx.clone();
    let recv_edit = tokio::spawn(async move {
        let mut edit_rx = edit_rx;
        while let Ok(text) = edit_rx.recv().await {
            let _ = out_tx_edit.send(text).await;
        }
    });

    // Forward presentation op broadcasts to the shared outgoing channel
    let out_tx_presentation = out_tx.clone();
    let recv_presentation = tokio::spawn(async move {
        let mut presentation_rx = presentation_rx;
        while let Ok(text) = presentation_rx.recv().await {
            let _ = out_tx_presentation.send(text).await;
        }
    });

    // Forward spreadsheet op broadcasts to the shared outgoing channel
    let out_tx_spreadsheet = out_tx.clone();
    let recv_spreadsheet = tokio::spawn(async move {
        let mut spreadsheet_rx = spreadsheet_rx;
        while let Ok(text) = spreadsheet_rx.recv().await {
            let _ = out_tx_spreadsheet.send(text).await;
        }
    });

    // Forward PDF annotation op broadcasts to the shared outgoing channel
    let out_tx_pdf_annotation = out_tx.clone();
    let recv_pdf_annotation = tokio::spawn(async move {
        let mut rx = pdf_annotation_rx;
        while let Ok(text) = rx.recv().await {
            let _ = out_tx_pdf_annotation.send(text).await;
        }
    });

    // Forward Visio diagram op broadcasts to the shared outgoing channel
    let out_tx_visio_diagram = out_tx.clone();
    let recv_visio_diagram = tokio::spawn(async move {
        let mut rx = visio_diagram_rx;
        while let Ok(text) = rx.recv().await {
            let _ = out_tx_visio_diagram.send(text).await;
        }
    });

    // Forward DocumentOp broadcasts to the shared outgoing channel
    let out_tx_document_op = out_tx.clone();
    let recv_document_op = tokio::spawn(async move {
        let mut rx = document_op_rx;
        while let Ok(text) = rx.recv().await {
            let _ = out_tx_document_op.send(text).await;
        }
    });

    while let Some(Ok(msg)) = ws_receiver.next().await {
        if let Message::Text(text) = msg {
            if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                match ws_msg {
                    WsMessage::InitialStateMsg { .. } => { /* clients do not send InitialState */ }
                    WsMessage::Edit { operation } => {
                        let applied = {
                            let mut docs = state.documents.lock().await;
                            if let Some(doc) = docs.get_mut(&session_id) {
                                doc.apply_edit(&operation).is_ok()
                            } else {
                                false
                            }
                        };
                        if !applied {
                            continue;
                        }
                        let channels = state.edit_channels.lock().await;
                        if let Some(tx) = channels.get(&session_id) {
                            let _ = tx.send(text.to_string());
                        }
                    }
                    WsMessage::ParticipantUpdate { update } => {
                        if let Some(ref tx) = presence_tx
                            && let Ok(json) =
                                serde_json::to_string(&WsMessage::ParticipantUpdate { update })
                        {
                            let _ = tx.send(json);
                        }
                    }
                    WsMessage::CommentEvent { data } => {
                        // Broadcast comment events to all session participants via edit channel
                        let channels = state.edit_channels.lock().await;
                        if let Some(tx) = channels.get(&session_id)
                            && let Ok(json) =
                                serde_json::to_string(&WsMessage::CommentEvent { data })
                        {
                            let _ = tx.send(json);
                        }
                    }
                    WsMessage::PresentationOp {
                        session_id: _,
                        user_id: _,
                        operation,
                    } => {
                        // Update server-side presentation state
                        {
                            let mut pstate = state.presentation_state.lock().await;
                            if let Some(ps) = pstate.get_mut(&session_id) {
                                apply_presentation_op(ps, &operation);
                            }
                        }
                        // Broadcast to all participants via presentation channel
                        let channels = state.presentation_channels.lock().await;
                        if let Some(tx) = channels.get(&session_id) {
                            let _ = tx.send(text.to_string());
                        }
                    }
                    WsMessage::SpreadsheetOp {
                        session_id: _,
                        user_id: _,
                        operation: _, // Spreadsheet ops are broadcast as-is with no server-side state
                    } => {
                        // Broadcast spreadsheet operations to all participants
                        let channels = state.spreadsheet_channels.lock().await;
                        if let Some(tx) = channels.get(&session_id) {
                            let _ = tx.send(text.to_string());
                        }
                    }
                    WsMessage::PdfAnnotationOp {
                        session_id: _,
                        user_id: _,
                        operation: _, // PDF annotation ops are broadcast as-is
                    } => {
                        let channels = state.pdf_annotation_channels.lock().await;
                        if let Some(tx) = channels.get(&session_id) {
                            let _ = tx.send(text.to_string());
                        }
                    }
                    WsMessage::VisioDiagramOp {
                        session_id: _,
                        user_id: _,
                        operation: _, // Visio diagram ops are broadcast as-is
                    } => {
                        let channels = state.visio_diagram_channels.lock().await;
                        if let Some(tx) = channels.get(&session_id) {
                            let _ = tx.send(text.to_string());
                        }
                    }
                    // DocumentOp (ModelOp) — broadcast to all session participants as-is
                    WsMessage::DocumentOp { envelope: _ } => {
                        let channels = state.document_op_channels.lock().await;
                        if let Some(tx) = channels.get(&session_id) {
                            let _ = tx.send(text.to_string());
                        }
                    }
                }
            } else if let Ok(edit_op) = serde_json::from_str::<EditOperation>(&text) {
                let applied = {
                    let mut docs = state.documents.lock().await;
                    if let Some(doc) = docs.get_mut(&session_id) {
                        doc.apply_edit(&edit_op).is_ok()
                    } else {
                        false
                    }
                };
                if !applied {
                    continue;
                }
                let channels = state.edit_channels.lock().await;
                if let Some(tx) = channels.get(&session_id) {
                    let _ = tx.send(text.to_string());
                }
            }
        }
    }

    let left = ParticipantUpdate {
        event: ParticipantEvent::Left,
        user_id: user_id.clone(),
        username: username.clone(),
        color: session_color.clone(),
        cursor_position: None,
        selection: None,
    };
    if let Some(ref tx) = presence_tx
        && let Ok(json) = serde_json::to_string(&WsMessage::ParticipantUpdate { update: left })
    {
        let _ = tx.send(json);
    }

    recv_presence.abort();
    recv_edit.abort();
    recv_presentation.abort();
    recv_spreadsheet.abort();
    recv_pdf_annotation.abort();
    recv_visio_diagram.abort();
    recv_document_op.abort();

    tracing::info!(session_id = %session_id, user_id = %user_id, "WebSocket disconnected");
}

/// GET /health — liveness check.
async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "coauthoring-service",
        version: env!("CARGO_PKG_VERSION"),
    })
}

fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics_handler))
        .route("/sessions", post(create_session).get(list_sessions))
        .route("/sessions/{id}", get(get_session))
        .route("/sessions/{id}/join", post(join_session))
        .route("/ws/{session_id}", get(ws_upgrade))
        .with_state(state)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    describe_metrics();

    let db_path =
        std::env::var("DATABASE_PATH").unwrap_or_else(|_| "coauthoring_sessions.db".into());
    let repo = SessionRepository::new_file(&db_path).expect("failed to open coauthoring database");

    let state = Arc::new(AppState {
        sessions: Arc::new(Mutex::new(repo)),
        edit_channels: Arc::new(Mutex::new(HashMap::new())),
        presence_channels: Arc::new(Mutex::new(HashMap::new())),
        documents: Arc::new(Mutex::new(HashMap::new())),
        presentation_state: Arc::new(Mutex::new(HashMap::new())),
        presentation_channels: Arc::new(Mutex::new(HashMap::new())),
        spreadsheet_channels: Arc::new(Mutex::new(HashMap::new())),
        pdf_annotation_channels: Arc::new(Mutex::new(HashMap::new())),
        visio_diagram_channels: Arc::new(Mutex::new(HashMap::new())),
        document_op_channels: Arc::new(Mutex::new(HashMap::new())),
    });
    let app = app(state);

    let addr = std::env::var("SERVICE_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("SERVICE_PORT")
        .unwrap_or_else(|_| "8004".into())
        .parse()
        .unwrap_or(8004);

    tracing::info!(
        "coauthoring-service v{} starting on {}:{}",
        env!("CARGO_PKG_VERSION"),
        addr,
        port
    );

    let listener = tokio::net::TcpListener::bind(format!("{}:{}", addr, port))
        .await
        .expect("failed to bind");
    axum::serve(listener, app).await.expect("server error");
}

fn apply_presentation_op(state: &mut PresentationState, op: &PresentationOp) {
    match op {
        PresentationOp::ShapeAdd { slide_index, shape } => {
            let idx = *slide_index as usize;
            while state.slides.len() <= idx {
                state.slides.push(SlideState::default());
            }
            let slide = &mut state.slides[idx];
            let id = shape.id.clone();
            if let Ok(val) = serde_json::to_value(shape) {
                slide.shapes.insert(id.clone(), val);
                if !slide.shape_order.contains(&id) {
                    slide.shape_order.push(id);
                }
            }
        }
        PresentationOp::ShapeDelete {
            slide_index,
            shape_id,
        } => {
            if let Some(slide) = state.slides.get_mut(*slide_index as usize) {
                slide.shapes.remove(shape_id);
                slide.shape_order.retain(|id| id != shape_id);
            }
        }
        PresentationOp::ShapeModify {
            slide_index,
            shape_id,
            properties,
        } => {
            if let Some(slide) = state.slides.get_mut(*slide_index as usize)
                && let Some(serde_json::Value::Object(map)) = slide.shapes.get_mut(shape_id)
                && let serde_json::Value::Object(props) = properties
            {
                for (k, v) in props.clone() {
                    map.insert(k, v);
                }
            }
        }
        PresentationOp::ShapeMove {
            slide_index,
            shape_id,
            x,
            y,
        } => {
            if let Some(slide) = state.slides.get_mut(*slide_index as usize)
                && let Some(serde_json::Value::Object(map)) = slide.shapes.get_mut(shape_id)
            {
                map.insert("x".to_string(), serde_json::json!(x));
                map.insert("y".to_string(), serde_json::json!(y));
            }
        }
        PresentationOp::SlideAdd { after_index } => {
            let idx = (*after_index as usize).min(state.slides.len());
            state.slides.insert(idx, SlideState::default());
        }
        PresentationOp::SlideDelete { slide_index } => {
            let idx = *slide_index as usize;
            if idx < state.slides.len() {
                state.slides.remove(idx);
            }
        }
        PresentationOp::SlideReorder {
            from_index,
            to_index,
        } => {
            let from = *from_index as usize;
            let to = (*to_index as usize).min(state.slides.len().saturating_sub(1));
            if from < state.slides.len() && to < state.slides.len() && from != to {
                let slide = state.slides.remove(from);
                state.slides.insert(to, slide);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create a fresh in-memory repository.
    fn fresh_repo() -> SessionRepository {
        SessionRepository::new_in_memory().expect("in-memory db")
    }

    /// Helper: create a sample session.
    fn sample_session(id: &str) -> EditorSession {
        EditorSession {
            session_id: id.to_string(),
            document_id: "doc-123".to_string(),
            created_at: "2026-04-17T00:00:00+00:00".to_string(),
            last_activity: "2026-04-17T00:00:00+00:00".to_string(),
            participants: vec![Participant {
                user_id: "user-1".to_string(),
                username: "alice".to_string(),
                color: "#E74C3C".to_string(),
                cursor_position: None,
                selection: None,
            }],
        }
    }

    #[test]
    fn test_insert_and_get() {
        let repo = fresh_repo();
        let session = sample_session("sess-1");

        repo.insert(&session).expect("insert");

        let fetched = repo.get("sess-1").expect("get").expect("found");
        assert_eq!(fetched.session_id, "sess-1");
        assert_eq!(fetched.document_id, "doc-123");
        assert_eq!(fetched.participants.len(), 1);
        assert_eq!(fetched.participants[0].username, "alice");
    }

    #[test]
    fn test_get_nonexistent() {
        let repo = fresh_repo();
        let result = repo.get("nope").expect("get");
        assert!(result.is_none());
    }

    #[test]
    fn test_list_sessions() {
        let repo = fresh_repo();
        repo.insert(&sample_session("s1")).unwrap();
        repo.insert(&sample_session("s2")).unwrap();

        let all = repo.get_all().unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_delete_session() {
        let repo = fresh_repo();
        repo.insert(&sample_session("s1")).unwrap();

        let deleted = repo.delete("s1").unwrap();
        assert!(deleted);

        let remaining = repo.get_all().unwrap();
        assert!(remaining.is_empty());

        let deleted_again = repo.delete("s1").unwrap();
        assert!(!deleted_again);
    }

    #[test]
    fn test_update_session() {
        let repo = fresh_repo();
        // Insert first, then update
        repo.insert(&sample_session("s1")).unwrap();

        let mut session = sample_session("s1");
        session.participants.push(Participant {
            user_id: "user-2".to_string(),
            username: "bob".to_string(),
            color: "#3498DB".to_string(),
            cursor_position: None,
            selection: None,
        });
        session.last_activity = "2026-04-17T01:00:00+00:00".to_string();

        let updated = repo.update(&session).unwrap();
        assert!(updated);

        let fetched = repo.get("s1").unwrap().unwrap();
        assert_eq!(fetched.participants.len(), 2);
        assert_eq!(fetched.participants[1].username, "bob");
        assert_eq!(fetched.last_activity, "2026-04-17T01:00:00+00:00");
    }

    #[test]
    fn test_persistence_across_restarts() {
        // Insert data
        let repo = fresh_repo();
        repo.insert(&sample_session("persist-1")).unwrap();

        // Simulate restart: re-init table is idempotent
        repo.init_table().expect("re-init should be idempotent");

        // Verify data still there
        let fetched = repo.get("persist-1").unwrap().expect("should still exist");
        assert_eq!(fetched.document_id, "doc-123");
        assert_eq!(fetched.participants.len(), 1);
    }

    #[test]
    fn test_file_persistence_across_connections() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test_coauthoring.db");
        let path_str = db_path.to_str().unwrap();

        // First connection: insert
        {
            let repo = SessionRepository::new_file(path_str).unwrap();
            repo.insert(&sample_session("file-sess")).unwrap();
        }

        // Second connection (simulating restart): read
        {
            let repo = SessionRepository::new_file(path_str).unwrap();
            let fetched = repo.get("file-sess").unwrap().expect("found after restart");
            assert_eq!(fetched.session_id, "file-sess");
            assert_eq!(fetched.document_id, "doc-123");
            assert_eq!(fetched.participants.len(), 1);
            assert_eq!(fetched.participants[0].username, "alice");
        }
    }

    #[test]
    fn test_insert_duplicate_id_fails() {
        let repo = fresh_repo();
        let session = sample_session("dup-1");

        repo.insert(&session).unwrap();
        // Inserting same ID again should fail (PRIMARY KEY constraint)
        let result = repo.insert(&session);
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_participants_serialized() {
        let repo = fresh_repo();
        let session = EditorSession {
            session_id: "empty-part".to_string(),
            document_id: "doc-x".to_string(),
            created_at: "2026-04-17T00:00:00+00:00".to_string(),
            last_activity: "2026-04-17T00:00:00+00:00".to_string(),
            participants: Vec::new(),
        };

        repo.insert(&session).unwrap();
        let fetched = repo.get("empty-part").unwrap().unwrap();
        assert!(fetched.participants.is_empty());
    }

    // --- diamond-types integration tests ---

    /// Helper: create a sample EditOperation.
    fn sample_edit(
        user_id: &str,
        op_type: &str,
        position: u64,
        length: u64,
        content: Option<&str>,
    ) -> EditOperation {
        EditOperation {
            session_id: "sess-1".to_string(),
            user_id: user_id.to_string(),
            revision: 0,
            op_type: op_type.to_string(),
            position,
            length,
            content: content.map(|s| s.to_string()),
            timestamp: "2026-04-17T00:00:00+00:00".to_string(),
        }
    }

    #[test]
    fn test_document_insert() {
        let mut doc = Document::new();
        let op = sample_edit("alice", "insert", 0, 0, Some("Hello"));
        doc.apply_edit(&op).unwrap();
        assert_eq!(doc.text(), "Hello");
    }

    #[test]
    fn test_document_multiple_inserts() {
        let mut doc = Document::new();
        doc.apply_edit(&sample_edit("alice", "insert", 0, 0, Some("Hello")))
            .unwrap();
        doc.apply_edit(&sample_edit("alice", "insert", 5, 0, Some(" world")))
            .unwrap();
        assert_eq!(doc.text(), "Hello world");
    }

    #[test]
    fn test_document_delete() {
        let mut doc = Document::new();
        doc.apply_edit(&sample_edit("alice", "insert", 0, 0, Some("Hello world")))
            .unwrap();
        doc.apply_edit(&sample_edit("alice", "delete", 5, 6, None))
            .unwrap();
        assert_eq!(doc.text(), "Hello");
    }

    #[test]
    fn test_document_delete_middle() {
        let mut doc = Document::new();
        doc.apply_edit(&sample_edit("alice", "insert", 0, 0, Some("abcdef")))
            .unwrap();
        // Delete "bc" (position 1, length 2)
        doc.apply_edit(&sample_edit("alice", "delete", 1, 2, None))
            .unwrap();
        assert_eq!(doc.text(), "adef");
    }

    #[test]
    fn test_document_format_is_noop() {
        let mut doc = Document::new();
        doc.apply_edit(&sample_edit("alice", "insert", 0, 0, Some("Hello")))
            .unwrap();
        // Format ops should be no-ops in plain text v1
        let fmt_op = EditOperation {
            op_type: "format".to_string(),
            position: 0,
            length: 5,
            content: Some("bold".to_string()),
            ..sample_edit("alice", "format", 0, 5, None)
        };
        doc.apply_edit(&fmt_op).unwrap();
        assert_eq!(doc.text(), "Hello");
    }

    #[test]
    fn test_document_unknown_op_type_fails() {
        let mut doc = Document::new();
        let bad_op = EditOperation {
            op_type: "transpose".to_string(),
            ..sample_edit("alice", "transpose", 0, 0, None)
        };
        let result = doc.apply_edit(&bad_op);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown op_type"));
    }

    #[test]
    fn test_register_agent_returns_same_id() {
        let mut doc = Document::new();
        let id1 = doc.register_agent("alice");
        let id2 = doc.register_agent("alice");
        assert_eq!(id1, id2);
    }

    #[test]
    fn test_register_different_agents() {
        let mut doc = Document::new();
        let alice = doc.register_agent("alice");
        let bob = doc.register_agent("bob");
        assert_ne!(alice, bob);
    }

    /// Concurrent edit test: two simulated clients insert at the same position.
    /// Both inserts must be preserved after merge (diamond-types handles this).
    #[test]
    fn test_concurrent_inserts_both_preserved() {
        // Simulate two clients editing the same document concurrently
        let mut doc1 = Document::new();
        let mut doc2 = Document::new();

        // Both start from the same initial state
        doc1.apply_edit(&sample_edit("alice", "insert", 0, 0, Some("S")))
            .unwrap();
        doc1.merge_from(&doc2);
        doc2.merge_from(&doc1);

        // Verify both have "S"
        assert_eq!(doc1.text(), "S");
        assert_eq!(doc2.text(), "S");

        // Concurrent edits: both insert at position 1 (after "S")
        doc1.apply_edit(&sample_edit("alice", "insert", 1, 0, Some("aaa")))
            .unwrap();
        doc2.apply_edit(&sample_edit("bob", "insert", 1, 0, Some("bbb")))
            .unwrap();

        // Before merge, each has its own content
        assert_eq!(doc1.text(), "Saaa");
        assert_eq!(doc2.text(), "Sbbb");

        // Merge: both inserts at position 1 should be preserved
        doc1.merge_from(&doc2);

        // The merged document must contain both "aaa" and "bbb"
        let merged = doc1.text();
        assert!(
            merged.contains("aaa"),
            "merged text '{merged}' must contain 'aaa'"
        );
        assert!(
            merged.contains("bbb"),
            "merged text '{merged}' must contain 'bbb'"
        );
        assert_eq!(
            merged.len(),
            7,
            "merged text should be 7 chars: S + aaa + bbb"
        );
        assert!(merged.starts_with('S'), "merged text should start with 'S'");
    }

    /// Three-way concurrent edit: three clients each insert at the same position.
    #[test]
    fn test_three_way_concurrent_inserts() {
        let mut doc1 = Document::new();
        let mut doc2 = Document::new();
        let mut doc3 = Document::new();

        // Shared initial content
        doc1.apply_edit(&sample_edit("alice", "insert", 0, 0, Some("X")))
            .unwrap();
        doc2.merge_from(&doc1);
        doc3.merge_from(&doc1);

        assert_eq!(doc1.text(), "X");
        assert_eq!(doc2.text(), "X");
        assert_eq!(doc3.text(), "X");

        // All three insert at position 1 (after "X") concurrently
        doc1.apply_edit(&sample_edit("alice", "insert", 1, 0, Some("A")))
            .unwrap();
        doc2.apply_edit(&sample_edit("bob", "insert", 1, 0, Some("B")))
            .unwrap();
        doc3.apply_edit(&sample_edit("carol", "insert", 1, 0, Some("C")))
            .unwrap();

        // Merge all three together
        doc1.merge_from(&doc2);
        doc1.merge_from(&doc3);

        let merged = doc1.text();
        assert_eq!(
            merged.len(),
            4,
            "merged text should be 4 chars: X + A + B + C"
        );
        assert!(merged.contains('X'));
        assert!(merged.contains('A'));
        assert!(merged.contains('B'));
        assert!(merged.contains('C'));
    }

    /// Concurrent insert and delete: one client inserts while another deletes.
    #[test]
    fn test_concurrent_insert_and_delete() {
        let mut doc1 = Document::new();
        let mut doc2 = Document::new();

        // Shared initial: "abcde"
        doc1.apply_edit(&sample_edit("alice", "insert", 0, 0, Some("abcde")))
            .unwrap();
        doc2.merge_from(&doc1);

        assert_eq!(doc1.text(), "abcde");
        assert_eq!(doc2.text(), "abcde");

        // Client 1 inserts "X" at position 2 -> "abXcde"
        doc1.apply_edit(&sample_edit("alice", "insert", 2, 0, Some("X")))
            .unwrap();

        // Client 2 deletes "bcd" (positions 1..4) -> "ae"
        doc2.apply_edit(&sample_edit("bob", "delete", 1, 3, None))
            .unwrap();

        // Merge
        doc1.merge_from(&doc2);

        // Both operations should be reflected: "aXe" (insert preserved, delete preserved)
        let merged = doc1.text();
        assert!(
            merged.contains('X'),
            "merged text '{merged}' must contain inserted 'X'"
        );
        assert!(
            merged.starts_with('a') && merged.ends_with('e'),
            "merged text '{merged}' should start with 'a' and end with 'e'"
        );
    }
}
