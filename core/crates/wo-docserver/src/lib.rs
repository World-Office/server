// wo-docserver — World-Office Document Server library.
//
// Serves the React editor UI and proxies WOPI requests to OCIS.

pub mod ai;
pub mod config;
pub mod editor_docs;
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
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, String), AppError> {
    let discovery = state
        .wopi_client
        .get_discovery()
        .await
        .map_err(AppError::Wopi)?;
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("application/xml; charset=utf-8"),
    );
    Ok((axum::http::StatusCode::OK, headers, discovery))
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
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
    if path.split('/').any(|seg| seg == "..") {
        return Err(axum::http::StatusCode::FORBIDDEN);
    }

    let dict_dir =
        std::env::var("DICTIONARIES_DIR").unwrap_or_else(|_| "/app/assets/dictionaries".into());

    // Two accepted forms:
    //   1. Flat  "en-US.aff"  → dictionaries/en_US/en_US.aff   (locale.{ext})
    //   2. Subdir "en-US/hyph_en_US.dic" → dictionaries/en_US/hyph_en_US.dic
    //      (frontend hyphenation path, locale dir segment with a dash)
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let file_path = if path.contains('/') {
        // Subdir form: normalize ONLY the locale directory segment
        // ("en-US/hyph_en_US.dic" → "en_US/hyph_en_US.dic").
        let mut segs: Vec<String> = path.split('/').map(String::from).collect();
        if let Some(first) = segs.first_mut() {
            *first = first.replace('-', "_");
        }
        std::path::Path::new(&dict_dir).join(segs.join("/"))
    } else {
        // Flat form: dictionaries/{locale}/{locale}.{ext}
        let file_stem = std::path::Path::new(&path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&path);
        let locale_norm = file_stem.replace('-', "_");
        let file_name = if ext.is_empty() {
            locale_norm.clone()
        } else {
            format!("{locale_norm}.{ext}")
        };
        std::path::Path::new(&dict_dir)
            .join(&locale_norm)
            .join(&file_name)
    };

    let data = tokio::fs::read(&file_path)
        .await
        .map_err(|_| axum::http::StatusCode::NOT_FOUND)?;

    let content_type = match ext {
        "aff" => "text/plain; charset=utf-8",
        "dic" => "application/octet-stream",
        _ => "application/octet-stream",
    };

    let mut headers = axum::http::HeaderMap::new();
    if let Ok(v) = axum::http::HeaderValue::from_str(content_type) {
        headers.insert(axum::http::header::CONTENT_TYPE, v);
    }
    Ok((axum::http::StatusCode::OK, headers, data))
}

// ── Editor bundle serving handlers ──────────────────────────────────

/// GET /editors/{type}/
///
/// Serves the React editor's `index.html` from `editor_ui_dir/{dir}/`.
/// This is the entry point for the WOPI-first bridge flow.
async fn serve_editor_index(
    Path(type_path): Path<String>,
    State(state): State<AppState>,
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
    let dir_name = resolve_editor_dir(&type_path).ok_or(axum::http::StatusCode::NOT_FOUND)?;
    let index_path = std::path::Path::new(&state.config.editor_ui_dir)
        .join(dir_name)
        .join("index.html");

    let data = tokio::fs::read(&index_path)
        .await
        .map_err(|_| axum::http::StatusCode::NOT_FOUND)?;

    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("text/html; charset=utf-8"),
    );
    headers.insert(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-cache, no-store, must-revalidate"),
    );
    Ok((axum::http::StatusCode::OK, headers, data))
}

/// GET /editors/{type}/{*asset_path}
///
/// Serves static assets (JS, CSS, WASM, fonts, images) from the editor
/// build directory.  Used by the editor index.html to load its resources.
async fn serve_editor_assets(
    Path((type_path, asset_path)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
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

    // Cache policy: hashed build assets (index-XXXX.js, vendor-XXXX.js, *.wasm)
    // are immutable — cache aggressively. Everything else (index.html) must
    // revalidate so fresh builds are picked up immediately.
    let is_hashed = asset_path
        .rsplit('/')
        .next()
        .map(|f| {
            f.contains("-") && (f.ends_with(".js") || f.ends_with(".css") || f.ends_with(".wasm"))
        })
        .unwrap_or(false);
    let cache_header = if is_hashed {
        "public, max-age=31536000, immutable".to_string()
    } else {
        "no-cache, no-store, must-revalidate".to_string()
    };

    let mut headers = axum::http::HeaderMap::new();
    if let Ok(v) = axum::http::HeaderValue::from_str(content_type) {
        headers.insert(axum::http::header::CONTENT_TYPE, v);
    }
    if let Ok(v) = axum::http::HeaderValue::from_str(&cache_header) {
        headers.insert(axum::http::header::CACHE_CONTROL, v);
    }
    Ok((axum::http::StatusCode::OK, headers, data))
}

// Direct-editor-path wrappers (frontend uses vite base /word/ etc.). The
// browser never hits /editors/{type}/; these hardcode the editor type so
// the cache-aware handlers serve the real paths.
async fn serve_word_index(
    State(state): State<AppState>,
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
    serve_editor_index(Path("word".to_string()), axum::extract::State(state)).await
}

async fn serve_word_assets(
    Path(asset_path): Path<String>,
    State(state): State<AppState>,
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
    serve_editor_assets(
        Path(("word".to_string(), format!("assets/{asset_path}"))),
        axum::extract::State(state),
    )
    .await
}

async fn serve_sheet_index(
    State(state): State<AppState>,
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
    serve_editor_index(Path("sheet".to_string()), axum::extract::State(state)).await
}

async fn serve_sheet_assets(
    Path(asset_path): Path<String>,
    State(state): State<AppState>,
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
    serve_editor_assets(
        Path(("sheet".to_string(), format!("assets/{asset_path}"))),
        axum::extract::State(state),
    )
    .await
}

async fn serve_slide_index(
    State(state): State<AppState>,
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
    serve_editor_index(Path("slide".to_string()), axum::extract::State(state)).await
}

async fn serve_slide_assets(
    Path(asset_path): Path<String>,
    State(state): State<AppState>,
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
    serve_editor_assets(
        Path(("slide".to_string(), format!("assets/{asset_path}"))),
        axum::extract::State(state),
    )
    .await
}

async fn serve_diagram_index(
    State(state): State<AppState>,
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
    serve_editor_index(Path("diagram".to_string()), axum::extract::State(state)).await
}

async fn serve_diagram_assets(
    Path(asset_path): Path<String>,
    State(state): State<AppState>,
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
    serve_editor_assets(
        Path(("diagram".to_string(), format!("assets/{asset_path}"))),
        axum::extract::State(state),
    )
    .await
}

async fn serve_pdf_index(
    State(state): State<AppState>,
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
    serve_editor_index(Path("pdf".to_string()), axum::extract::State(state)).await
}

async fn serve_pdf_assets(
    Path(asset_path): Path<String>,
    State(state): State<AppState>,
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), axum::http::StatusCode> {
    serve_editor_assets(
        Path(("pdf".to_string(), format!("assets/{asset_path}"))),
        axum::extract::State(state),
    )
    .await
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
/// Minimal demo docx served by `/demo/document` when the file configured
/// via `DEMO_DOC_PATH` is missing. Same content as `assets/demo.docx` (the
/// image-baked copy); generated with python3 zipfile + base64.
const EMBEDDED_DEMO_DOCX_BASE64: &str = concat!(
    "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",
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

/// Demo docx bytes: `DEMO_DOC_PATH` if readable, else the embedded fallback
/// (keeps `/demo/*` and the editor demo working on a bare image).
pub(crate) async fn demo_document_bytes() -> Result<Vec<u8>, AppError> {
    let path = std::env::var("DEMO_DOC_PATH").unwrap_or_else(|_| "./demo.docx".into());
    match tokio::fs::read(&path).await {
        Ok(bytes) => Ok(bytes),
        Err(_) => decode_embedded_demo_docx().map_err(|e| {
            AppError::InternalError(format!("Failed to decode embedded demo docx: {e}"))
        }),
    }
}

async fn demo_document_handler(
) -> Result<(axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>), AppError> {
    let data = demo_document_bytes().await?;
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
    );
    Ok((axum::http::StatusCode::OK, headers, data))
}

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
        // ── AI provider gateway (F-148..F-152) ────────────────────────
        .route("/ai/config", get(ai::ai_config))
        .route("/api/ai/tools", get(ai::ai_tools))
        .route("/ai/generate", post(ai::ai_generate))
        .route("/api/documents/{id}/ai/propose", post(ai::ai_propose))
        .route("/api/documents/{id}/ai/review", get(ai::ai_review))
        .route("/api/documents/{id}/ai/review/reject", post(ai::ai_review_reject))
        .route("/api/documents/{id}/html", get(editor_docs::document_html))
        .route("/api/documents/{id}/save", post(editor_docs::save_document))
        .route("/api/documents/{id}/export", post(editor_docs::export_document))
        .route(
            "/api/documents/{id}/versions",
            get(editor_docs::document_versions),
        )
        .route("/demo/info", get(demo_info_handler))
        .route("/demo/document", get(demo_document_handler))
        // Dictionary files for frontend spellchecker
        .route("/dictionaries/{*path}", get(serve_dictionary))
        // Editor bundle routes (WOPI-first bridge) — before fallback ServeDir
        .route("/editors/{type}/", get(serve_editor_index))
        .route("/editors/{type}/{*asset_path}", get(serve_editor_assets))
        // Direct editor paths the frontend actually uses (vite base: /word/).
        // These must hit the cache-aware handlers, NOT the ServeDir fallback,
        // so hashed assets get immutable caching and index.html revalidates.
        .route("/word/", get(serve_word_index))
        .route("/word/assets/{*asset_path}", get(serve_word_assets))
        .route("/sheet/", get(serve_sheet_index))
        .route("/sheet/assets/{*asset_path}", get(serve_sheet_assets))
        .route("/slide/", get(serve_slide_index))
        .route("/slide/assets/{*asset_path}", get(serve_slide_assets))
        .route("/diagram/", get(serve_diagram_index))
        .route("/diagram/assets/{*asset_path}", get(serve_diagram_assets))
        .route("/pdf/", get(serve_pdf_index))
        .route("/pdf/assets/{*asset_path}", get(serve_pdf_assets))
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
            "target_format": "xlsb",
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
