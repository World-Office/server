// wo-docserver — World-Office Document Server library.
//
// Serves the React editor UI and proxies WOPI requests to OCIS.

pub mod config;
pub mod static_files;
pub mod wopi;

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use wo_x2t::ConversionRouter;
use wopi::WopiClient;

use crate::config::DocServerConfig;

/// Application state shared across all handlers.
#[derive(Clone)]
pub struct AppState {
    pub config: DocServerConfig,
    pub wopi_client: WopiClient,
    pub conversion_router: Arc<ConversionRouter>,
}

impl AppState {
    /// Build application state from configuration.
    pub fn new(config: DocServerConfig) -> Self {
        let wopi_client = WopiClient::new(config.wopi_host_url.clone());
        Self {
            config,
            wopi_client,
            conversion_router: Arc::new(ConversionRouter::new()),
        }
    }
}

// ── Error type ──────────────────────────────────────────────────────────

/// Top-level error type for document server handlers.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Conversion error: {0}")]
    Conversion(String),
    #[error("WOPI proxy error: {0}")]
    Wopi(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match &self {
            AppError::BadRequest(msg) => (axum::http::StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Unauthorized(msg) => (axum::http::StatusCode::UNAUTHORIZED, msg.clone()),
            AppError::NotFound(msg) => (axum::http::StatusCode::NOT_FOUND, msg.clone()),
            AppError::Conversion(msg) => {
                (axum::http::StatusCode::INTERNAL_SERVER_ERROR, msg.clone())
            }
            AppError::Wopi(e) => {
                tracing::error!("WOPI proxy error: {e}");
                (
                    axum::http::StatusCode::BAD_GATEWAY,
                    "Upstream WOPI host error".into(),
                )
            }
        };
        (status, message).into_response()
    }
}

// ── Query parameter types ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct TokenQuery {
    access_token: String,
}

// ── Request / response types ────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ConversionRequest {
    source_format: String,
    target_format: String,
    data: String, // base64-encoded
}

#[derive(Debug, Serialize, Deserialize)]
struct ConversionResponse {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>, // base64-encoded
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    duration_ms: u64,
}

#[derive(Debug, Serialize)]
struct FormatsResponse {
    formats: Vec<[String; 2]>,
}

// ── Handlers ────────────────────────────────────────────────────────────

/// GET /health
async fn health_handler() -> &'static str {
    "ok"
}

/// GET /hosting/discovery — proxy to the WOPI host's discovery endpoint.
///
/// The OCIS WOPI host provides this endpoint which lists all supported WOPI
/// actions and URL templates. We proxy through the docserver so that E2E
/// health checks (which target the docserver) still pass when OCIS is available.
async fn discovery_handler(State(state): State<AppState>) -> Result<String, AppError> {
    let discovery = state
        .wopi_client
        .get_discovery()
        .await
        .map_err(AppError::Wopi)?;
    Ok(discovery)
}

/// Map editor type from WOPI route path to the editor's dev/static URL.
fn editor_base_url(editor_type: &str) -> Option<&'static str> {
    match editor_type {
        "word" => Some("http://localhost:3006"),
        "sheet" => Some("http://localhost:3007"),
        "slide" => Some("http://localhost:3005"),
        "diagram" => Some("http://localhost:3003"),
        "pdf" => Some("http://localhost:3004"),
        _ => None,
    }
}

/// GET /hosting/wopi/{editor_type}/{action}
///
/// Serves a minimal HTML shell that loads the correct React editor app
/// with WOPI access_token and file_id passed through from URL query params.
async fn hosting_wopi_handler(
    State(_state): State<AppState>,
    Path(path): Path<String>,
) -> axum::response::Response {
    let editor_type = path.split('/').next().unwrap_or(&path);
    let Some(base) = editor_base_url(editor_type) else {
        return (axum::http::StatusCode::NOT_FOUND, editor_type.to_string()).into_response();
    };

    let html = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>World Office – {editor}</title>
  <script>
    (function() {{
      var params = new URLSearchParams(location.search);
      var token = params.get('access_token');
      var fileId = params.get('file_id');
      if (token && fileId) {{
        window.__WORLD_OFFICE_CONFIG__ = {{
          accessToken: token,
          fileId: fileId,
          fileType: '{editor_ext}'
        }};
      }}
      var editorUrl = '{editor_base}/?' + location.search.slice(1);
      window.location.replace(editorUrl);
    }})();
  </script>
</head>
<body>
  <p>Redirecting to {editor} editor…</p>
</body>
</html>"#,
        editor = editor_type,
        editor_base = base,
        editor_ext = editor_type,
    );
    axum::response::Html(html).into_response()
}

/// GET /wopi/files/:file_id  →  proxy CheckFileInfo to OCIS
async fn wopi_check_file_info(
    State(state): State<AppState>,
    Path(file_id): Path<String>,
    Query(params): Query<TokenQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Validate JWT
    let _claims = WopiClient::validate_token(&params.access_token, &state.config.jwt_secret)
        .map_err(|e| AppError::Unauthorized(e.to_string()))?;

    let info = state
        .wopi_client
        .check_file_info(&file_id, &params.access_token)
        .await?;
    Ok(Json(info))
}

/// GET /wopi/files/:file_id/contents  →  proxy GetFile to OCIS
async fn wopi_get_file(
    State(state): State<AppState>,
    Path(file_id): Path<String>,
    Query(params): Query<TokenQuery>,
) -> Result<axum::body::Bytes, AppError> {
    let _claims = WopiClient::validate_token(&params.access_token, &state.config.jwt_secret)
        .map_err(|e| AppError::Unauthorized(e.to_string()))?;

    let data = state
        .wopi_client
        .get_file(&file_id, &params.access_token)
        .await?;
    Ok(axum::body::Bytes::from(data))
}

/// POST /wopi/files/:file_id/contents  →  proxy PutFile to OCIS
async fn wopi_put_file(
    State(state): State<AppState>,
    Path(file_id): Path<String>,
    Query(params): Query<TokenQuery>,
    body: axum::body::Bytes,
) -> Result<(), AppError> {
    let _claims = WopiClient::validate_token(&params.access_token, &state.config.jwt_secret)
        .map_err(|e| AppError::Unauthorized(e.to_string()))?;

    state
        .wopi_client
        .put_file(&file_id, &params.access_token, body.to_vec())
        .await?;
    Ok(())
}

/// POST /api/conversion/convert  —  convert a document via wo-x2t
async fn conversion_convert(
    State(state): State<AppState>,
    Json(req): Json<ConversionRequest>,
) -> Result<Json<ConversionResponse>, AppError> {
    let data = BASE64
        .decode(&req.data)
        .map_err(|e| AppError::BadRequest(format!("Invalid base64 data: {e}")))?;

    let result = state
        .conversion_router
        .convert(&req.source_format, &req.target_format, &data);

    let resp = match result.status {
        wo_x2t::ConversionStatus::Success | wo_x2t::ConversionStatus::PartialSuccess => {
            let output = result.output.ok_or_else(|| {
                AppError::Conversion("Conversion succeeded but produced no output".into())
            })?;
            ConversionResponse {
                status: "Success".into(),
                data: Some(BASE64.encode(&output.data)),
                format: Some(output.format),
                error: None,
                duration_ms: result.duration_ms,
            }
        }
        wo_x2t::ConversionStatus::UnsupportedFormat => ConversionResponse {
            status: "UnsupportedFormat".into(),
            data: None,
            format: None,
            error: result.error,
            duration_ms: result.duration_ms,
        },
        _ => ConversionResponse {
            status: "Failed".into(),
            data: None,
            format: None,
            error: result.error,
            duration_ms: result.duration_ms,
        },
    };

    Ok(Json(resp))
}

/// GET /api/conversion/formats  —  list supported conversion pairs
async fn conversion_formats(State(state): State<AppState>) -> Json<FormatsResponse> {
    let pairs = state
        .conversion_router
        .registry()
        .registered_pairs()
        .into_iter()
        .map(|(s, t)| [s.to_string(), t.to_string()])
        .collect();

    Json(FormatsResponse { formats: pairs })
}

// ── Router builder ──────────────────────────────────────────────────────

/// Build the application router.
pub fn create_app(config: DocServerConfig) -> Router {
    let state = AppState::new(config.clone());

    let mut app = Router::new()
        .route("/health", get(health_handler))
        .route("/hosting/discovery", get(discovery_handler))
        .route("/hosting/wopi/{*path}", get(hosting_wopi_handler))
        .route("/wopi/files/{file_id}", get(wopi_check_file_info))
        .route(
            "/wopi/files/{file_id}/contents",
            get(wopi_get_file).post(wopi_put_file),
        )
        .route("/api/conversion/convert", post(conversion_convert))
        .route("/api/conversion/formats", get(conversion_formats))
        .with_state(state);

    // Serve editor UI if the directory exists, otherwise fall back to landing page
    if let Some(serve_dir) = static_files::editor_ui_service(&config.editor_ui_dir) {
        app = app.fallback_service(serve_dir);
    } else {
        app = app.route("/", get(static_files::landing_page_handler));
    }

    app
}

// ── Integration tests ───────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt; // for oneshot

    fn test_config() -> DocServerConfig {
        DocServerConfig {
            host: "127.0.0.1".into(),
            port: 0,
            jwt_secret: "test-secret".into(),
            wopi_host_url: "http://localhost:9999".into(),
            editor_ui_dir: "./nonexistent-ui".into(),
            data_dir: "./test-data".into(),
        }
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let app = create_app(test_config());
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_landing_page_when_no_editor_ui() {
        let app = create_app(test_config());
        let resp = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_wopi_check_file_info_rejects_missing_token() {
        let app = create_app(test_config());
        // No access_token query param → axum will return 400 (missing query param)
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/wopi/files/test-file-id")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // Should be 400 (missing query parameter) or 401
        assert!(
            resp.status() == StatusCode::BAD_REQUEST || resp.status() == StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn test_conversion_formats_endpoint() {
        let app = create_app(test_config());
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/api/conversion/formats")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_conversion_convert_txt_to_html() {
        use axum::http::header::CONTENT_TYPE;

        let app = create_app(test_config());
        let payload = serde_json::json!({
            "source_format": "txt",
            "target_format": "html",
            "data": BASE64.encode(b"Hello World"),
        });

        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/conversion/convert")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);

        // Read response body
        let body_bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let resp_json: ConversionResponse = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(resp_json.status, "Success");
        assert!(resp_json.data.is_some());

        // Decode and verify it contains "Hello World"
        let decoded = BASE64.decode(resp_json.data.unwrap()).unwrap();
        let html = String::from_utf8(decoded).unwrap();
        assert!(html.contains("Hello World"));
    }

    #[tokio::test]
    async fn test_conversion_convert_unsupported() {
        use axum::http::header::CONTENT_TYPE;

        let app = create_app(test_config());
        let payload = serde_json::json!({
            "source_format": "docx",
            "target_format": "pdf",
            "data": BASE64.encode(b"fake docx"),
        });

        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/conversion/convert")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);

        let body_bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let resp_json: ConversionResponse = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(resp_json.status, "UnsupportedFormat");
        assert!(resp_json.error.is_some());
    }
}
