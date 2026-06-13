//! WebDAV HTTP method handlers
//!
//! This module implements handlers for WebDAV HTTP methods including:
//! PROPFIND, MKCOL, PUT, DELETE, GET, MOVE, COPY, LOCK, UNLOCK

use crate::models::{DavResponse, MultiStatus, Prop, PropStat};
use crate::storage::{LockDepth, WebDavStorage};
use anyhow::Result;
use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{
        header::{self, HeaderMap, HeaderName, HeaderValue},
        StatusCode,
    },
    response::{IntoResponse, Response},
};
use std::sync::Arc;
use urlencoding::decode;

/// WebDAV state containing the storage backend
#[derive(Clone)]
pub struct WebDavState<S: WebDavStorage> {
    /// Storage backend
    pub storage: Arc<S>,
    /// Authentication realm
    pub realm: String,
}

/// Depth header for recursive operations
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Depth {
    /// Only the resource itself
    Zero,
    /// Immediate children
    One,
    /// All descendants
    Infinity,
}

impl Depth {
    /// Parse depth from header value
    pub fn from_header(value: Option<&HeaderValue>) -> Self {
        match value.and_then(|v| v.to_str().ok()) {
            Some("0") => Depth::Zero,
            Some("1") => Depth::One,
            _ => Depth::Infinity,
        }
    }

    /// Get depth header name
    pub const fn header_name() -> &'static str {
        "Depth"
    }
}

/// Handle PROPFIND request - list directory or file properties
pub async fn propfind_handler<S: WebDavStorage>(
    State(state): State<WebDavState<S>>,
    Path(path): Path<String>,
    headers: HeaderMap,
    _body: Bytes,
) -> std::result::Result<Response, StatusCode> {
    let path = decode_path(&path);
    let depth = Depth::from_header(headers.get("Depth"));

    // Check if resource exists
    let exists = state.storage.exists(&path).await.map_err(|e| {
        eprintln!("Error checking existence: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if !exists {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut multistatus = MultiStatus::new();

    // Add self
    match handle_propfind_resource(&state, &path).await {
        Ok(response) => multistatus.add_response(response),
        Err(e) => {
            eprintln!("Error handling PROPFIND for {}: {:?}", path, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // Add children if depth > 0
    if depth != Depth::Zero {
        match state.storage.get_resource(&path).await {
            Ok(info) if info.is_collection => {
                if let Ok(children) = state.storage.list_children(&path).await {
                    for child_info in children {
                        if let Ok(response) = handle_propfind_child(&state, &child_info).await {
                            multistatus.add_response(response);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    // Convert to XML
    let xml = multistatus.to_xml().map_err(|e| {
        eprintln!("Error serializing multistatus: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((
        StatusCode::MULTI_STATUS,
        [(header::CONTENT_TYPE, "application/xml; charset=utf-8")],
        xml,
    )
        .into_response())
}

/// Handle PROPFIND for a single resource
async fn handle_propfind_resource<S: WebDavStorage>(
    state: &WebDavState<S>,
    path: &str,
) -> Result<DavResponse> {
    let info = state.storage.get_resource(path).await?;

    let prop = if info.is_collection {
        Prop::for_collection(info.path.clone(), info.modified, info.etag)
    } else {
        Prop::for_file(
            info.path.clone(),
            info.size,
            info.modified,
            info.content_type,
            info.etag,
        )
    };

    let prop_stat = PropStat::ok(prop);
    Ok(DavResponse::new(info.path, prop_stat))
}

/// Handle PROPFIND for a child resource
async fn handle_propfind_child<S: WebDavStorage>(
    _state: &WebDavState<S>,
    info: &crate::storage::ResourceInfo,
) -> anyhow::Result<DavResponse> {
    let prop = if info.is_collection {
        Prop::for_collection(info.path.clone(), info.modified, info.etag.clone())
    } else {
        Prop::for_file(
            info.path.clone(),
            info.size,
            info.modified,
            info.content_type.clone(),
            info.etag.clone(),
        )
    };

    let prop_stat = PropStat::ok(prop);
    Ok(DavResponse::new(info.path.clone(), prop_stat))
}

/// Handle MKCOL request - create directory
pub async fn mkcol_handler<S: WebDavStorage>(
    State(state): State<WebDavState<S>>,
    Path(path): Path<String>,
) -> std::result::Result<StatusCode, StatusCode> {
    let path = decode_path(&path);

    // Check if resource already exists
    let exists = match state.storage.exists(&path).await {
        Ok(e) => e,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    if exists {
        return Ok(StatusCode::METHOD_NOT_ALLOWED);
    }

    // Create collection
    match state.storage.create_collection(&path).await {
        Ok(_) => Ok(StatusCode::CREATED),
        Err(_) => Err(StatusCode::FORBIDDEN),
    }
}

/// Handle PUT request - create or replace file
pub async fn put_handler<S: WebDavStorage>(
    State(state): State<WebDavState<S>>,
    Path(path): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> std::result::Result<StatusCode, StatusCode> {
    let path = decode_path(&path);

    // Check if resource is locked
    match state.storage.is_locked(&path).await {
        Ok(true) => return Ok(StatusCode::LOCKED),
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
        _ => {}
    }

    // Check if parent exists
    let parent_path = path
        .rsplit('/')
        .nth(1)
        .map(|p| format!("/{}", p))
        .unwrap_or_else(|| "/".to_string());

    if !parent_path.is_empty() {
        match state.storage.exists(&parent_path).await {
            Ok(false) => return Ok(StatusCode::CONFLICT),
            Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
            _ => {}
        }
    }

    // Write resource
    match state.storage.write_resource(&path, body.to_vec()).await {
        Ok(_) => {}
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    }

    // Return 201 Created if new, 200 OK if existing
    let exists_before = headers.get("If-Match").is_none();
    Ok(if exists_before {
        StatusCode::CREATED
    } else {
        StatusCode::NO_CONTENT
    })
}

/// Handle DELETE request - delete resource
pub async fn delete_handler<S: WebDavStorage>(
    State(state): State<WebDavState<S>>,
    Path(path): Path<String>,
) -> std::result::Result<StatusCode, StatusCode> {
    let path = decode_path(&path);

    // Check if resource exists
    let exists = match state.storage.exists(&path).await {
        Ok(e) => e,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    if !exists {
        return Ok(StatusCode::NOT_FOUND);
    }

    // Check if resource is locked
    match state.storage.is_locked(&path).await {
        Ok(true) => return Ok(StatusCode::LOCKED),
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
        _ => {}
    }

    // Delete resource
    match state.storage.delete_resource(&path).await {
        Ok(_) => Ok(StatusCode::NO_CONTENT),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

/// Handle GET request - read file or directory listing
pub async fn get_handler<S: WebDavStorage>(
    State(state): State<WebDavState<S>>,
    Path(path): Path<String>,
    _headers: HeaderMap,
) -> std::result::Result<Response, StatusCode> {
    let path = decode_path(&path);

    // Check if resource exists
    let exists = match state.storage.exists(&path).await {
        Ok(e) => e,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    if !exists {
        return Err(StatusCode::NOT_FOUND);
    }

    // Get resource info
    let info = match state.storage.get_resource(&path).await {
        Ok(i) => i,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    // Return directory listing for collections
    if info.is_collection {
        // Generate HTML directory listing
        let children = match state.storage.list_children(&path).await {
            Ok(c) => c,
            Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
        };

        let html = generate_directory_listing(&path, &children);
        return Ok((
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            html,
        )
            .into_response());
    }

    // Return file content
    let data = match state.storage.read_resource(&path).await {
        Ok(d) => d,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    // Set content type
    let content_type = info.content_type.clone();

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type),
            (header::CONTENT_LENGTH, data.len().to_string()),
            (header::ETAG, info.etag.clone()),
        ],
        data,
    )
        .into_response())
}

/// Handle HEAD request - get metadata without content
pub async fn head_handler<S: WebDavStorage>(
    State(state): State<WebDavState<S>>,
    Path(path): Path<String>,
) -> std::result::Result<Response, StatusCode> {
    let path = decode_path(&path);

    // Check if resource exists
    let exists = match state.storage.exists(&path).await {
        Ok(e) => e,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    if !exists {
        return Err(StatusCode::NOT_FOUND);
    }

    // Get resource info
    let info = match state.storage.get_resource(&path).await {
        Ok(i) => i,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    // Return headers only
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, info.content_type.clone()),
            (header::CONTENT_LENGTH, info.size.to_string()),
            (header::ETAG, info.etag.clone()),
            (header::LAST_MODIFIED, info.modified.to_rfc2822()),
        ],
        (),
    )
        .into_response())
}

/// Handle MOVE request - move/rename resource
pub async fn move_handler<S: WebDavStorage>(
    State(state): State<WebDavState<S>>,
    Path(path): Path<String>,
    headers: HeaderMap,
) -> std::result::Result<StatusCode, StatusCode> {
    let path = decode_path(&path);

    // Get destination
    let destination = match headers.get("Destination").and_then(|v| v.to_str().ok()) {
        Some(d) => d,
        None => return Err(StatusCode::BAD_REQUEST),
    };

    // Extract path from URL
    let dest_path = destination
        .split('/')
        .collect::<Vec<_>>()
        .split_last()
        .map(|(_, rest)| format!("/{}", rest.join("/")))
        .unwrap_or_else(|| "/".to_string());

    let dest_path = decode_path(&dest_path);

    // Check if resource exists
    let exists = match state.storage.exists(&path).await {
        Ok(e) => e,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    if !exists {
        return Ok(StatusCode::NOT_FOUND);
    }

    // Check if resource is locked
    match state.storage.is_locked(&path).await {
        Ok(true) => return Ok(StatusCode::LOCKED),
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
        _ => {}
    }

    // Check overwrite header
    let overwrite = headers
        .get("Overwrite")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_uppercase() == "T")
        .unwrap_or(false);

    // Move resource
    match state
        .storage
        .move_resource(&path, &dest_path, overwrite)
        .await
    {
        Ok(_) => Ok(StatusCode::CREATED),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

/// Handle COPY request - copy resource
pub async fn copy_handler<S: WebDavStorage>(
    State(state): State<WebDavState<S>>,
    Path(path): Path<String>,
    headers: HeaderMap,
) -> std::result::Result<StatusCode, StatusCode> {
    let path = decode_path(&path);

    // Get destination
    let destination = match headers.get("Destination").and_then(|v| v.to_str().ok()) {
        Some(d) => d,
        None => return Err(StatusCode::BAD_REQUEST),
    };

    // Extract path from URL
    let dest_path = destination
        .split('/')
        .collect::<Vec<_>>()
        .split_last()
        .map(|(_, rest)| format!("/{}", rest.join("/")))
        .unwrap_or_else(|| "/".to_string());

    let dest_path = decode_path(&dest_path);

    // Check if resource exists
    let exists = match state.storage.exists(&path).await {
        Ok(e) => e,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    if !exists {
        return Ok(StatusCode::NOT_FOUND);
    }

    // Check overwrite header
    let overwrite = headers
        .get("Overwrite")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_uppercase() == "T")
        .unwrap_or(false);

    // Copy resource
    match state
        .storage
        .copy_resource(&path, &dest_path, overwrite)
        .await
    {
        Ok(_) => Ok(StatusCode::CREATED),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

/// Handle LOCK request - acquire lock on resource
pub async fn lock_handler<S: WebDavStorage>(
    State(state): State<WebDavState<S>>,
    Path(path): Path<String>,
    headers: HeaderMap,
    _body: Bytes,
) -> std::result::Result<Response, StatusCode> {
    let path = decode_path(&path);

    // Check if resource exists
    let exists = match state.storage.exists(&path).await {
        Ok(e) => e,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    if !exists {
        return Err(StatusCode::NOT_FOUND);
    }

    // Get depth header
    let depth = match headers
        .get("Depth")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("0")
    {
        "0" => LockDepth::Zero,
        "infinity" => LockDepth::Infinity,
        _ => LockDepth::One,
    };

    // Get timeout header
    let timeout = headers
        .get("Timeout")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Second-"))
        .and_then(|s| s.parse::<u32>().ok());

    // Get owner from body or headers
    let owner = "anonymous".to_string();

    // Acquire lock
    let token = match state
        .storage
        .lock_resource(&path, owner.clone(), depth, timeout)
        .await
    {
        Ok(t) => t,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    // Build lock response
    let lock_token = format!("urn:uuid:{}", token);
    let depth_str = match depth {
        LockDepth::Zero => "0",
        LockDepth::One => "1",
        LockDepth::Infinity => "infinity",
    };
    let response_body = format!(
        r#"<?xml version="1.0" encoding="utf-8" ?>
<D:prop xmlns:D="DAV:">
    <D:lockdiscovery>
        <D:activelock>
            <D:locktype><D:write/></D:locktype>
            <D:lockscope><D:exclusive/></D:lockscope>
            <D:depth>{}</D:depth>
            <D:owner>{}</D:owner>
            <D:locktoken>
                <D:href>{}</D:href>
            </D:locktoken>
        </D:activelock>
    </D:lockdiscovery>
</D:prop>"#,
        depth_str, owner, lock_token
    );

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/xml; charset=utf-8"),
            (HeaderName::from_static("Lock-Token"), lock_token.as_str()),
        ],
        response_body,
    )
        .into_response())
}

/// Handle UNLOCK request - release lock on resource
pub async fn unlock_handler<S: WebDavStorage>(
    State(state): State<WebDavState<S>>,
    Path(path): Path<String>,
    headers: HeaderMap,
) -> std::result::Result<StatusCode, StatusCode> {
    let path = decode_path(&path);

    // Get lock token
    let lock_token = match headers
        .get("Lock-Token")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("<"))
        .and_then(|v| v.strip_suffix(">"))
        .and_then(|v| v.strip_prefix("urn:uuid:"))
    {
        Some(t) => t,
        None => return Err(StatusCode::BAD_REQUEST),
    };

    // Release lock
    match state.storage.unlock_resource(&path, lock_token).await {
        Ok(_) => Ok(StatusCode::NO_CONTENT),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

/// Decode URL-encoded path
fn decode_path(path: &str) -> String {
    match decode(path) {
        Ok(decoded) => decoded.to_string(),
        Err(_) => path.to_string(),
    }
}

/// Generate HTML directory listing
fn generate_directory_listing(path: &str, children: &[crate::storage::ResourceInfo]) -> String {
    let _parent_path = if path == "/" {
        String::new()
    } else {
        path.rsplit('/')
            .nth(1)
            .map(|p| format!("/{}", p))
            .unwrap_or_else(|| "/".to_string())
    };

    let rows = children
        .iter()
        .map(|child| {
            let icon = if child.is_collection { "📁" } else { "📄" };
            let href = if child.path.starts_with('/') {
                child.path.clone()
            } else {
                format!("/{}", child.path)
            };
            let modified = child.modified.format("%Y-%m-%d %H:%M");
            let size = if child.is_collection {
                "-".to_string()
            } else {
                format_size(child.size)
            };

            format!(
                r#"<tr>
            <td class="icon">{}</td>
            <td class="name"><a href="{}">{}</a></td>
            <td class="modified">{}</td>
            <td class="size">{}</td>
        </tr>"#,
                icon,
                href,
                child.path.split('/').next_back().unwrap_or(&child.path),
                modified,
                size
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Index of {}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; background: #f5f5f5; }}
        h1 {{ color: #333; margin-bottom: 30px; }}
        table {{ width: 100%; background: white; border-collapse: collapse; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        th {{ text-align: left; padding: 12px; background: #f8f9fa; color: #666; font-weight: 600; }}
        td {{ padding: 12px; border-bottom: 1px solid #eee; }}
        tr:hover {{ background: #f8f9fa; }}
        .icon {{ font-size: 20px; }}
        .name {{ width: 50%; }}
        .name a {{ text-decoration: none; color: #007bff; }}
        .name a:hover {{ text-decoration: underline; }}
        .modified {{ color: #666; }}
        .size {{ text-align: right; color: #666; }}
    </style>
</head>
<body>
    <h1>Index of {}</h1>
    <table>
        <thead>
            <tr>
                <th></th>
                <th>Name</th>
                <th>Last modified</th>
                <th>Size</th>
            </tr>
        </thead>
        <tbody>
            {}
        </tbody>
    </table>
</body>
</html>"#,
        path, path, rows
    )
}

/// Format file size
fn format_size(size: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = size as f64;
    let mut unit_index = 0;

    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }

    format!("{:.1} {}", size, UNITS[unit_index])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_path() {
        assert_eq!(decode_path("/test%20file.txt"), "/test file.txt");
        assert_eq!(decode_path("/normal/path.txt"), "/normal/path.txt");
    }

    #[test]
    fn test_format_size() {
        assert_eq!(format_size(100), "100.0 B");
        assert_eq!(format_size(1024), "1.0 KB");
        assert_eq!(format_size(1024 * 1024), "1.0 MB");
        assert_eq!(format_size(1536), "1.5 KB");
    }

    #[test]
    fn test_depth_from_header() {
        assert_eq!(
            Depth::from_header(Some(&HeaderValue::from_static("0"))),
            Depth::Zero
        );
        assert_eq!(
            Depth::from_header(Some(&HeaderValue::from_static("1"))),
            Depth::One
        );
        assert_eq!(
            Depth::from_header(Some(&HeaderValue::from_static("infinity"))),
            Depth::Infinity
        );
        assert_eq!(Depth::from_header(None), Depth::Infinity);
    }
}
