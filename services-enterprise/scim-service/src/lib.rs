//! scim-service — World-Office enterprise SCIM provisioning microservice.
//!
//! Implements SCIM 2.0 (RFC 7643 / RFC 7644) core User and Group CRUD
//! with SQLite persistence.  Enterprise-only — gated by `#[cfg(feature = "enterprise")]`.

pub mod models;
pub mod repository;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use repository::ScimRepository;
use std::sync::Arc;
use tokio::sync::Mutex;

use models::{SCHEMA_GROUP, SCHEMA_USER, ScimError, ScimGroup, ScimListResponse, ScimUser};

static METRICS: std::sync::LazyLock<PrometheusHandle> = std::sync::LazyLock::new(|| {
    PrometheusBuilder::new()
        .install_recorder()
        .expect("failed to install prometheus recorder")
});

async fn metrics_handler() -> String {
    METRICS.render()
}

/// Application state shared across all request handlers.
#[derive(Clone)]
pub struct AppState {
    pub repo: Arc<Mutex<ScimRepository>>,
}

/// SCIM filter query parameters.
#[derive(serde::Deserialize, Debug, Default)]
pub struct ListQuery {
    pub filter: Option<String>,
    pub start_index: Option<i64>,
    pub count: Option<i64>,
}

/// Create a fresh AppState backed by an in-memory database (for tests).
pub fn create_test_state() -> Arc<AppState> {
    Arc::new(AppState {
        repo: Arc::new(Mutex::new(
            ScimRepository::new_in_memory().expect("failed to open in-memory db"),
        )),
    })
}

#[derive(serde::Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub version: &'static str,
}

pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "scim-service",
        version: env!("CARGO_PKG_VERSION"),
    })
}

pub async fn list_users(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListQuery>,
) -> Result<Json<ScimListResponse>, (StatusCode, Json<ScimError>)> {
    let repo = state.repo.lock().await;
    let all = repo.list_users().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
        )
    })?;

    let filtered: Vec<ScimUser> = if let Some(ref filter_expr) = query.filter {
        apply_user_filter(all, filter_expr)
    } else {
        all
    };

    let total = filtered.len() as i64;
    let users_json: Vec<serde_json::Value> = filtered
        .into_iter()
        .map(|u| {
            let mut val = serde_json::to_value(u).unwrap_or_default();
            let id = val
                .get("id")
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_default();
            if let Some(obj) = val.as_object_mut() {
                if let Some(meta) = obj.get_mut("meta") {
                    if let Some(m) = meta.as_object_mut() {
                        m.insert(
                            "location".into(),
                            serde_json::Value::String(format!("/v2/Users/{}", id)),
                        );
                    }
                }
            }
            val
        })
        .collect();

    Ok(Json(ScimListResponse::new(users_json, total)))
}

pub async fn create_user(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ScimError>)> {
    let schemas = payload
        .get("schemas")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if !schemas.contains(&SCHEMA_USER.to_string()) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ScimError::new(
                Some("invalidValue"),
                "Missing or invalid schemas attribute; must include \
                 urn:ietf:params:scim:schemas:core:2.0:User",
                400,
            )),
        ));
    }

    let user: ScimUser = serde_json::from_value(payload.clone()).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ScimError::new(Some("invalidValue"), &e.to_string(), 400)),
        )
    })?;

    {
        let repo = state.repo.lock().await;
        if let Ok(Some(_)) = repo.get_user_by_name(&user.user_name) {
            return Err((
                StatusCode::CONFLICT,
                Json(ScimError::new(
                    Some("uniqueness"),
                    "User with this userName already exists",
                    409,
                )),
            ));
        }
    }

    let id = {
        let mut repo = state.repo.lock().await;
        repo.insert_user(&user).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
            )
        })?
    };

    let repo = state.repo.lock().await;
    let created = repo.get_user(&id).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
        )
    })?;

    if let Some(mut user) = created {
        user.meta.as_mut().map(|m| {
            m.location = Some(format!("/v2/Users/{}", id));
        });
        let val = serde_json::to_value(user).unwrap_or_default();
        tracing::info!(user_id = %id, user_name = %payload["userName"], "user created");
        Ok((StatusCode::CREATED, Json(val)))
    } else {
        Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ScimError::new(
                Some("internalError"),
                "Failed to retrieve created user",
                500,
            )),
        ))
    }
}

pub async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ScimError>)> {
    let repo = state.repo.lock().await;
    match repo.get_user(&user_id).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
        )
    })? {
        Some(mut user) => {
            user.meta.as_mut().map(|m| {
                m.location = Some(format!("/v2/Users/{}", user_id));
            });
            let val = serde_json::to_value(user).unwrap_or_default();
            Ok(Json(val))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ScimError::new(
                Some("notFound"),
                &format!("User {} not found", user_id),
                404,
            )),
        )),
    }
}

pub async fn update_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ScimError>)> {
    let user: ScimUser = serde_json::from_value(payload.clone()).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ScimError::new(Some("invalidValue"), &e.to_string(), 400)),
        )
    })?;

    let updated = {
        let mut repo = state.repo.lock().await;
        repo.update_user(&user_id, &user).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
            )
        })?
    };

    if !updated {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ScimError::new(
                Some("notFound"),
                &format!("User {} not found", user_id),
                404,
            )),
        ));
    }

    let repo = state.repo.lock().await;
    let mut result = repo
        .get_user(&user_id)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(
                    Some("internalError"),
                    "User disappeared after update",
                    500,
                )),
            )
        })?;

    result.meta.as_mut().map(|m| {
        m.location = Some(format!("/v2/Users/{}", user_id));
    });
    let val = serde_json::to_value(result).unwrap_or_default();
    tracing::info!(user_id = %user_id, "user updated");
    Ok(Json(val))
}

pub async fn patch_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ScimError>)> {
    let updated = {
        let mut repo = state.repo.lock().await;
        repo.patch_user(&user_id, &payload).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
            )
        })?
    };

    if !updated {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ScimError::new(
                Some("notFound"),
                &format!("User {} not found", user_id),
                404,
            )),
        ));
    }

    let repo = state.repo.lock().await;
    let mut result = repo
        .get_user(&user_id)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(
                    Some("internalError"),
                    "User disappeared after patch",
                    500,
                )),
            )
        })?;

    result.meta.as_mut().map(|m| {
        m.location = Some(format!("/v2/Users/{}", user_id));
    });
    let val = serde_json::to_value(result).unwrap_or_default();
    tracing::info!(user_id = %user_id, "user patched");
    Ok(Json(val))
}

pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ScimError>)> {
    let deleted = {
        let mut repo = state.repo.lock().await;
        repo.delete_user(&user_id).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
            )
        })?
    };

    if !deleted {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ScimError::new(
                Some("notFound"),
                &format!("User {} not found", user_id),
                404,
            )),
        ));
    }

    tracing::info!(user_id = %user_id, "user deleted");
    Ok(Json(serde_json::json!({
        "schemas": [models::SCHEMA_ERROR],
        "detail": format!("User {} deleted", user_id),
        "status": "200",
    })))
}

pub async fn list_groups(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListQuery>,
) -> Result<Json<ScimListResponse>, (StatusCode, Json<ScimError>)> {
    let repo = state.repo.lock().await;
    let all = repo.list_groups().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
        )
    })?;

    let filtered: Vec<ScimGroup> = if let Some(ref filter_expr) = query.filter {
        apply_group_filter(all, filter_expr)
    } else {
        all
    };

    let total = filtered.len() as i64;
    let groups_json: Vec<serde_json::Value> = filtered
        .into_iter()
        .map(|g| {
            let mut val = serde_json::to_value(g).unwrap_or_default();
            let id = val
                .get("id")
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_default();
            if let Some(obj) = val.as_object_mut() {
                if let Some(meta) = obj.get_mut("meta") {
                    if let Some(m) = meta.as_object_mut() {
                        m.insert(
                            "location".into(),
                            serde_json::Value::String(format!("/v2/Groups/{}", id)),
                        );
                    }
                }
            }
            val
        })
        .collect();

    Ok(Json(ScimListResponse::new(groups_json, total)))
}

pub async fn create_group(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<ScimError>)> {
    let schemas = payload
        .get("schemas")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if !schemas.contains(&SCHEMA_GROUP.to_string()) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ScimError::new(
                Some("invalidValue"),
                "Missing or invalid schemas attribute; must include \
                 urn:ietf:params:scim:schemas:core:2.0:Group",
                400,
            )),
        ));
    }

    let group: ScimGroup = serde_json::from_value(payload.clone()).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ScimError::new(Some("invalidValue"), &e.to_string(), 400)),
        )
    })?;

    let id = {
        let mut repo = state.repo.lock().await;
        repo.insert_group(&group).map_err(|e| {
            (
                StatusCode::CONFLICT,
                Json(ScimError::new(
                    Some("uniqueness"),
                    &format!(
                        "Group '{}' already exists or other conflict: {}",
                        group.display_name, e
                    ),
                    409,
                )),
            )
        })?
    };

    let repo = state.repo.lock().await;
    let mut created = repo
        .get_group(&id)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(
                    Some("internalError"),
                    "Failed to retrieve created group",
                    500,
                )),
            )
        })?;

    created.meta.as_mut().map(|m| {
        m.location = Some(format!("/v2/Groups/{}", id));
    });
    let val = serde_json::to_value(created).unwrap_or_default();
    tracing::info!(group_id = %id, display_name = %group.display_name, "group created");
    Ok((StatusCode::CREATED, Json(val)))
}

pub async fn get_group(
    State(state): State<Arc<AppState>>,
    Path(group_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ScimError>)> {
    let repo = state.repo.lock().await;
    match repo.get_group(&group_id).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
        )
    })? {
        Some(mut group) => {
            group.meta.as_mut().map(|m| {
                m.location = Some(format!("/v2/Groups/{}", group_id));
            });
            let val = serde_json::to_value(group).unwrap_or_default();
            Ok(Json(val))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ScimError::new(
                Some("notFound"),
                &format!("Group {} not found", group_id),
                404,
            )),
        )),
    }
}

pub async fn update_group(
    State(state): State<Arc<AppState>>,
    Path(group_id): Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ScimError>)> {
    let group: ScimGroup = serde_json::from_value(payload.clone()).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ScimError::new(Some("invalidValue"), &e.to_string(), 400)),
        )
    })?;

    let updated = {
        let mut repo = state.repo.lock().await;
        repo.update_group(&group_id, &group).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
            )
        })?
    };

    if !updated {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ScimError::new(
                Some("notFound"),
                &format!("Group {} not found", group_id),
                404,
            )),
        ));
    }

    let repo = state.repo.lock().await;
    let mut result = repo
        .get_group(&group_id)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(
                    Some("internalError"),
                    "Group disappeared after update",
                    500,
                )),
            )
        })?;

    result.meta.as_mut().map(|m| {
        m.location = Some(format!("/v2/Groups/{}", group_id));
    });
    let val = serde_json::to_value(result).unwrap_or_default();
    tracing::info!(group_id = %group_id, "group updated");
    Ok(Json(val))
}

pub async fn delete_group(
    State(state): State<Arc<AppState>>,
    Path(group_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ScimError>)> {
    let deleted = {
        let mut repo = state.repo.lock().await;
        repo.delete_group(&group_id).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScimError::new(Some("internalError"), &e.to_string(), 500)),
            )
        })?
    };

    if !deleted {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ScimError::new(
                Some("notFound"),
                &format!("Group {} not found", group_id),
                404,
            )),
        ));
    }

    tracing::info!(group_id = %group_id, "group deleted");
    Ok(Json(serde_json::json!({
        "schemas": [models::SCHEMA_ERROR],
        "detail": format!("Group {} deleted", group_id),
        "status": "200",
    })))
}

/// Apply a basic SCIM filter expression to a list of users.
/// Supports: `userName eq "value"`, `active eq true`, `displayName eq "value"`.
fn apply_user_filter(users: Vec<ScimUser>, filter: &str) -> Vec<ScimUser> {
    let filter = filter.trim();
    users
        .into_iter()
        .filter(|u| evaluate_user_filter(u, filter))
        .collect()
}

fn evaluate_user_filter(user: &ScimUser, filter: &str) -> bool {
    let parts: Vec<&str> = filter.splitn(3, ' ').collect();
    if parts.len() < 3 || parts[1] != "eq" {
        return true;
    }

    let attr = parts[0];
    let value = parts[2].trim_matches('"');

    match attr {
        "userName" => user.user_name.eq_ignore_ascii_case(value),
        "displayName" => user
            .display_name
            .as_deref()
            .map(|d| d.eq_ignore_ascii_case(value))
            .unwrap_or(false),
        "active" => {
            let bool_val = value.parse::<bool>().unwrap_or(true);
            user.active.unwrap_or(true) == bool_val
        }
        "id" => user.id.as_deref() == Some(value),
        _ => true,
    }
}

/// Apply a basic SCIM filter expression to a list of groups.
fn apply_group_filter(groups: Vec<ScimGroup>, filter: &str) -> Vec<ScimGroup> {
    let filter = filter.trim();
    groups
        .into_iter()
        .filter(|g| evaluate_group_filter(g, filter))
        .collect()
}

fn evaluate_group_filter(group: &ScimGroup, filter: &str) -> bool {
    let parts: Vec<&str> = filter.splitn(3, ' ').collect();
    if parts.len() < 3 || parts[1] != "eq" {
        return true;
    }

    let attr = parts[0];
    let value = parts[2].trim_matches('"');

    match attr {
        "displayName" => group.display_name.eq_ignore_ascii_case(value),
        "id" => group.id.as_deref() == Some(value),
        _ => true,
    }
}

/// Build the full SCIM service router.
pub fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics_handler))
        .route("/v2/Users", get(list_users).post(create_user))
        .route(
            "/v2/Users/{id}",
            get(get_user)
                .put(update_user)
                .patch(patch_user)
                .delete(delete_user),
        )
        .route("/v2/Groups", get(list_groups).post(create_group))
        .route(
            "/v2/Groups/{id}",
            get(get_group).put(update_group).delete(delete_group),
        )
        .with_state(state)
}
