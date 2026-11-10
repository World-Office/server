//! Page-render API — rasterized page images for stored DOCX documents.
//!
//! External contract (backed by the `wo-docx-renderer` pipeline):
//!
//! - `GET /api/documents/{id}/pages/{n}.png` — page `n` (1-based) as a
//!   `image/png` response. `/pages/3` and `/pages/3.png` are equivalent;
//!   axum 0.8's router cannot express a dynamic suffix (`{n}.png`), so the
//!   route is registered as `/pages/{page}` and the handler strips a
//!   trailing `.png`.
//! - `GET /api/documents/{id}/pages/count` — laid-out page count as JSON.
//!
//! Document resolution mirrors the editor read views: the local store first,
//! then the baked demo asset for `demo.docx`.

use axum::extract::{Path, State};
use axum::http::{
    header, HeaderMap, HeaderName, HeaderValue, StatusCode,
};
use axum::response::{IntoResponse, Response};
use axum::Json;
use wo_docx_renderer::{DocxRenderPipeline, OutputFormat, RenderConfig};

use crate::{AppError, AppState};

/// Strict doc-id allowlist — same rules as `editor_docs::valid_doc_id`
/// (which is private to that module): ids become store file names, so path
/// traversal must be impossible by construction.
fn valid_doc_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 255
        && !id.starts_with('.')
        && id.chars().all(|c| {
            c.is_ascii_alphanumeric()
                || matches!(c, '.' | '_' | '-' | '$' | '!')
        })
}

/// PNG render settings: A4 pages rasterized at 150 dpi (the renderer's
/// defaults; only the output format differs from `RenderConfig::default`).
fn render_config() -> RenderConfig {
    RenderConfig {
        output_format: OutputFormat::Png,
        ..RenderConfig::default()
    }
}

/// Resolve the document bytes: store content first, demo.docx fallback.
async fn load_document(state: &AppState, id: &str) -> Result<Vec<u8>, AppError> {
    if !valid_doc_id(id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    if let Some(data) = state.store.get_content(id).await? {
        return Ok(data);
    }
    if id == "demo.docx" {
        return crate::demo_document_bytes().await;
    }
    Err(AppError::NotFound("not found".into()))
}

/// Parse the page path segment: accepts `3` and `3.png` (1-based).
fn parse_page(raw: &str) -> Result<u32, AppError> {
    let digits = raw.strip_suffix(".png").unwrap_or(raw);
    let page: u32 = digits
        .parse()
        .map_err(|_| AppError::BadRequest(format!("Invalid page number: {raw}")))?;
    if page == 0 {
        return Err(AppError::BadRequest(
            "Page number must be 1-based".into(),
        ));
    }
    Ok(page)
}

/// Map a pipeline error to an HTTP error: out-of-range pages are 404 (the
/// document exists, the page does not), everything else is a 500.
fn render_error(id: &str, page: u32, e: impl std::fmt::Display) -> AppError {
    let msg = e.to_string();
    if msg.contains("out of range") {
        AppError::NotFound(format!("Page {page} out of range for {id}"))
    } else {
        AppError::Conversion(format!("Page render failed for {id} page {page}: {msg}"))
    }
}

/// GET /api/documents/{id}/pages/{n}.png — page `n` (1-based) as PNG.
pub async fn page_png(
    State(state): State<AppState>,
    Path((id, page)): Path<(String, String)>,
) -> Result<Response, AppError> {
    let page = parse_page(&page)?;
    let data = load_document(&state, &id).await?;
    if data.is_empty() {
        return Err(AppError::BadRequest("Document is empty".into()));
    }

    let pipeline = DocxRenderPipeline::new(render_config());
    let (width, height, png) = pipeline
        .render_page_png(&data, page)
        .map_err(|e| render_error(&id, page, e))?;

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("image/png"));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        HeaderName::from_static("x-page-width"),
        HeaderValue::from(width),
    );
    headers.insert(
        HeaderName::from_static("x-page-height"),
        HeaderValue::from(height),
    );
    Ok((StatusCode::OK, headers, png).into_response())
}

/// GET /api/documents/{id}/pages/count — number of laid-out pages.
pub async fn page_count(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let data = load_document(&state, &id).await?;
    if data.is_empty() {
        return Err(AppError::BadRequest("Document is empty".into()));
    }

    let pipeline = DocxRenderPipeline::new(render_config());
    let pages = pipeline
        .layout_pages(&data)
        .map_err(|e| AppError::Conversion(format!("Page layout failed for {id}: {e}")))?
        .len();

    Ok(Json(serde_json::json!({ "id": id, "pages": pages })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use std::io::Write;
    use tower::ServiceExt;

    use crate::config::DocServerConfig;

    /// Minimal valid DOCX ZIP (mirrors the wo-docx-renderer test fixture).
    fn make_minimal_docx() -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
            zip.start_file(
                "[Content_Types].xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#)
            .unwrap();

            zip.start_file("_rels/.rels", zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#)
            .unwrap();

            zip.start_file(
                "word/document.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Hello Page Render</w:t></w:r></w:p></w:body>
</w:document>"#,
            )
            .unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    /// App with an isolated temp data dir; returns (app, data_dir).
    /// `content` is stored under `doc_id` when non-empty.
    async fn test_app_with_store(doc_id: &str, content: &[u8]) -> (axum::Router, String) {
        let dir = std::env::temp_dir().join(format!(
            "wo-pagerender-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let cfg = DocServerConfig {
            host: "127.0.0.1".into(),
            port: 0,
            jwt_secret: "test-secret".into(),
            wopi_host_url: "http://localhost:9999".into(),
            public_url: "http://localhost:9999".into(),
            editor_ui_dir: "./nonexistent-ui".into(),
            data_dir: dir.to_str().unwrap().to_string(),
            wopi_token_mode: "jwt".into(),
            wopi_insecure: false,
        };
        let app = crate::create_app(cfg.clone());
        if !content.is_empty() {
            let store = crate::store::DocStore::new(&cfg.data_dir);
            store.put_content(doc_id, content).await.unwrap();
        }
        (app, dir.to_str().unwrap().to_string())
    }

    async fn get(app: &axum::Router, uri: &str) -> axum::http::Response<Body> {
        app.clone()
            .oneshot(
                Request::builder()
                    .uri(uri)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
    }

    /// Decode width/height out of the PNG IHDR chunk.
    fn png_ihdr_dims(png: &[u8]) -> Option<(u32, u32)> {
        if png.len() < 24 || &png[12..16] != b"IHDR" {
            return None;
        }
        let w = u32::from_be_bytes(png[16..20].try_into().ok()?);
        let h = u32::from_be_bytes(png[20..24].try_into().ok()?);
        Some((w, h))
    }

    #[tokio::test]
    async fn test_page_png_endpoint_serves_real_png() {
        let (app, dir) = test_app_with_store("render-me.docx", &make_minimal_docx()).await;

        let resp = get(&app, "/api/documents/render-me.docx/pages/1.png").await;
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers()[header::CONTENT_TYPE],
            "image/png",
            "must be served as image/png"
        );
        // X-Page-* headers agree with the embedded IHDR geometry (read them
        // before consuming the body).
        let hdr_w: u32 = resp
            .headers()
            .get("x-page-width")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let hdr_h: u32 = resp
            .headers()
            .get("x-page-height")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let bytes = axum::body::to_bytes(resp.into_body(), 16 * 1024 * 1024)
            .await
            .unwrap();
        assert!(
            bytes.starts_with(&[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n']),
            "body must be a real PNG, not raw RGBA bytes"
        );
        let (w, h) = png_ihdr_dims(&bytes).expect("PNG IHDR present");
        assert!(w > 0 && h > 0);
        assert_eq!((hdr_w, hdr_h), (w, h));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn test_page_png_without_suffix_and_beyond_suffix() {
        // /pages/1 (no .png) must behave identically to /pages/1.png.
        let (app, dir) = test_app_with_store("suffix.docx", &make_minimal_docx()).await;

        let a = get(&app, "/api/documents/suffix.docx/pages/1").await;
        let b = get(&app, "/api/documents/suffix.docx/pages/1.png").await;
        assert_eq!(a.status(), StatusCode::OK);
        assert_eq!(b.status(), StatusCode::OK);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn test_page_count_endpoint() {
        let (app, dir) = test_app_with_store("count-me.docx", &make_minimal_docx()).await;

        let resp = get(&app, "/api/documents/count-me.docx/pages/count").await;
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        let pages = v["pages"].as_u64().expect("pages must be numeric");
        assert!(pages >= 1, "one-paragraph doc must lay out to >= 1 page");
        assert_eq!(v["id"], "count-me.docx");

        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn test_page_png_out_of_range_is_404() {
        let (app, dir) = test_app_with_store("short.docx", &make_minimal_docx()).await;

        let resp = get(&app, "/api/documents/short.docx/pages/999.png").await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn test_page_endpoints_reject_bad_input() {
        let (app, dir) = test_app_with_store("guard.docx", &make_minimal_docx()).await;

        // Path traversal must be rejected before it can touch the filesystem.
        let resp = get(&app, "/api/documents/%2e%2e%2fetc%2fpasswd/pages/1.png").await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

        // Page 0 and non-numeric pages are 400.
        assert_eq!(
            get(&app, "/api/documents/guard.docx/pages/0.png").await.status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            get(&app, "/api/documents/guard.docx/pages/abc.png").await.status(),
            StatusCode::BAD_REQUEST
        );

        // Unknown document is 404.
        assert_eq!(
            get(&app, "/api/documents/missing.docx/pages/1.png").await.status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            get(&app, "/api/documents/missing.docx/pages/count").await.status(),
            StatusCode::NOT_FOUND
        );

        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn test_page_png_serves_demo_docx_fallback() {
        // No stored content: demo.docx resolves to the baked demo asset.
        let (app, dir) = test_app_with_store("unused", b"").await;

        let resp = get(&app, "/api/documents/demo.docx/pages/1.png").await;
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(resp.into_body(), 16 * 1024 * 1024)
            .await
            .unwrap();
        assert!(
            bytes.starts_with(&[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n']),
            "demo.docx page 1 must render to a real PNG"
        );

        let resp = get(&app, "/api/documents/demo.docx/pages/count").await;
        assert_eq!(resp.status(), StatusCode::OK);

        let _ = std::fs::remove_dir_all(dir);
    }
}
