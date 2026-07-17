#![cfg(feature = "enterprise")]

//! Webhook dispatch microservice for enterprise World-Office.
//!
//! Manages outgoing webhook registrations and delivers document lifecycle
//! events (created, edited, shared, deleted, etc.) to registered endpoints.

pub mod delivery;
pub mod models;
pub mod repository;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use chrono::Utc;
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use models::*;
use repository::WebhookRepository;
use std::sync::{Arc, LazyLock};
use tokio::sync::Mutex;
use uuid::Uuid;

static METRICS: LazyLock<PrometheusHandle> = LazyLock::new(|| {
    PrometheusBuilder::new()
        .install_recorder()
        .expect("failed to install prometheus recorder")
});

async fn metrics_handler() -> String {
    METRICS.render()
}

/// Application shared state holding the database repository.
#[derive(Clone)]
pub struct AppState {
    pub repo: Arc<Mutex<WebhookRepository>>,
}

/// Create a fresh [`AppState`] backed by an in-memory SQLite database (for tests).
pub fn create_test_state() -> Arc<AppState> {
    Arc::new(AppState {
        repo: Arc::new(Mutex::new(
            WebhookRepository::new_in_memory().expect("failed to open in-memory db"),
        )),
    })
}

// ── Handlers ──

/// GET /health
pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "webhook-service",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

/// POST /hooks — register a new webhook.
pub async fn create_webhook(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<WebhookRequest>,
) -> Result<(StatusCode, Json<Webhook>), (StatusCode, Json<ErrorResponse>)> {
    if payload.url.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "url is required".into(),
                code: 400,
            }),
        ));
    }
    if payload.events.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "at least one event is required".into(),
                code: 400,
            }),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let webhook = Webhook {
        id: Uuid::new_v4().to_string(),
        url: payload.url,
        events: payload.events,
        secret: payload.secret,
        enabled: payload.enabled,
        max_retries: payload.max_retries,
        timeout_ms: payload.timeout_ms,
        created_at: now.clone(),
        updated_at: now,
    };

    {
        let mut repo = state.repo.lock().await;
        if let Err(e) = repo.insert_webhook(&webhook) {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("failed to create webhook: {}", e),
                    code: 500,
                }),
            ));
        }
    }

    tracing::info!(webhook_id = %webhook.id, url = %webhook.url, "webhook registered");
    Ok((StatusCode::CREATED, Json(webhook)))
}

/// GET /hooks — list all registered webhooks.
pub async fn list_webhooks(
    State(state): State<Arc<AppState>>,
) -> Result<Json<WebhookListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.repo.lock().await;
    match repo.list_webhooks() {
        Ok(webhooks) => {
            let count = webhooks.len();
            Ok(Json(WebhookListResponse { webhooks, count }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("failed to list webhooks: {}", e),
                code: 500,
            }),
        )),
    }
}

/// GET /hooks/{id} — get a single webhook by id.
pub async fn get_webhook(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Webhook>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.repo.lock().await;
    match repo.get_webhook(&id) {
        Ok(Some(w)) => Ok(Json(w)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("webhook {} not found", id),
                code: 404,
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("failed to get webhook: {}", e),
                code: 500,
            }),
        )),
    }
}

/// PUT /hooks/{id} — update an existing webhook.
pub async fn update_webhook(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(payload): Json<WebhookRequest>,
) -> Result<Json<Webhook>, (StatusCode, Json<ErrorResponse>)> {
    let existing = {
        let repo = state.repo.lock().await;
        match repo.get_webhook(&id) {
            Ok(Some(w)) => w,
            Ok(None) => {
                return Err((
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: format!("webhook {} not found", id),
                        code: 404,
                    }),
                ));
            }
            Err(e) => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("failed to get webhook: {}", e),
                        code: 500,
                    }),
                ));
            }
        }
    };

    let now = Utc::now().to_rfc3339();
    let updated = Webhook {
        id: existing.id,
        url: payload.url,
        events: payload.events,
        secret: payload.secret,
        enabled: payload.enabled,
        max_retries: payload.max_retries,
        timeout_ms: payload.timeout_ms,
        created_at: existing.created_at,
        updated_at: now,
    };

    {
        let mut repo = state.repo.lock().await;
        if let Err(e) = repo.update_webhook(&updated) {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("failed to update webhook: {}", e),
                    code: 500,
                }),
            ));
        }
    }

    tracing::info!(webhook_id = %id, "webhook updated");
    Ok(Json(updated))
}

/// DELETE /hooks/{id} — delete a webhook.
pub async fn delete_webhook(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let mut repo = state.repo.lock().await;
    match repo.delete_webhook(&id) {
        Ok(true) => {
            tracing::info!(webhook_id = %id, "webhook deleted");
            Ok(Json(serde_json::json!({"deleted": true, "id": id})))
        }
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("webhook {} not found", id),
                code: 404,
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("failed to delete webhook: {}", e),
                code: 500,
            }),
        )),
    }
}

/// POST /hooks/{id}/test — send a test event to a webhook.
///
/// This performs a live delivery attempt and returns the result without
/// persisting a delivery log entry.
pub async fn test_webhook(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let webhook = {
        let repo = state.repo.lock().await;
        match repo.get_webhook(&id) {
            Ok(Some(w)) => w,
            Ok(None) => {
                return Err((
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: format!("webhook {} not found", id),
                        code: 404,
                    }),
                ));
            }
            Err(e) => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("failed to get webhook: {}", e),
                        code: 500,
                    }),
                ));
            }
        }
    };

    let event = EventPayload {
        event_type: "test".to_string(),
        resource_type: "webhook".to_string(),
        resource_id: "test".to_string(),
        timestamp: Utc::now().to_rfc3339(),
        data: serde_json::json!({"message": "This is a test webhook event from World-Office"}),
    };

    let result = delivery::deliver_webhook(&webhook, &event).await;

    Ok(Json(serde_json::json!({
        "webhook_id": id,
        "success": result.success,
        "status_code": result.status_code,
        "error": result.error,
    })))
}

/// POST /trigger — trigger delivery for all webhooks subscribed to an event.
///
/// Other services call this endpoint to fire events (e.g. "document.created",
/// "document.deleted"). The service looks up matching webhooks, creates
/// delivery log entries, and returns immediately. The background worker
/// handles actual HTTP delivery.
pub async fn trigger_event(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<TriggerRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let webhooks = {
        let repo = state.repo.lock().await;
        match repo.list_webhooks_by_event(&payload.event_type) {
            Ok(list) => list,
            Err(e) => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("failed to query webhooks: {}", e),
                        code: 500,
                    }),
                ));
            }
        }
    };

    let event = EventPayload {
        event_type: payload.event_type.clone(),
        resource_type: payload.resource_type,
        resource_id: payload.resource_id,
        timestamp: Utc::now().to_rfc3339(),
        data: payload.data,
    };

    let payload_json = serde_json::to_string(&event).unwrap_or_default();
    let now = Utc::now().to_rfc3339();

    for webhook in &webhooks {
        let delivery_log = DeliveryLog {
            id: Uuid::new_v4().to_string(),
            webhook_id: webhook.id.clone(),
            event_type: event.event_type.clone(),
            payload: payload_json.clone(),
            status: "pending".to_string(),
            status_code: None,
            attempt: 0,
            error: None,
            next_retry_at: None,
            created_at: now.clone(),
        };

        let mut repo = state.repo.lock().await;
        if let Err(e) = repo.insert_delivery(&delivery_log) {
            tracing::error!(error = %e, webhook_id = %webhook.id, "failed to insert delivery log");
        }
    }

    tracing::info!(
        event_type = %event.event_type,
        webhook_count = webhooks.len(),
        "event triggered"
    );

    Ok(Json(serde_json::json!({
        "triggered": true,
        "event_type": event.event_type,
        "webhook_count": webhooks.len(),
    })))
}

// ── Background worker ──

/// Run the background delivery worker loop.
///
/// Polls for pending deliveries every 30 seconds and processes them with
/// exponential backoff retry.  Spawn this as a `tokio::spawn` task from
/// the binary entry point.
pub async fn run_background_worker(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
    loop {
        interval.tick().await;

        let pending = {
            let repo = state.repo.lock().await;
            repo.list_pending_deliveries().unwrap_or_default()
        };

        if pending.is_empty() {
            continue;
        }

        tracing::debug!(count = pending.len(), "background worker processing deliveries");

        for delivery in pending {
            let webhook = {
                let repo = state.repo.lock().await;
                repo.get_webhook(&delivery.webhook_id).unwrap_or(None)
            };

            let webhook = match webhook {
                Some(w) if w.enabled => w,
                _ => {
                    let mut repo = state.repo.lock().await;
                    let _ = repo.update_delivery_status(
                        &delivery.id,
                        "failed",
                        None,
                        Some("webhook not found or disabled"),
                        delivery.attempt,
                        None,
                    );
                    continue;
                }
            };

            let payload: EventPayload = match serde_json::from_str(&delivery.payload) {
                Ok(p) => p,
                Err(e) => {
                    let mut repo = state.repo.lock().await;
                    let _ = repo.update_delivery_status(
                        &delivery.id,
                        "failed",
                        None,
                        Some(&format!("invalid payload: {}", e)),
                        delivery.attempt,
                        None,
                    );
                    continue;
                }
            };

            let new_attempt = delivery.attempt + 1;
            let result = delivery::deliver_webhook(&webhook, &payload).await;

            if result.success {
                let mut repo = state.repo.lock().await;
                let _ = repo.update_delivery_status(
                    &delivery.id,
                    "delivered",
                    result.status_code,
                    None,
                    new_attempt,
                    None,
                );
                tracing::info!(
                    delivery_id = %delivery.id,
                    webhook_id = %delivery.webhook_id,
                    attempt = new_attempt,
                    "webhook delivered"
                );
            } else if new_attempt >= webhook.max_retries {
                let mut repo = state.repo.lock().await;
                let _ = repo.update_delivery_status(
                    &delivery.id,
                    "failed",
                    result.status_code,
                    result.error.as_deref(),
                    new_attempt,
                    None,
                );
                tracing::warn!(
                    delivery_id = %delivery.id,
                    webhook_id = %delivery.webhook_id,
                    attempt = new_attempt,
                    max_retries = webhook.max_retries,
                    "webhook delivery failed after exhausting retries"
                );
            } else {
                let delay = delivery::retry_delay(new_attempt);
                let next_retry = Utc::now()
                    + chrono::Duration::seconds(delay.as_secs() as i64);
                let next_retry_str = next_retry.to_rfc3339();

                let mut repo = state.repo.lock().await;
                let _ = repo.update_delivery_status(
                    &delivery.id,
                    "pending",
                    result.status_code,
                    result.error.as_deref(),
                    new_attempt,
                    Some(&next_retry_str),
                );
                tracing::info!(
                    delivery_id = %delivery.id,
                    webhook_id = %delivery.webhook_id,
                    attempt = new_attempt,
                    next_retry = %next_retry_str,
                    "webhook delivery scheduled for retry"
                );
            }
        }
    }
}

// ── Router ──

/// Build the full application router with all routes attached.
pub fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics_handler))
        .route("/hooks", post(create_webhook).get(list_webhooks))
        .route(
            "/hooks/{id}",
            get(get_webhook).put(update_webhook).delete(delete_webhook),
        )
        .route("/hooks/{id}/test", post(test_webhook))
        .route("/trigger", post(trigger_event))
        .with_state(state)
}
