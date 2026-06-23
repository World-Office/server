//! session-service — World-Office session management microservice
//!
//! Handles user sessions, authentication token lifecycle,
//! and connection management for editor instances.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use chrono::Utc;
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, LazyLock};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};

static METRICS: LazyLock<PrometheusHandle> = LazyLock::new(|| {
    PrometheusBuilder::new()
        .install_recorder()
        .expect("failed to install prometheus recorder")
});

async fn metrics_handler() -> String {
    METRICS.render()
}

use tokio::sync::Mutex;
use uuid::Uuid;

/// Session state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum SessionState {
    Active,
    Idle,
    Expired,
    Revoked,
}

impl SessionState {
    fn as_str(&self) -> &'static str {
        match self {
            SessionState::Active => "active",
            SessionState::Idle => "idle",
            SessionState::Expired => "expired",
            SessionState::Revoked => "revoked",
        }
    }

    fn from_str(s: &str) -> Option<Self> {
        match s {
            "active" => Some(SessionState::Active),
            "idle" => Some(SessionState::Idle),
            "expired" => Some(SessionState::Expired),
            "revoked" => Some(SessionState::Revoked),
            _ => None,
        }
    }
}

/// A user session.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Session {
    id: String,
    user_id: String,
    username: String,
    state: SessionState,
    created_at: String,
    last_activity: String,
    expires_at: String,
    metadata: serde_json::Value,
}

/// SQLite-backed session repository.
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

    /// Create the sessions table if it does not exist.
    fn init_table(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                id              TEXT PRIMARY KEY,
                user_id         TEXT NOT NULL,
                username        TEXT NOT NULL,
                state           TEXT NOT NULL DEFAULT 'active',
                created_at      TEXT NOT NULL,
                last_activity   TEXT NOT NULL,
                expires_at      TEXT NOT NULL,
                access_token    TEXT DEFAULT '',
                refresh_token   TEXT DEFAULT '',
                revoked         INTEGER DEFAULT 0,
                metadata        TEXT DEFAULT '{}'
            );",
        )?;
        Ok(())
    }

    /// Insert a session into the database.
    fn insert(
        &self,
        session: &Session,
        access_token: &str,
        refresh_token: &str,
    ) -> Result<(), rusqlite::Error> {
        let revoked = if session.state == SessionState::Revoked {
            1
        } else {
            0
        };
        self.conn.execute(
            "INSERT INTO sessions (id, user_id, username, state, created_at, last_activity, expires_at, access_token, refresh_token, revoked, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                session.id,
                session.user_id,
                session.username,
                session.state.as_str(),
                session.created_at,
                session.last_activity,
                session.expires_at,
                access_token,
                refresh_token,
                revoked,
                session.metadata.to_string(),
            ],
        )?;
        Ok(())
    }

    /// Get a session by ID.
    fn get(&self, id: &str) -> Result<Option<Session>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, user_id, username, state, created_at, last_activity, expires_at, metadata
             FROM sessions WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![id])?;
        match rows.next()? {
            Some(row) => Ok(Some(Self::row_to_session(row)?)),
            None => Ok(None),
        }
    }

    /// List all sessions.
    fn get_all(&self) -> Result<Vec<Session>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, user_id, username, state, created_at, last_activity, expires_at, metadata
             FROM sessions",
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

    /// Update session state (e.g., revoke).
    fn update_state(
        &self,
        id: &str,
        state: &SessionState,
        last_activity: &str,
    ) -> Result<bool, rusqlite::Error> {
        let revoked = if *state == SessionState::Revoked {
            1
        } else {
            0
        };
        let count = self.conn.execute(
            "UPDATE sessions SET state = ?1, last_activity = ?2, revoked = ?3 WHERE id = ?4",
            params![state.as_str(), last_activity, revoked, id],
        )?;
        Ok(count > 0)
    }

    /// Delete a session by ID.
    fn delete(&self, id: &str) -> Result<bool, rusqlite::Error> {
        let count = self
            .conn
            .execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
        Ok(count > 0)
    }

    fn row_to_session(row: &rusqlite::Row<'_>) -> Result<Session, rusqlite::Error> {
        let state_str: String = row.get(3)?;
        let state = SessionState::from_str(&state_str).unwrap_or(SessionState::Active);
        let metadata_str: String = row.get(7)?;
        let metadata: serde_json::Value =
            serde_json::from_str(&metadata_str).unwrap_or(serde_json::json!({}));
        Ok(Session {
            id: row.get(0)?,
            user_id: row.get(1)?,
            username: row.get(2)?,
            state,
            created_at: row.get(4)?,
            last_activity: row.get(5)?,
            expires_at: row.get(6)?,
            metadata,
        })
    }
}

/// Application state.
#[derive(Clone)]
struct AppState {
    sessions: Arc<Mutex<SessionRepository>>,
    jwt_secret: String,
    session_ttl_seconds: i64,
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
    user_id: String,
    username: String,
}

/// Create session response.
#[derive(Serialize)]
struct CreateSessionResponse {
    session_id: String,
    access_token: String,
    refresh_token: String,
    expires_in: i64,
}

/// Token refresh request.
#[derive(Deserialize)]
struct RefreshRequest {
    refresh_token: String,
}

/// Token refresh response.
#[derive(Serialize)]
struct RefreshResponse {
    access_token: String,
    expires_in: i64,
}

/// Session info response.
#[derive(Serialize)]
struct SessionInfoResponse {
    session: Session,
}

/// Error response.
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    code: u16,
}

/// JWT claims for session tokens.
#[derive(Debug, Serialize, Deserialize)]
struct SessionClaims {
    sub: String,
    username: String,
    session_id: String,
    #[serde(rename = "type")]
    token_type: String, // "access" or "refresh"
    exp: usize,
    iat: usize,
}

/// POST /sessions — create a new session and issue tokens.
async fn create_session(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<Json<CreateSessionResponse>, (StatusCode, Json<ErrorResponse>)> {
    if payload.user_id.is_empty() || payload.username.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "user_id and username are required".into(),
                code: 400,
            }),
        ));
    }

    let session_id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let ttl = state.session_ttl_seconds;

    let session = Session {
        id: session_id.clone(),
        user_id: payload.user_id.clone(),
        username: payload.username.clone(),
        state: SessionState::Active,
        created_at: now.to_rfc3339(),
        last_activity: now.to_rfc3339(),
        expires_at: (now + chrono::Duration::seconds(ttl)).to_rfc3339(),
        metadata: serde_json::json!({}),
    };

    // Issue access token (short-lived: 15 minutes)
    let access_claims = SessionClaims {
        sub: payload.user_id.clone(),
        username: payload.username.clone(),
        session_id: session_id.clone(),
        token_type: "access".into(),
        exp: (now.timestamp() + 900) as usize,
        iat: now.timestamp() as usize,
    };

    let access_token = encode(
        &Header::default(),
        &access_claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .unwrap_or_default();

    // Issue refresh token (long-lived: matches session TTL)
    let refresh_claims = SessionClaims {
        sub: payload.user_id.clone(),
        username: payload.username.clone(),
        session_id: session_id.clone(),
        token_type: "refresh".into(),
        exp: (now.timestamp() + ttl) as usize,
        iat: now.timestamp() as usize,
    };

    let refresh_token = encode(
        &Header::default(),
        &refresh_claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .unwrap_or_default();

    {
        let repo = state.sessions.lock().await;
        repo.insert(&session, &access_token, &refresh_token)
            .map_err(|e| {
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

    tracing::info!(
        session_id = %session_id,
        user_id = %payload.user_id,
        "session created"
    );

    Ok(Json(CreateSessionResponse {
        session_id,
        access_token,
        refresh_token,
        expires_in: ttl,
    }))
}

/// POST /sessions/refresh — refresh an access token using a refresh token.
async fn refresh_session(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RefreshRequest>,
) -> Result<Json<RefreshResponse>, (StatusCode, Json<ErrorResponse>)> {
    use jsonwebtoken::{DecodingKey, Validation, decode};

    let token_data = decode::<SessionClaims>(
        &payload.refresh_token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Invalid or expired refresh token".into(),
                code: 401,
            }),
        )
    })?;

    let claims = token_data.claims;

    if claims.token_type != "refresh" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Expected a refresh token".into(),
                code: 400,
            }),
        ));
    }

    // Verify session still exists and is active
    {
        let repo = state.sessions.lock().await;
        match repo.get(&claims.session_id) {
            Ok(Some(session)) if session.state == SessionState::Active => {}
            Ok(Some(_)) => {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    Json(ErrorResponse {
                        error: "Session is no longer active".into(),
                        code: 401,
                    }),
                ));
            }
            Ok(None) => {
                return Err((
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: "Session not found".into(),
                        code: 404,
                    }),
                ));
            }
            Err(e) => {
                tracing::error!(error = %e, "database error checking session");
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Internal server error".into(),
                        code: 500,
                    }),
                ));
            }
        }
    }

    let session_id = claims.session_id;
    let username = claims.username;
    let now = Utc::now();

    // Issue new access token
    let new_access_claims = SessionClaims {
        sub: claims.sub,
        username,
        session_id: session_id.clone(),
        token_type: "access".into(),
        exp: (now.timestamp() + 900) as usize,
        iat: now.timestamp() as usize,
    };

    let access_token = encode(
        &Header::default(),
        &new_access_claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .unwrap_or_default();

    tracing::info!(
        session_id = %session_id,
        "access token refreshed"
    );

    Ok(Json(RefreshResponse {
        access_token,
        expires_in: 900,
    }))
}

/// GET /sessions/{id} — get session info.
async fn get_session(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<Json<SessionInfoResponse>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.sessions.lock().await;

    match repo.get(&session_id) {
        Ok(Some(session)) => Ok(Json(SessionInfoResponse { session })),
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

/// DELETE /sessions/{id} — revoke a session.
async fn revoke_session(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.sessions.lock().await;
    let now = Utc::now().to_rfc3339();

    match repo.update_state(&session_id, &SessionState::Revoked, &now) {
        Ok(true) => {
            tracing::info!(session_id = %session_id, "session revoked");
            Ok(Json(serde_json::json!({
                "session_id": session_id,
                "status": "revoked"
            })))
        }
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Session {} not found", session_id),
                code: 404,
            }),
        )),
        Err(e) => {
            tracing::error!(error = %e, "database error revoking session");
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

/// GET /sessions — list all sessions.
async fn list_sessions(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<Session>>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.sessions.lock().await;

    match repo.get_all() {
        Ok(sessions) => Ok(Json(sessions)),
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

/// GET /health — liveness check.
async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "session-service",
        version: env!("CARGO_PKG_VERSION"),
    })
}

fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics_handler))
        .route("/sessions", post(create_session).get(list_sessions))
        .route("/sessions/{id}", get(get_session).delete(revoke_session))
        .route("/sessions/refresh", post(refresh_session))
        .with_state(state)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let jwt_secret =
        std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret-change-in-production".into());
    let session_ttl: i64 = std::env::var("SESSION_TTL_SECONDS")
        .unwrap_or_else(|_| "86400".into())
        .parse()
        .unwrap_or(86400);

    let db_path = std::env::var("DATABASE_PATH").unwrap_or_else(|_| "sessions.db".into());
    let repo = SessionRepository::new_file(&db_path).expect("failed to open session database");

    let state = Arc::new(AppState {
        sessions: Arc::new(Mutex::new(repo)),
        jwt_secret,
        session_ttl_seconds: session_ttl,
    });
    let app = app(state);

    let addr = std::env::var("SERVICE_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("SERVICE_PORT")
        .unwrap_or_else(|_| "8005".into())
        .parse()
        .unwrap_or(8005);

    tracing::info!(
        "session-service v{} starting on {}:{}",
        env!("CARGO_PKG_VERSION"),
        addr,
        port
    );

    let listener = tokio::net::TcpListener::bind(format!("{}:{}", addr, port))
        .await
        .expect("failed to bind");
    axum::serve(listener, app).await.expect("server error");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create a fresh in-memory repository.
    fn fresh_repo() -> SessionRepository {
        SessionRepository::new_in_memory().expect("in-memory db")
    }

    /// Helper: create a sample session.
    fn sample_session(id: &str) -> Session {
        Session {
            id: id.to_string(),
            user_id: "user-42".to_string(),
            username: "alice".to_string(),
            state: SessionState::Active,
            created_at: "2026-04-17T00:00:00+00:00".to_string(),
            last_activity: "2026-04-17T00:00:00+00:00".to_string(),
            expires_at: "2026-04-18T00:00:00+00:00".to_string(),
            metadata: serde_json::json!({"theme": "dark"}),
        }
    }

    #[test]
    fn test_insert_and_get() {
        let repo = fresh_repo();
        let session = sample_session("sess-1");

        repo.insert(&session, "access-tok", "refresh-tok")
            .expect("insert");

        let fetched = repo.get("sess-1").expect("get").expect("found");
        assert_eq!(fetched.id, "sess-1");
        assert_eq!(fetched.user_id, "user-42");
        assert_eq!(fetched.username, "alice");
        assert_eq!(fetched.state, SessionState::Active);
        assert_eq!(fetched.metadata["theme"], "dark");
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
        repo.insert(&sample_session("s1"), "a1", "r1").unwrap();
        repo.insert(&sample_session("s2"), "a2", "r2").unwrap();

        let all = repo.get_all().unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_delete_session() {
        let repo = fresh_repo();
        repo.insert(&sample_session("s1"), "a", "r").unwrap();

        let deleted = repo.delete("s1").unwrap();
        assert!(deleted);

        let remaining = repo.get_all().unwrap();
        assert!(remaining.is_empty());

        let deleted_again = repo.delete("s1").unwrap();
        assert!(!deleted_again);
    }

    #[test]
    fn test_update_state_revoke() {
        let repo = fresh_repo();
        repo.insert(&sample_session("s1"), "a", "r").unwrap();

        let updated = repo
            .update_state("s1", &SessionState::Revoked, "2026-04-17T01:00:00+00:00")
            .unwrap();
        assert!(updated);

        let fetched = repo.get("s1").unwrap().unwrap();
        assert_eq!(fetched.state, SessionState::Revoked);
        assert_eq!(fetched.last_activity, "2026-04-17T01:00:00+00:00");
    }

    #[test]
    fn test_persistence_across_restarts() {
        // Insert data
        let repo = fresh_repo();
        repo.insert(&sample_session("persist-1"), "atk", "rtk")
            .unwrap();

        // Simulate restart: create a new in-memory repo — data won't persist in :memory:
        // but we verify the table schema works by re-initializing on same connection.
        // For file-backed, persistence is automatic. We test table re-init is idempotent.
        repo.init_table().expect("re-init should be idempotent");

        // Verify data still there
        let fetched = repo.get("persist-1").unwrap().expect("should still exist");
        assert_eq!(fetched.user_id, "user-42");
    }

    #[test]
    fn test_file_persistence_across_connections() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let path_str = db_path.to_str().unwrap();

        // First connection: insert
        {
            let repo = SessionRepository::new_file(path_str).unwrap();
            repo.insert(&sample_session("file-sess"), "atk", "rtk")
                .unwrap();
        }

        // Second connection (simulating restart): read
        {
            let repo = SessionRepository::new_file(path_str).unwrap();
            let fetched = repo.get("file-sess").unwrap().expect("found after restart");
            assert_eq!(fetched.id, "file-sess");
            assert_eq!(fetched.user_id, "user-42");
            assert_eq!(fetched.username, "alice");
            assert_eq!(fetched.state, SessionState::Active);
        }
    }

    #[test]
    fn test_insert_duplicate_id_fails() {
        let repo = fresh_repo();
        let session = sample_session("dup-1");

        repo.insert(&session, "a", "r").unwrap();
        // Inserting same ID again should fail (PRIMARY KEY constraint)
        let result = repo.insert(&session, "a2", "r2");
        assert!(result.is_err());
    }
}
