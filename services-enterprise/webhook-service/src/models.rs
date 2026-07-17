//! Data types for webhook management and delivery.

use serde::{Deserialize, Serialize};

/// A registered webhook endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Webhook {
    pub id: String,
    pub url: String,
    pub events: Vec<String>,
    pub secret: String,
    pub enabled: bool,
    pub max_retries: i32,
    pub timeout_ms: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Request payload for creating or updating a webhook.
#[derive(Debug, Deserialize)]
pub struct WebhookRequest {
    pub url: String,
    pub events: Vec<String>,
    #[serde(default)]
    pub secret: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default = "default_max_retries")]
    pub max_retries: i32,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: i64,
}

fn default_enabled() -> bool {
    true
}

fn default_max_retries() -> i32 {
    3
}

fn default_timeout_ms() -> i64 {
    5000
}

/// Record of a single delivery attempt for a webhook event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeliveryLog {
    pub id: String,
    pub webhook_id: String,
    pub event_type: String,
    pub payload: String,
    pub status: String,
    pub status_code: Option<i32>,
    pub attempt: i32,
    pub error: Option<String>,
    pub next_retry_at: Option<String>,
    pub created_at: String,
}

/// Event payload delivered to webhook endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventPayload {
    pub event_type: String,
    pub resource_type: String,
    pub resource_id: String,
    pub timestamp: String,
    #[serde(default)]
    pub data: serde_json::Value,
}

/// Request to trigger webhook delivery for an event.
///
/// Called by other services (e.g. storage-service on document events).
#[derive(Debug, Deserialize)]
pub struct TriggerRequest {
    pub event_type: String,
    pub resource_type: String,
    pub resource_id: String,
    #[serde(default)]
    pub data: serde_json::Value,
}

// ── Response types ──

#[derive(Debug, Serialize)]
pub struct WebhookListResponse {
    pub webhooks: Vec<Webhook>,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct DeliveryLogListResponse {
    pub delivery_logs: Vec<DeliveryLog>,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: u16,
}
