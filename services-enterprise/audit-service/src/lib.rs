//! audit-service — World-Office enterprise audit logging microservice.
//!
//! Records and queries audit trails for document access, edits,
//! sharing events, and administrative actions. Enterprise-only.

pub mod repository;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::sse::{Event, Sse},
    routing::{delete, get, post},
};
use futures_util::stream::{self, Stream};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use repository::{AuditEvent, AuditRepository};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::{Arc, LazyLock};
use tokio::sync::{Mutex, broadcast};
use uuid::Uuid;

static METRICS: LazyLock<PrometheusHandle> = LazyLock::new(|| {
    PrometheusBuilder::new()
        .install_recorder()
        .expect("failed to install prometheus recorder")
});

async fn metrics_handler() -> String {
    METRICS.render()
}

/// Application state.
#[derive(Clone)]
pub struct AppState {
    pub repo: Arc<Mutex<AuditRepository>>,
    pub event_tx: broadcast::Sender<String>,
}

/// Health check response.
#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub version: &'static str,
}

/// Record event request body.
#[derive(Deserialize)]
pub struct RecordEventRequest {
    pub event_type: String,
    pub actor_id: String,
    pub resource_id: String,
    #[serde(default = "default_details")]
    pub details_json: String,
    #[serde(default)]
    pub ip_address: String,
}

fn default_details() -> String {
    "{}".into()
}

/// Record event response.
#[derive(Serialize)]
pub struct RecordEventResponse {
    pub event: AuditEvent,
}

/// Error response.
#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: u16,
}

/// Event list response.
#[derive(Serialize)]
pub struct EventListResponse {
    pub events: Vec<AuditEvent>,
    pub count: usize,
    pub total: i64,
}

/// Pagination query parameters.
#[derive(Deserialize)]
pub struct PaginationParams {
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
}

fn default_limit() -> usize {
    20
}

/// Retention delete response.
#[derive(Serialize)]
pub struct RetentionDeleteResponse {
    pub deleted: usize,
    pub older_than_days: i64,
}

/// Create a fresh AppState for testing with an in-memory DB.
pub fn create_test_state() -> Arc<AppState> {
    Arc::new(AppState {
        repo: Arc::new(Mutex::new(
            AuditRepository::new_in_memory().expect("failed to open in-memory db"),
        )),
        event_tx: broadcast::channel::<String>(1024).0,
    })
}

/// GET /health — liveness check.
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "audit-service",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// POST /events — record a new audit event.
pub async fn record_event(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RecordEventRequest>,
) -> Result<(StatusCode, Json<RecordEventResponse>), (StatusCode, Json<ErrorResponse>)> {
    if payload.event_type.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "event_type is required".into(),
                code: 400,
            }),
        ));
    }

    let event = AuditEvent {
        id: Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        event_type: payload.event_type,
        actor_id: payload.actor_id,
        resource_id: payload.resource_id,
        details_json: payload.details_json,
        ip_address: payload.ip_address,
    };

    {
        let mut repo = state.repo.lock().await;
        if let Err(e) = repo.insert(&event) {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to persist event: {}", e),
                    code: 500,
                }),
            ));
        }
    }

    // Broadcast to SSE subscribers
    if let Ok(json) = serde_json::to_string(&event) {
        let _ = state.event_tx.send(json);
    }

    tracing::info!(
        event_id = %event.id,
        event_type = %event.event_type,
        actor_id = %event.actor_id,
        resource_id = %event.resource_id,
        "audit event recorded"
    );

    Ok((StatusCode::CREATED, Json(RecordEventResponse { event })))
}

/// GET /events — list events with pagination.
pub async fn list_events(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<EventListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.repo.lock().await;
    let total = repo.count().unwrap_or(0);
    match repo.list(params.limit, params.offset) {
        Ok(events) => {
            let count = events.len();
            Ok(Json(EventListResponse {
                events,
                count,
                total,
            }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to list events: {}", e),
                code: 500,
            }),
        )),
    }
}

/// GET /events/{id} — get a single event.
pub async fn get_event(
    State(state): State<Arc<AppState>>,
    Path(event_id): Path<String>,
) -> Result<Json<AuditEvent>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.repo.lock().await;
    match repo.get(&event_id) {
        Ok(Some(event)) => Ok(Json(event)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Event {} not found", event_id),
                code: 404,
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to get event: {}", e),
                code: 500,
            }),
        )),
    }
}

/// DELETE /events/older-than/{days} — delete events older than N days.
pub async fn delete_older_than(
    State(state): State<Arc<AppState>>,
    Path(days): Path<i64>,
) -> Result<Json<RetentionDeleteResponse>, (StatusCode, Json<ErrorResponse>)> {
    if days <= 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "days must be a positive integer".into(),
                code: 400,
            }),
        ));
    }

    let mut repo = state.repo.lock().await;
    match repo.delete_older_than(days) {
        Ok(deleted) => {
            tracing::info!(
                deleted = deleted,
                older_than_days = days,
                "retention policy applied"
            );
            Ok(Json(RetentionDeleteResponse {
                deleted,
                older_than_days: days,
            }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to apply retention policy: {}", e),
                code: 500,
            }),
        )),
    }
}

/// GET /events/stream — SSE endpoint for real-time event streaming.
pub async fn events_stream(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.event_tx.subscribe();
    let stream = stream::unfold(rx, |rx| async move {
        let mut rx = rx;
        match rx.recv().await {
            Ok(data) => Some((Ok(Event::default().data(data)), rx)),
            Err(broadcast::error::RecvError::Closed) => None,
            Err(broadcast::error::RecvError::Lagged(n)) => {
                tracing::warn!("SSE client lagged by {} messages", n);
                Some((Ok(Event::default().data("{\"type\":\"keepalive\"}")), rx))
            }
        }
    });
    Sse::new(stream)
}

/// Build the full application router.
pub fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics_handler))
        .route("/events", post(record_event).get(list_events))
        .route("/events/{id}", get(get_event))
        .route("/events/older-than/{days}", delete(delete_older_than))
        .route("/events/stream", get(events_stream))
        .with_state(state)
}
