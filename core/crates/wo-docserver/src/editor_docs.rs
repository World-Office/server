//! Editor document API — the routes the wysiwyg editor under `/word/`
//! calls (mirrors the historical Python docserver contract):
//!
//! - `GET  /api/documents/{id}/html`      stored/demo docx -> editable HTML
//! - `POST /api/documents/{id}/save`      editor HTML -> docx, persisted
//! - `POST /api/documents/{id}/export`    stored docx -> download (pdf/docx/html/txt)
//! - `GET  /api/documents/{id}/versions`  real snapshot history (every content
//!   write records a version; restore + content endpoints replay them)
//! - `GET/PUT /api/documents/{id}/contents` raw WOPI-style bytes
//! - `GET /api/documents/{id}/info` / `GET /api/documents/{id}` metadata
//! - `GET /api/documents` list; `POST /api/documents/new`; `POST /api/upload`
//! - `POST /api/documents/{id}/versions/{ts}/restore|content`
//! - `GET/POST /api/documents/{id}/protect`; `POST .../lock|unlock`
//! - `GET /api/plugins`; `POST /api/documents/{id}/import-docx`
//!
//! Document resolution order: `{DOCSERVER_DATA_DIR}/docs/{id}` (an earlier
//! save) first, then the demo asset for `demo.docx`. IDs are validated
//! against a strict allowlist — they become file names, so path traversal
//! must be impossible by construction.

use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;
use wo_x2t::ConversionStatus;

use crate::{AppError, AppState};

/// Strict doc-id allowlist: alphanumerics plus `._-`, no leading dot.
/// Anything else is rejected before it can touch the filesystem.
fn valid_doc_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 255
        && !id.starts_with('.')
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn docs_dir() -> PathBuf {
    PathBuf::from(std::env::var("DOCSERVER_DATA_DIR").unwrap_or_else(|_| "./data".into()))
        .join("docs")
}

/// Resolve a document: an earlier save wins over the baked demo asset.
async fn resolve_doc(id: &str) -> Result<Option<Vec<u8>>, AppError> {
    let stored = docs_dir().join(id);
    if stored.is_file() {
        return Ok(Some(tokio::fs::read(&stored).await.map_err(|e| {
            AppError::InternalError(format!("Failed to read stored document: {e}"))
        })?));
    }
    if id == "demo.docx" {
        return Ok(Some(crate::demo_document_bytes().await?));
    }
    Ok(None)
}

/// GET /api/documents/{id}/html — docx -> editable HTML.
pub async fn document_html(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    // store first (content + demo fallback), mirroring resolve_doc but
    // honoring the config data_dir rather than the ambient env var
    let data = if let Some(d) = state.store.get_content(&id).await? {
        Some(d)
    } else if id == "demo.docx" {
        crate::demo_document_bytes().await.ok()
    } else {
        None
    };
    let Some(data) = data else {
        return Err(AppError::NotFound("not found".into()));
    };
    if data.is_empty() {
        // 0-byte file: start blank so the user can just write.
        return Ok(Json(
            serde_json::json!({ "html": "", "name": id, "blank": true }),
        ));
    }
    let html_bytes = convert(&state, "docx", "html", &data)?;
    let html = String::from_utf8(html_bytes)
        .map_err(|e| AppError::Conversion(format!("html not utf-8: {e}")))?;
    Ok(Json(serde_json::json!({ "html": html, "name": id })))
}

#[derive(Deserialize)]
struct SaveBody {
    html: String,
}

/// POST /api/documents/{id}/save — sanitize editor HTML, convert to docx,
/// persist through the local store (content + a version snapshot + meta),
/// so the next load returns the edited version and the version panel sees it.
pub async fn save_document(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: axum::body::Bytes,
) -> Result<Json<serde_json::Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    let payload: SaveBody = serde_json::from_slice(&body)
        .map_err(|e| AppError::BadRequest(format!("invalid JSON: {e}")))?;

    let clean = sanitize_editor_html(&payload.html);
    let router = wo_x2t::ConversionRouter::new();
    let out = convert_result(&router, "html", "docx", clean.as_bytes())?;

    // protection gate: a restricted document refuses writes
    if let Some(existing) = state.store.get_content(&id).await? {
        if crate::docx_util::is_restricted(&existing) {
            return Err(AppError::Forbidden(
                "document is protected: restrict editing is on — unprotect to write".into(),
            ));
        }
    }
    if state.store.get(&id).await?.is_none() {
        state.store.init(&id, &id).await?;
    }
    state.store.put_content(&id, &out).await?;
    // Rebase the collaboration layer onto the freshly saved content so the
    // CRDT state and the stored document stay in step (Python resync path).
    let text = strip_html_to_text(&clean);
    if !text.is_empty() {
        state.collab.resync(&id, &text);
    }
    Ok(Json(serde_json::json!({ "ok": true, "size": out.len() })))
}

/// POST /api/documents/{id}/export?format=pdf|docx|html|txt
pub async fn export_document(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Response, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    let format = params.get("format").map(String::as_str).unwrap_or("pdf");
    let data = if let Some(d) = state.store.get_content(&id).await? {
        Some(d)
    } else if id == "demo.docx" {
        crate::demo_document_bytes().await.ok()
    } else {
        None
    };
    let Some(data) = data else {
        return Err(AppError::NotFound("not found".into()));
    };

    let out = convert(&state, "docx", format, &data)?;
    let mime = match format {
        "pdf" => "application/pdf",
        "html" => "text/html",
        "txt" => "text/plain",
        _ => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    let base = id.trim_end_matches(".docx");
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
    if let Ok(v) = HeaderValue::from_str(&format!("attachment; filename=\"{base}.{format}\"")) {
        headers.insert(header::CONTENT_DISPOSITION, v);
    }
    Ok((StatusCode::OK, headers, out).into_response())
}

/// GET /api/documents/{id}/versions — snapshot history, newest first.
pub async fn document_versions(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    if state.store.get(&id).await?.is_none() && resolve_doc(&id).await?.is_none() {
        return Err(AppError::NotFound("not found".into()));
    }
    let versions = state.store.list_versions(&id).await;
    Ok(Json(serde_json::json!({ "versions": versions })))
}

fn convert(state: &AppState, source: &str, target: &str, data: &[u8]) -> Result<Vec<u8>, AppError> {
    convert_result(&state.conversion_router, source, target, data)
}

fn convert_result(
    router: &wo_x2t::ConversionRouter,
    source: &str,
    target: &str,
    data: &[u8],
) -> Result<Vec<u8>, AppError> {
    let result = router.convert(source, target, data);
    match result.status {
        ConversionStatus::Success | ConversionStatus::PartialSuccess => Ok(result
            .output
            .ok_or_else(|| AppError::Conversion("conversion produced no output".into()))?
            .data),
        _ => Err(AppError::Conversion(result.error.unwrap_or_else(|| {
            format!("conversion {source}->{target} failed")
        }))),
    }
}

/// Strip executable HTML before it is stored: `script`/`style`/`iframe`/
/// `object`/`embed` blocks, `on*=` handler attributes and `javascript:` URLs.
/// The editor injects loaded HTML via innerHTML, so this is the trust gate.
fn sanitize_editor_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let bytes = html.as_bytes();
    let lower = html.to_ascii_lowercase();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'<' {
            let rest = &lower[i..];
            if rest.starts_with("<!--") {
                match rest.find("-->") {
                    Some(end) => {
                        i += end + 3;
                        continue;
                    }
                    None => break, // unterminated comment: drop the tail
                }
            }
            let blocked = ["script", "style", "iframe", "object", "embed"]
                .iter()
                .find_map(|name| {
                    let open = format!("<{name}");
                    if rest.starts_with(&open) && rest[open.len()..].starts_with(['>', ' ', '/']) {
                        Some(*name)
                    } else {
                        None
                    }
                });
            if let Some(name) = blocked {
                let close = format!("</{name}");
                if let Some(end) = rest.find(&close) {
                    let after = &rest[end..];
                    let skip = match after.find('>') {
                        Some(gt) => end + gt + 1,
                        None => lower.len() - i, // unterminated: drop the tail
                    };
                    i += skip;
                } else {
                    break; // unterminated block: drop the tail
                }
                continue;
            }
            // plain tag: copy it, dropping on*= attributes / javascript: URLs
            if let Some(close) = rest.find('>') {
                out.push_str(&sanitize_tag(&html[i..=i + close]));
                i += close + 1;
                continue;
            }
            break; // stray '<': drop the tail
        }
        let ch_len = html[i..].chars().next().map(char::len_utf8).unwrap_or(1);
        out.push_str(&html[i..i + ch_len]);
        i += ch_len;
    }
    out
}

fn sanitize_tag(tag: &str) -> String {
    let lower = tag.to_ascii_lowercase();
    if lower.starts_with("</") || !lower.contains(' ') {
        return tag.to_string();
    }
    let mut rebuilt = String::with_capacity(tag.len());
    let mut rest = tag;
    let split = rest
        .find(|c: char| c == '>' || c.is_whitespace())
        .unwrap_or(rest.len());
    rebuilt.push_str(&rest[..split]);
    rest = &rest[split..];
    while let Some(start) = rest.find(|c: char| !c.is_whitespace()) {
        rest = &rest[start..];
        if rest.starts_with('>') {
            break; // tag closer — appended below
        }
        let end = rest
            .find(|c: char| c.is_whitespace() || c == '>')
            .unwrap_or(rest.len());
        let attr = &rest[..end];
        let name_only = attr.split('=').next().unwrap_or(attr).to_ascii_lowercase();
        let value = attr.split_once('=').map(|(_, v)| {
            v.trim_matches(|c| c == '"' || c == '\'')
                .trim_start()
                .to_ascii_lowercase()
        });
        let dangerous = name_only.starts_with("on")
            || matches!(
                value.as_deref(),
                Some(v) if (name_only == "href" || name_only == "src")
                    && v.starts_with("javascript:")
            );
        if !dangerous {
            rebuilt.push(' ');
            rebuilt.push_str(attr);
        }
        rest = &rest[end..];
    }
    rebuilt.push('>');
    rebuilt
}

// ══════════════════════════════════════════════════════════════════════
// Extended document API (ported from the Python docserver's router.py)
// ══════════════════════════════════════════════════════════════════════

const LOCK_HEADER: &str = "x-wopi-lock";

/// GET /api/documents/{id}/contents — raw document bytes (WOPI GetFile on
/// the editor API). Carries the version in `X-WOPI-ItemVersion`.
pub async fn document_contents(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    let data = if let Some(d) = state.store.get_content(&id).await? {
        Some(d)
    } else if id == "demo.docx" {
        crate::demo_document_bytes().await.ok()
    } else {
        None
    };
    let Some(data) = data else {
        return Err(AppError::NotFound("not found".into()));
    };
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(crate::store::content_type_of(&id)),
    );
    let meta = state.store.get(&id).await?;
    if let Some(m) = meta {
        headers.insert(
            "X-WOPI-ItemVersion",
            HeaderValue::from_str(&m.updated_at.to_string()).unwrap(),
        );
    }
    Ok((StatusCode::OK, headers, data).into_response())
}

/// PUT|POST /api/documents/{id}/contents — raw document bytes write.
/// `POST` requires `X-WOPI-Override: PUT`. Store lock + protection gate.
pub async fn put_document_contents(
    State(state): State<AppState>,
    Path(id): Path<String>,
    method: Method,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Response, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    // A POST is only a PutFile when it carries the WOPI override header (the
    // OCIS convention); a bare PUT is the same call.
    if method == Method::POST {
        let over = headers
            .get("x-wopi-override")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !over.eq_ignore_ascii_case("PUT") {
            return Err(AppError::BadRequest(
                "X-WOPI-Override: PUT required on POST /contents".into(),
            ));
        }
    }
    if state.store.get(&id).await?.is_none() {
        return Err(AppError::NotFound("not found".into()));
    }
    // Protect enforcement on the raw-bytes write path too (WOPI PutFile).
    if let Some(stored) = state.store.get_content(&id).await? {
        if crate::docx_util::is_restricted(&stored) {
            return Err(AppError::Forbidden(
                "document is protected: restrict editing is on — unprotect to write".into(),
            ));
        }
    }
    let lock = headers
        .get(LOCK_HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if let Some(current) = state.store.get_lock(&id).await {
        if lock != current {
            let mut h = HeaderMap::new();
            h.insert(
                HeaderName::from_static(LOCK_HEADER),
                HeaderValue::from_str(&current).unwrap_or_else(|_| HeaderValue::from_static("")),
            );
            return Ok((
                StatusCode::CONFLICT,
                h,
                Json(serde_json::json!({ "error": "lock mismatch" })),
            )
                .into_response());
        }
    }
    state.store.put_content(&id, &body).await?;
    Ok(Json(serde_json::json!({ "ok": true, "size": body.len() })).into_response())
}

/// GET /api/documents/{id}/info — document metadata.
pub async fn document_info(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    let Some(meta) = state.store.get(&id).await? else {
        return Err(AppError::NotFound("not found".into()));
    };
    let Some(data) = state.store.get_content(&id).await? else {
        return Err(AppError::NotFound("not found".into()));
    };
    Ok(Json(serde_json::json!({
        "id": id,
        "name": meta.name,
        "format": crate::store::format_of(&meta.name),
        "size": data.len(),
        "created_at": meta.created_at,
        "updated_at": meta.updated_at,
        "version": meta.updated_at.to_string(),
    })))
}

/// GET /api/documents/{id} — full doc meta (WOPI-ish shape).
pub async fn document_meta(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    match state.store.document_meta(&id).await? {
        Some(v) => Ok(Json(v)),
        None => Err(AppError::NotFound("not found".into())),
    }
}

/// GET /api/documents — list locally stored documents.
pub async fn document_list(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(serde_json::Value::Array(state.store.list().await?)))
}

/// POST /api/documents/new?format=docx — create a blank document.
pub async fn new_document(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, AppError> {
    let format = params.get("format").map(String::as_str).unwrap_or("docx");
    let (data, name) = match format {
        "odt" => (
            convert(&state, "docx", "odt", &crate::docx_util::blank_docx())?,
            "untitled.odt".to_string(),
        ),
        _ => (crate::docx_util::blank_docx(), "untitled.docx".to_string()),
    };
    let doc_id = format!("new-{}", chrono::Utc::now().timestamp_millis());
    state.store.init(&doc_id, &name).await?;
    state.store.put_content(&doc_id, &data).await?;
    Ok(Json(serde_json::json!({
        "doc_id": doc_id,
        "url": format!("/editor/{doc_id}"),
        "name": name,
    })))
}

/// POST /api/upload?filename=… — store an uploaded document (octet-stream).
pub async fn upload_document(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Result<Json<serde_json::Value>, AppError> {
    if body.is_empty() {
        return Err(AppError::BadRequest("empty file".into()));
    }
    let filename = params
        .get("filename")
        .map(|s| s.to_string())
        .unwrap_or_else(|| "document.docx".into());
    if !valid_doc_id(&filename) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    state.store.init(&filename, &filename).await?;
    state.store.put_content(&filename, &body).await?;
    Ok(Json(
        serde_json::json!({ "id": filename, "name": filename }),
    ))
}

/// GET /api/documents/{id}/versions/{ts}/content — version as html+text.
pub async fn version_content(
    State(state): State<AppState>,
    Path((id, ts)): Path<(String, i64)>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    if state.store.get(&id).await?.is_none() {
        return Err(AppError::NotFound("not found".into()));
    }
    let Some(raw) = state.store.get_version(&id, ts).await? else {
        return Err(AppError::NotFound("version not found".into()));
    };
    let html_bytes = convert(&state, "docx", "html", &raw)?;
    let html = String::from_utf8(html_bytes).unwrap_or_default();
    let text = strip_html_to_text(&html);
    Ok(Json(
        serde_json::json!({ "html": html, "text": text, "ts": ts }),
    ))
}

fn strip_html_to_text(html: &str) -> String {
    regex_lite(html)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

// minimal tag/whitespace stripper for the compare-flow text projection
fn regex_lite(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    let bytes = html.as_bytes();
    while i < bytes.len() {
        if bytes[i] == b'<' {
            match html[i..].find('>') {
                Some(end) => {
                    i += end + 1;
                    continue;
                }
                None => break,
            }
        }
        let ch = html[i..].chars().next().unwrap_or(' ');
        if ch.is_whitespace() {
            if !out.ends_with(' ') {
                out.push(' ');
            }
        } else {
            out.push(ch);
        }
        i += ch.len_utf8();
    }
    out.trim().to_string()
}

/// POST /api/documents/{id}/versions/{ts}/restore — restore a snapshot.
pub async fn restore_version(
    State(state): State<AppState>,
    Path((id, ts)): Path<(String, i64)>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    if state.store.get(&id).await?.is_none() {
        return Err(AppError::NotFound("not found".into()));
    }
    let head_ts = state.store.restore_version(&id, ts).await?;
    Ok(Json(serde_json::json!({ "ok": true, "ts": head_ts })))
}

/// POST /api/documents/{id}/import-docx — convert an uploaded .docx to HTML.
pub async fn import_docx(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Result<Json<serde_json::Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    if body.is_empty() {
        return Err(AppError::BadRequest("empty file".into()));
    }
    let html_bytes = convert(&state, "docx", "html", &body).map_err(|e| {
        let msg = match e {
            AppError::Conversion(m) => m,
            other => other.to_string(),
        };
        AppError::Unprocessable(format!("conversion failed: {msg}"))
    })?;
    let html = String::from_utf8_lossy(&html_bytes).into_owned();
    let name = params.get("filename").cloned().unwrap_or(id);
    Ok(Json(serde_json::json!({ "html": html, "name": name })))
}

/// GET /api/documents/{id}/protect — current protection booleans.
pub async fn document_protect_state(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    let Some(data) = state.store.get_content(&id).await? else {
        return Err(AppError::NotFound("not found".into()));
    };
    let d = crate::docx_util::protection_detail(&data);
    Ok(Json(serde_json::json!({
        "restrict_editing": d["restricted"],
        "password_set": d["password_set"],
    })))
}

/// POST /api/documents/{id}/protect — change protection. Body:
/// `{"restrict_editing": bool, "password": str|null, "clear_password":
/// bool, "current_password": str|null}`.
///
/// Any state change that removes an established password (changing it,
/// clearing it, or lifting the restriction it enforces) must present the
/// current password — verified against the stored hash, answering 403 on
/// mismatch. Mirrors the Python reference exactly.
pub async fn document_protect(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    // Document protection is a DOCX feature (matches the Python reference).
    let name = state
        .store
        .get(&id)
        .await?
        .map(|m| m.name)
        .unwrap_or_default();
    if name.to_ascii_lowercase().ends_with(".odt") {
        return Err(AppError::BadRequest(
            "document protection is a DOCX feature; not available for ODT".into(),
        ));
    }
    let Some(data) = state.store.get_content(&id).await? else {
        return Err(AppError::NotFound("not found".into()));
    };
    let Some(obj) = payload.as_object() else {
        return Err(AppError::BadRequest(
            "invalid JSON body: expected an object".into(),
        ));
    };
    let Some(restrict) = obj.get("restrict_editing").and_then(|v| v.as_bool()) else {
        return Err(AppError::BadRequest(
            "restrict_editing must be a boolean".into(),
        ));
    };
    // A present, non-empty string password means "set a new one".
    let mut new_password: Option<String> = None;
    if let Some(p) = obj.get("password") {
        match p {
            serde_json::Value::Null => {}
            serde_json::Value::String(s) if !s.is_empty() => new_password = Some(s.clone()),
            serde_json::Value::String(_) => {}
            _ => return Err(AppError::BadRequest("password must be a string".into())),
        }
    }
    let clear_password = obj
        .get("clear_password")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if new_password.is_some() && clear_password {
        return Err(AppError::BadRequest(
            "cannot both set and clear the password".into(),
        ));
    }
    let current_password = match obj.get("current_password") {
        None | Some(serde_json::Value::Null) => None,
        Some(serde_json::Value::String(s)) => Some(s.clone()),
        Some(_) => {
            return Err(AppError::BadRequest(
                "current_password must be a string".into(),
            ))
        }
    };

    let detail = crate::docx_util::protection_detail(&data);
    let password_set = detail["password_set"].as_bool().unwrap_or(false);
    let restricted = detail["restricted"].as_bool().unwrap_or(false);
    let stored_salt = detail["salt"].as_str().map(str::to_string);
    let stored_hash = detail["hash"].as_str().map(str::to_string);

    // Removing/changing an established password, or lifting the restriction
    // it enforces, requires the current password (server-side check).
    let drops_enforcement =
        password_set && (new_password.is_some() || clear_password || (!restrict && restricted));
    if drops_enforcement
        && !crate::docx_util::verify_protection_password(
            current_password.as_deref().unwrap_or(""),
            stored_salt.as_deref().unwrap_or(""),
            stored_hash.as_deref().unwrap_or(""),
        )
    {
        return Err(AppError::Forbidden(
            "document is password-protected: wrong current password".into(),
        ));
    }

    let (final_salt, final_hash) = if !restrict {
        (None, None) // un-restricting drops enforcement entirely
    } else if let Some(pwd) = new_password {
        let (s, h) = crate::docx_util::hash_protection_password(&pwd, None);
        (Some(s), Some(h))
    } else if clear_password {
        (None, None)
    } else if password_set {
        (stored_salt, stored_hash) // keep the existing password
    } else {
        (None, None)
    };

    let out = crate::docx_util::write_protection(
        &data,
        restrict,
        final_salt.as_deref(),
        final_hash.as_deref(),
    )?;
    state.store.put_content(&id, &out).await?;
    Ok(Json(serde_json::json!({
        "ok": true,
        "restrict_editing": restrict,
        "password_set": final_hash.is_some(),
    })))
}

/// POST /api/documents/{id}/lock — acquire the editor-level lock.
pub async fn acquire_lock(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    if state.store.get(&id).await?.is_none() {
        return Err(AppError::NotFound("not found".into()));
    }
    let token = format!("editor-{}", chrono::Utc::now().timestamp_millis());
    state.store.set_lock(&id, &token).await?;
    let mut headers = HeaderMap::new();
    headers.insert(
        HeaderName::from_static(LOCK_HEADER),
        HeaderValue::from_str(&token).unwrap_or_else(|_| HeaderValue::from_static("")),
    );
    Ok((
        StatusCode::OK,
        headers,
        Json(serde_json::json!({ "ok": true })),
    )
        .into_response())
}

/// POST /api/documents/{id}/unlock — release the editor-level lock.
pub async fn release_lock(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    state.store.release_lock(&id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/plugins — the installed plugin catalog (static registry).
pub async fn plugins() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "plugins": [
        {
            "id": "ocr",
            "name": "OCR",
            "version": "1.0.0",
            "description": "Extract text from the document via the registered vision model (MODEL_REGISTRY; loud 503 when unregistered).",
        },
        {
            "id": "photoeditor",
            "name": "Photo editor",
            "version": "1.0.0",
            "description": "Canvas 2D filters on the selected image: brightness, contrast, rotate, crop; Save writes the image back.",
        },
    ] }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_doc_id() {
        assert!(valid_doc_id("demo.docx"));
        assert!(valid_doc_id("my-doc_2.docx"));
        assert!(!valid_doc_id("../etc/passwd"));
        assert!(!valid_doc_id("..\\windows"));
        assert!(!valid_doc_id(".hidden"));
        assert!(!valid_doc_id(""));
        assert!(!valid_doc_id("a/b"));
    }

    #[test]
    fn test_sanitize_strips_script_and_handlers() {
        let dirty = r#"<p>ok</p><script>alert(1)</script><p onclick="evil()" title="t">x</p><a href="javascript:bad()">l</a>"#;
        let clean = sanitize_editor_html(dirty);
        assert!(!clean.contains("script"), "{clean}");
        assert!(!clean.contains("alert(1)"));
        assert!(!clean.contains("onclick"));
        assert!(!clean.contains("javascript:"));
        assert!(clean.contains("<p>ok</p>"));
        assert!(clean.contains("title=\"t\""));
        assert!(clean.contains(">l</a>"));
    }

    #[tokio::test]
    async fn test_html_route_roundtrip_demo() {
        // demo resolution + conversion: must carry banner image + table + heading
        let data = resolve_doc("demo.docx").await.unwrap().unwrap();
        let router = wo_x2t::ConversionRouter::new();
        let html =
            String::from_utf8(convert_result(&router, "docx", "html", &data).unwrap()).unwrap();
        assert!(html.contains("<h1>"), "heading missing");
        assert!(html.contains("<table"), "table missing");
        assert!(html.contains("data:image/png;base64,"), "banner missing");
    }
}
