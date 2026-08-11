// wo-docserver — World-Office Document Server library.
//
// Serves the React editor UI and proxies WOPI requests to OCIS.

pub mod config;
pub mod static_files;
pub mod wopi;

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Context;
use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    response::{IntoResponse, Json, Redirect},
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
        let wopi_client = WopiClient::new(
            config.wopi_host_url.clone(),
            config.public_url.clone(),
            config.wopi_insecure,
        );
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
    #[error("Internal error: {0}")]
    InternalError(String),
    #[error("WOPI proxy error: {0}")]
    Wopi(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match &self {
            AppError::BadRequest(msg) => (axum::http::StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Unauthorized(msg) => (axum::http::StatusCode::UNAUTHORIZED, msg.clone()),
            AppError::NotFound(msg) => (axum::http::StatusCode::NOT_FOUND, msg.clone()),
            AppError::InternalError(msg) => {
                (axum::http::StatusCode::INTERNAL_SERVER_ERROR, msg.clone())
            }
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
async fn discovery_handler(
    State(state): State<AppState>,
) -> Result<
    (
        axum::http::StatusCode,
        [(axum::http::HeaderName, String); 1],
        String,
    ),
    AppError,
> {
    let discovery = state
        .wopi_client
        .get_discovery()
        .await
        .map_err(AppError::Wopi)?;
    Ok((
        axum::http::StatusCode::OK,
        [(
            axum::http::header::CONTENT_TYPE,
            "application/xml; charset=utf-8".into(),
        )],
        discovery,
    ))
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
///
/// For supported editor types (word/document, sheet/spreadsheet,
/// slide/presentation) the redirect points to the local `/editors/{type}/`
/// route (WOPI-first bridge).  Other types (diagram, pdf) still redirect
/// to the external URL resolved by [`editor_base_url`].
async fn hosting_wopi_handler(
    State(state): State<AppState>,
    Path(path): Path<String>,
    request: axum::http::Request<axum::body::Body>,
) -> axum::response::Response {
    let editor_type = path.split('/').next().unwrap_or(&path);
    let method = request.method().clone();

    let redirect_base = if let Some(local) = wopi_type_to_local_route(editor_type) {
        local.to_string()
    } else {
        match editor_base_url(editor_type, &state) {
            Some(url) => url,
            None => {
                return (axum::http::StatusCode::NOT_FOUND, editor_type.to_string())
                    .into_response();
            }
        }
    };

    let redirect_url = build_editor_redirect_url(&redirect_base, &method, request).await;

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
          wopiAccessToken: token,
          wopiFileId: fileId
        }};
      }}
      window.location.replace('{redirect_url}');
    }})();
  </script>
</head>
<body>
  <p>Redirecting to {editor} editor…</p>
</body>
</html>"#,
        editor = editor_type,
        redirect_url = redirect_url,
    );
    axum::response::Html(html).into_response()
}

/// Build the editor redirect URL from the base path, HTTP method, and
/// request, carrying through the access_token, file_id, and embedded
/// parameters so the editor can authenticate its WOPI requests.
async fn build_editor_redirect_url(
    base: &str,
    method: &axum::http::Method,
    request: axum::http::Request<axum::body::Body>,
) -> String {
    let clean_base = base.trim_end_matches('/');

    // Extract query string BEFORE consuming the body (borrow-checker)
    let original_query = request.uri().query().unwrap_or("").to_string();

    if method == axum::http::Method::POST {
        // POST: read access_token / file_id / embedded / WOPISrc from form body
        let bytes = axum::body::to_bytes(request.into_body(), 64 * 1024)
            .await
            .unwrap_or_default();
        let body = String::from_utf8_lossy(&bytes);

        let mut qs_parts: Vec<String> = Vec::new();
        let access_token = parse_form_field(&body, "access_token");
        if !access_token.is_empty() {
            qs_parts.push(format!("access_token={}", urlencoding(&access_token)));
        }

        // OCIS collaboration may not send file_id in the form body,
        // so extract it from the WOPISrc URL if missing.
        let file_id = parse_form_field(&body, "file_id");
        if !file_id.is_empty() {
            qs_parts.push(format!("file_id={}", urlencoding(&file_id)));
        } else {
            // file_id not in form — extract it from the real WOPISrc (last occurrence)
            let real_wopi_src = extract_last_query_param(&original_query, "WOPISrc");
            if !real_wopi_src.is_empty() {
                let fid = file_id_from_wopi_src(&real_wopi_src);
                if !fid.is_empty() {
                    qs_parts.push(format!("file_id={}", urlencoding(&fid)));
                }
            }
        }

        let embedded = parse_form_field(&body, "embedded");
        if !embedded.is_empty() {
            qs_parts.push(format!("embedded={}", urlencoding(&embedded)));
        }

        // Also forward WOPISrc if it was in the original query string
        // (OCIS collaboration service sends WOPISrc in the POST URL)
        let wopi_src = extract_last_query_param(&original_query, "WOPISrc");
        if !wopi_src.is_empty() {
            qs_parts.push(format!("WOPISrc={}", urlencoding(&wopi_src)));
        }

        if qs_parts.is_empty() {
            format!("{}/", clean_base)
        } else {
            format!("{}/?{}", clean_base, qs_parts.join("&"))
        }
    } else {
        // GET: preserve all existing query parameters as-is
        let query = request.uri().query().unwrap_or("");
        if query.is_empty() {
            format!("{}/", clean_base)
        } else {
            format!("{}/?{}", clean_base, query)
        }
    }
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

/// Extract the value of the LAST occurrence of a query parameter.
/// Used for WOPISrc where the real URL (not the template placeholder)
/// is always the last occurrence.
fn extract_last_query_param(query: &str, name: &str) -> String {
    let mut last = String::new();
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == name {
                last = url_decode(v);
            }
        }
    }
    last
}

/// Extract the file_id from a WOPISrc URL of the form:
/// `https://host/wopi/files/{file_id}`
fn file_id_from_wopi_src(wopi_src: &str) -> String {
    if let Some(pos) = wopi_src.find("/wopi/files/") {
        let after = &wopi_src[pos + "/wopi/files/".len()..];
        after
            .split(&['/', '?', '&', '#'][..])
            .next()
            .unwrap_or("")
            .to_string()
    } else {
        String::new()
    }
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

// ── Editor bundle helpers ───────────────────────────────────────────

/// Map an editor type key (from URL path) to a directory name inside editor_ui_dir.
fn resolve_editor_dir(type_key: &str) -> Option<&'static str> {
    match type_key {
        "document" | "word" => Some("word"),
        "spreadsheet" | "cell" | "sheet" => Some("sheet"),
        "presentation" | "slide" => Some("slide"),
        "pdf" => Some("pdf"),
        "diagram" => Some("diagram"),
        _ => None,
    }
}

/// Determine MIME type for a file based on its extension.
fn mime_for_filename(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("js") | Some("mjs") => "application/javascript",
        Some("css") => "text/css",
        Some("wasm") => "application/wasm",
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("json") => "application/json",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("ico") => "image/x-icon",
        Some("map") => "application/json",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// Map a WOPI editor type to the local editor route path (bridge flow).
/// Returns `None` for types that should keep using external editor URLs.
fn wopi_type_to_local_route(editor_type: &str) -> Option<&'static str> {
    match editor_type {
        "word" | "document" => Some("/editors/document/"),
        "sheet" | "spreadsheet" => Some("/editors/spreadsheet/"),
        "slide" | "presentation" => Some("/editors/presentation/"),
        "pdf" => Some("/editors/pdf/"),
        "diagram" => Some("/editors/diagram/"),
        _ => None,
    }
}

// ── Dictionary serving ──────────────────────────────────────────────

/// GET /dictionaries/{*path}
///
/// Serves Hunspell dictionary files (.aff, .dic) for the spellchecker.
/// The frontend requests files like `/dictionaries/en-US.aff` but the
/// on-disk layout is `en_US/en_US.aff` (locale subdirectory). This handler
/// normalizes hyphens to underscores and maps `{locale}.{ext}` →
/// `{locale}/{locale}.{ext}`.
async fn serve_dictionary(
    Path(path): Path<String>,
) -> Result<
    (
        axum::http::StatusCode,
        [(axum::http::HeaderName, String); 1],
        Vec<u8>,
    ),
    axum::http::StatusCode,
> {
    if path.split('/').any(|seg| seg == "..") {
        return Err(axum::http::StatusCode::FORBIDDEN);
    }

    let dict_dir =
        std::env::var("DICTIONARIES_DIR").unwrap_or_else(|_| "/app/assets/dictionaries".into());

    // Parse the path as "{locale}.{ext}" — e.g. "en-US.aff" → locale="en-US", ext="aff"
    let file_stem = std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&path);
    let locale_norm = file_stem.replace('-', "_");

    // Build path: dictionaries/{locale}/{locale}.{ext}
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let file_name = if ext.is_empty() {
        locale_norm.clone()
    } else {
        format!("{locale_norm}.{ext}")
    };
    let file_path = std::path::Path::new(&dict_dir)
        .join(&locale_norm)
        .join(&file_name);

    let data = tokio::fs::read(&file_path)
        .await
        .map_err(|_| axum::http::StatusCode::NOT_FOUND)?;

    let content_type = match ext {
        "aff" => "text/plain; charset=utf-8",
        "dic" => "application/octet-stream",
        _ => "application/octet-stream",
    };

    Ok((
        axum::http::StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, content_type.to_string())],
        data,
    ))
}

// ── Editor bundle serving handlers ──────────────────────────────────

/// GET /editors/{type}/
///
/// Serves the React editor's `index.html` from `editor_ui_dir/{dir}/`.
/// This is the entry point for the WOPI-first bridge flow.
async fn serve_editor_index(
    Path(type_path): Path<String>,
    State(state): State<AppState>,
) -> Result<
    (
        axum::http::StatusCode,
        [(axum::http::HeaderName, String); 1],
        Vec<u8>,
    ),
    axum::http::StatusCode,
> {
    let dir_name = resolve_editor_dir(&type_path).ok_or(axum::http::StatusCode::NOT_FOUND)?;
    let index_path = std::path::Path::new(&state.config.editor_ui_dir)
        .join(dir_name)
        .join("index.html");

    let data = tokio::fs::read(&index_path)
        .await
        .map_err(|_| axum::http::StatusCode::NOT_FOUND)?;

    Ok((
        axum::http::StatusCode::OK,
        [(
            axum::http::header::CONTENT_TYPE,
            "text/html; charset=utf-8".into(),
        )],
        data,
    ))
}

/// GET /editors/{type}/{*asset_path}
///
/// Serves static assets (JS, CSS, WASM, fonts, images) from the editor
/// build directory.  Used by the editor index.html to load its resources.
async fn serve_editor_assets(
    Path((type_path, asset_path)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<
    (
        axum::http::StatusCode,
        [(axum::http::HeaderName, String); 1],
        Vec<u8>,
    ),
    axum::http::StatusCode,
> {
    let dir_name = resolve_editor_dir(&type_path).ok_or(axum::http::StatusCode::NOT_FOUND)?;

    // Prevent directory traversal
    if asset_path.split('/').any(|seg| seg == "..") {
        return Err(axum::http::StatusCode::FORBIDDEN);
    }

    let file_path = std::path::Path::new(&state.config.editor_ui_dir)
        .join(dir_name)
        .join(&asset_path);

    let data = tokio::fs::read(&file_path)
        .await
        .map_err(|_| axum::http::StatusCode::NOT_FOUND)?;

    let content_type = mime_for_filename(&file_path);

    Ok((
        axum::http::StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, content_type.to_string())],
        data,
    ))
}

/// GET /wopi/files/:file_id  →  proxy CheckFileInfo to OCIS
async fn wopi_check_file_info(
    State(state): State<AppState>,
    Path(file_id): Path<String>,
    Query(params): Query<TokenQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !state.config.is_passthrough_mode() {
        let _claims = WopiClient::validate_token(&params.access_token, &state.config.jwt_secret)
            .map_err(|e| AppError::Unauthorized(e.to_string()))?;
    }

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
    if !state.config.is_passthrough_mode() {
        let _claims = WopiClient::validate_token(&params.access_token, &state.config.jwt_secret)
            .map_err(|e| AppError::Unauthorized(e.to_string()))?;
    }

    let data = state
        .wopi_client
        .get_file(&file_id, &params.access_token)
        .await?;
    Ok(axum::body::Bytes::from(data))
}

/// POST /wopi/files/:file_id/contents  →  proxy PutFile to OCIS
///
/// Forwards WOPI headers (X-WOPI-Override, X-WOPI-Lock, If-Match) from the
/// browser request to the upstream OCIS collaboration service. OpenCloud's
/// collaboration server requires X-WOPI-Override: PUT to identify this as
/// a WOPI PutFile operation rather than a plain POST.
async fn wopi_put_file(
    State(state): State<AppState>,
    Path(file_id): Path<String>,
    Query(params): Query<TokenQuery>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<(), AppError> {
    if !state.config.is_passthrough_mode() {
        let _claims = WopiClient::validate_token(&params.access_token, &state.config.jwt_secret)
            .map_err(|e| AppError::Unauthorized(e.to_string()))?;
    }

    // Extract WOPI-relevant headers from the incoming browser request
    let wopi_override = headers
        .get("x-wopi-override")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let wopi_lock = headers
        .get("x-wopi-lock")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let if_match = headers
        .get("if-match")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    state
        .wopi_client
        .put_file(
            &file_id,
            &params.access_token,
            body.to_vec(),
            wopi_override,
            wopi_lock,
            if_match,
        )
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

/// Embedded minimal docx for the demo document — served when the file
/// configured via `DEMO_DOC_PATH` (or `./demo.docx`) is missing.
///
/// Generated with: python3 -c "zipfile+base64" (see plan/ for script).
const EMBEDDED_DEMO_DOCX_BASE64: &str = concat!(
    "UEsDBBQAAAAIAHV9AV15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9",
    "FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaG",
    "ScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzr",
    "unupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6p",
    "BJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAe",
    "bfljP49zD99QSwMEFAAAAAgAdX0BXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAyA",
    "4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqy",
    "WsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3K",
    "K2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuar",
    "F5sXUEsDBBQAAAAIAHV9AV1z1I57zQAAADkBAAARAAAAd29yZC9kb2N1bWVudC54bWxtj0Fr",
    "wzAMhf+K6vvibIcyQpKetusuLT17ttIYbMnI3tL++9mFMhgD8YT00MfTeLjGAN8o2TNN6rnr",
    "FSBZdp4ukzod359eFeRiyJnAhJO6YVaHedwGx/YrIhWoAMrDNqm1lDRone2K0eSOE1L1FpZo",
    "Sh3lojcWl4Qt5lz5MeiXvt/raDyphvxkd2s9NZEmZT5jsBwRCsOZJTj4WBZvcTfq5jaVu6a/",
    "h8fVZ6hlwGFkeMTt4M35ArUqEa8psFT4ioB1zdL9w9WPZPr36/kHUEsBAhQDFAAAAAgAdX0B",
    "XXluM9foAAAArQEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwEC",
    "FAMUAAAACAB1fQFdm/036q0AAAApAQAACwAAAAAAAAAAAAAAgAEZAQAAX3JlbHMvLnJlbHNQ",
    "SwECFAMUAAAACAB1fQFdc9SOe80AAAA5AQAAEQAAAAAAAAAAAAAAgAHvAQAAd29yZC9kb2N1",
    "bWVudC54bWxQSwUGAAAAAAMAAwC5AAAA6wIAAAAA",
);

fn decode_embedded_demo_docx() -> anyhow::Result<Vec<u8>> {
    let data = BASE64
        .decode(EMBEDDED_DEMO_DOCX_BASE64)
        .context("decode embedded demo docx")?;
    Ok(data)
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
    // Try to read the actual file for correct size; fall back to embedded size.
    let path = std::env::var("DEMO_DOC_PATH").unwrap_or_else(|_| "./demo.docx".into());
    let size = match tokio::fs::metadata(&path).await {
        Ok(m) => m.len(),
        Err(_) => decode_embedded_demo_docx()
            .map(|b| b.len() as u64)
            .unwrap_or(0),
    };
    Json(DemoFileInfo {
        BaseFileName: "demo.docx".into(),
        OwnerId: "demo".into(),
        Size: size,
        Version: "1.0".into(),
        UserCanWrite: true,
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
    let data = match tokio::fs::read(&path).await {
        Ok(bytes) => bytes,
        Err(_) => {
            // File not found — serve the embedded minimal docx.
            // This ensures /word/ and other direct editor routes never
            // show a "Failed to load document" error.
            decode_embedded_demo_docx().map_err(|e| {
                AppError::InternalError(format!("Failed to decode embedded demo docx: {e}"))
            })?
        }
    };
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

fn init_metrics() {
    let metrics_addr: SocketAddr = "0.0.0.0:9091"
        .parse()
        .unwrap_or_else(|_| SocketAddr::from(([0, 0, 0, 0], 9091)));
    if let Err(e) = PrometheusBuilder::new()
        .with_http_listener(metrics_addr)
        .install()
    {
        tracing::warn!(
            "Failed to install Prometheus HTTP listener (metrics will be unavailable): {e}"
        );
    }
}

/// Build the application router.
pub fn create_app(config: DocServerConfig) -> Router {
    let state = AppState::new(config.clone());

    // Initialize metrics
    init_metrics();

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
        // Dictionary files for frontend spellchecker
        .route("/dictionaries/{*path}", get(serve_dictionary))
        // Editor bundle routes (WOPI-first bridge) — before fallback ServeDir
        .route("/editors/{type}/", get(serve_editor_index))
        .route("/editors/{type}/{*asset_path}", get(serve_editor_assets))
        .with_state(state);

    // Serve editor UI if the directory exists, otherwise fall back to landing page
    if let Some(serve_dir) = static_files::editor_ui_service(&config.editor_ui_dir) {
        // Redirect root to the word editor, then serve static files as fallback
        app = app
            .route("/", get(|| async { Redirect::permanent("/word/") }))
            .fallback_service(serve_dir);
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
            wopi_token_mode: "jwt".into(),
            wopi_insecure: false,
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
