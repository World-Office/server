//! Editor document API — the routes the wysiwyg editor under `/word/`
//! calls (mirrors the historical Python docserver contract):
//!
//! - `GET  /api/documents/{id}/html`      stored/demo docx -> editable HTML
//! - `POST /api/documents/{id}/save`      editor HTML -> docx, persisted
//! - `POST /api/documents/{id}/export`    stored docx -> download (pdf/docx/html/txt)
//! - `GET  /api/documents/{id}/versions`  history (documents have no snapshot
//!   store in this server yet — an empty list keeps the version panel quiet)
//!
//! Document resolution order: `{DOCSERVER_DATA_DIR}/docs/{id}` (an earlier
//! save) first, then the demo asset for `demo.docx`. IDs are validated
//! against a strict allowlist — they become file names, so path traversal
//! must be impossible by construction.

use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
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
    PathBuf::from(
        std::env::var("DOCSERVER_DATA_DIR").unwrap_or_else(|_| "./data".into()),
    )
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
    let data = resolve_doc(&id).await?;
    let Some(data) = data else {
        return Err(AppError::NotFound("not found".into()));
    };
    if data.is_empty() {
        // 0-byte file: start blank so the user can just write.
        return Ok(Json(serde_json::json!({ "html": "", "name": id, "blank": true })));
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
/// persist under the data dir so the next load returns the edited version.
pub async fn save_document(
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

    let dir = docs_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::InternalError(format!("Cannot create data dir: {e}")))?;
    tokio::fs::write(dir.join(&id), &out)
        .await
        .map_err(|e| AppError::InternalError(format!("Cannot persist document: {e}")))?;
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
    let data = resolve_doc(&id).await?;
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

/// GET /api/documents/{id}/versions — no snapshot store yet; an empty list
/// keeps the editor's version panel quiet instead of erroring.
pub async fn document_versions(
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    if resolve_doc(&id).await?.is_none() {
        return Err(AppError::NotFound("not found".into()));
    }
    Ok(Json(serde_json::json!({ "versions": [] })))
}

fn convert(
    state: &AppState,
    source: &str,
    target: &str,
    data: &[u8],
) -> Result<Vec<u8>, AppError> {
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
        _ => Err(AppError::Conversion(
            result
                .error
                .unwrap_or_else(|| format!("conversion {source}->{target} failed")),
        )),
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
                    if rest.starts_with(&open)
                        && rest[open.len()..].starts_with(['>', ' ', '/'])
                    {
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
        let html = String::from_utf8(convert_result(&router, "docx", "html", &data).unwrap())
            .unwrap();
        assert!(html.contains("<h1>"), "heading missing");
        assert!(html.contains("<table"), "table missing");
        assert!(html.contains("data:image/png;base64,"), "banner missing");
    }
}
