// wo-docserver — World-Office Document Server library.
//
// Serves the React editor UI and proxies WOPI requests to OCIS.

pub mod config;
pub mod static_files;
pub mod wopi;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Json},
    routing::{any, get, post},
    Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use metrics_exporter_prometheus::PrometheusBuilder;

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
        let wopi_client = WopiClient::new(config.wopi_host_url.clone(), config.public_url.clone());
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

/// Resolve the public base URL for a given editor type.
///
/// Precedence: per-editor env var (e.g. EDITOR_URL_WORD) > shared
/// EDITOR_HOST/<type> > dev defaults. The shared host must be set in
/// production deployments; otherwise the redirect goes to localhost.
fn editor_base_url(editor_type: &str, state: &AppState) -> Option<String> {
    let env_key = match editor_type {
        "word" => "EDITOR_URL_WORD",
        "sheet" => "EDITOR_URL_SHEET",
        "slide" => "EDITOR_URL_SLIDE",
        "diagram" => "EDITOR_URL_DIAGRAM",
        "pdf" => "EDITOR_URL_PDF",
        _ => return None,
    };
    if let Ok(url) = std::env::var(env_key) {
        return Some(url);
    }
    if let Ok(host) = std::env::var("EDITOR_HOST") {
        return Some(format!("{}/{}", host.trim_end_matches('/'), editor_type));
    }
    let _ = state;
    match editor_type {
        "word" => Some("http://localhost:3006".into()),
        "sheet" => Some("http://localhost:3007".into()),
        "slide" => Some("http://localhost:3005".into()),
        "diagram" => Some("http://localhost:3003".into()),
        "pdf" => Some("http://localhost:3004".into()),
        _ => None,
    }
}

/// GET /hosting/wopi/{editor_type}/{action}
///
/// The OCIS collaboration service POSTs a form here with `access_token`
/// (and optionally `file_id`) in the body and `WOPISrc` (and UI locale)
/// in the query string. We accept both methods and respond with an HTML
/// shell that redirects the browser to the matching React editor with
/// the token now in the query string so the editor can read it without
/// needing to parse the original form body.
async fn hosting_wopi_handler(
    State(state): State<AppState>,
    Path(path): Path<String>,
    request: axum::http::Request<axum::body::Body>,
) -> axum::response::Response {
    let editor_type = path.split('/').next().unwrap_or(&path);
    let Some(base) = editor_base_url(editor_type, &state) else {
        return (axum::http::StatusCode::NOT_FOUND, editor_type.to_string()).into_response();
    };

    // POST: read the form body, put the access_token back into the
    // redirect query string so the editor can read it.
    // GET: pass through whatever the user already has on the URL.
    let method = request.method().clone();
    let access_token = if method == axum::http::Method::POST {
        let bytes = axum::body::to_bytes(request.into_body(), 64 * 1024)
            .await
            .unwrap_or_default();
        let body = String::from_utf8_lossy(&bytes);
        parse_form_field(&body, "access_token")
    } else {
        String::new()
    };

    let redirect_qs = if method == axum::http::Method::POST && !access_token.is_empty() {
        format!("access_token={}", urlencoding(&access_token))
    } else {
        String::new()
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
      var redirectQs = '{redirect_qs}';
      var editorUrl = '{editor_base}/?' + redirectQs;
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
        redirect_qs = redirect_qs,
    );
    axum::response::Html(html).into_response()
}

/// Extract a single form field from an `application/x-www-form-urlencoded`
/// body. Returns an empty string if the body is empty or the field is
/// missing.
fn parse_form_field(body: &str, field: &str) -> String {
    for pair in body.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == field {
                return url_decode(v);
            }
        }
    }
    String::new()
}

fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
        } else if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("00"),
                16,
            ) {
                out.push(b);
                i += 3;
            } else {
                out.push(bytes[i]);
                i += 1;
            }
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Minimal URL component encoder for the access_token path.
fn urlencoding(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{:02X}", b),
        })
        .collect()
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

#[derive(Debug, Serialize)]
#[allow(non_snake_case)]
struct DemoFileInfo {
    BaseFileName: String,
    OwnerId: String,
    Size: u64,
    Version: String,
    UserCanWrite: bool,
    UserId: String,
    UserFriendlyName: String,
}

async fn demo_info_handler() -> Json<DemoFileInfo> {
    Json(DemoFileInfo {
        BaseFileName: "demo.docx".into(),
        OwnerId: "demo".into(),
        Size: 0,
        Version: "1.0".into(),
        UserCanWrite: false,
        UserId: "demo-user".into(),
        UserFriendlyName: "Demo User".into(),
    })
}

async fn demo_document_handler() -> Result<
    (
        axum::http::StatusCode,
        [(axum::http::HeaderName, String); 1],
        Vec<u8>,
    ),
    AppError,
> {
    let path = std::env::var("DEMO_DOC_PATH").unwrap_or_else(|_| "./demo.docx".into());
    let data = tokio::fs::read(&path)
        .await
        .map_err(|e| AppError::NotFound(format!("Demo file not found: {e}")))?;
    Ok((
        axum::http::StatusCode::OK,
        [(
            axum::http::header::CONTENT_TYPE,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document".into(),
        )],
        data,
    ))
}

// ── Router builder ──────────────────────────────────────────────────────

/// Initialize metrics exporter
fn init_metrics() {
    PrometheusBuilder::new()
        .with_http_listener("0.0.0.0:9091".parse::<SocketAddr>().unwrap())
        .install()
        .expect("Failed to install Prometheus recorder");
}

/// Build the application router.
pub fn create_app(config: DocServerConfig) -> Router {
    let state = AppState::new(config.clone());

    // Initialize metrics
    let _metrics = init_metrics();

    let mut app = Router::new()
        .route("/health", get(health_handler))
        .route("/hosting/discovery", get(discovery_handler))
        .route("/hosting/wopi/{*path}", any(hosting_wopi_handler))
        .route("/wopi/files/{file_id}", get(wopi_check_file_info))
        .route(
            "/wopi/files/{file_id}/contents",
            get(wopi_get_file).post(wopi_put_file),
        )
        .route("/api/conversion/convert", post(conversion_convert))
        .route("/api/conversion/formats", get(conversion_formats))
        .route("/demo/info", get(demo_info_handler))
        .route("/demo/document", get(demo_document_handler))
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
            public_url: "http://localhost:9999".into(),
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
    async fn test_hosting_wopi_accepts_post_with_form_body() {
        let app = create_app(test_config());
        use axum::http::header::CONTENT_TYPE;
        let body = "access_token=secret123&file_id=abc-456";
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/hosting/wopi/word/edit?WOPISrc=https%3A%2F%2Fexample.com%2Fwopi%2Ffiles%2Fabc")
                    .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024)
            .await
            .unwrap();
        let html = String::from_utf8_lossy(&bytes);
        assert!(
            html.contains("access_token=secret123"),
            "redirect query string must carry the access_token: {html}"
        );
        assert!(html.contains("Redirecting to word editor"));
    }

    #[tokio::test]
    async fn test_hosting_wopi_accepts_get_with_query_token() {
        let app = create_app(test_config());
        let resp = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/hosting/wopi/sheet/edit?access_token=querytoken&file_id=xyz")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024)
            .await
            .unwrap();
        let html = String::from_utf8_lossy(&bytes);
        assert!(html.contains("Redirecting to sheet editor"));
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
