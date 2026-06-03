//! Integration tests for the storage-service.
//!
//! Tests the full chain: HTTP request → axum handler → filesystem storage → response.
//! Uses `tower::ServiceExt` for in-memory request/response testing (no network needed).

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::Value;
use storage_service::{app, create_test_state};
use tower::ServiceExt;

/// Helper: encode bytes as base64.
fn encode_b64(data: &[u8]) -> String {
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, data)
}

/// Helper: decode response body to JSON Value.
async fn body_json(response: axum::http::Response<Body>) -> Value {
    let bytes = axum::body::to_bytes(response.into_body(), 10 * 1024 * 1024)
        .await
        .unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

/// Helper: decode response body to raw bytes.
async fn body_bytes(response: axum::http::Response<Body>) -> bytes::Bytes {
    axum::body::to_bytes(response.into_body(), 10 * 1024 * 1024)
        .await
        .unwrap()
}

// ── POST /files: upload ───────────────────────────────────────────────────

#[tokio::test]
async fn upload_file_returns_201_with_metadata() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "test.txt",
                        "content_type": "text/plain",
                        "data": encode_b64(b"Hello, World!")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    let json = body_json(response).await;
    assert!(json["file"]["id"].is_string());
    assert_eq!(json["file"]["name"], "test.txt");
    assert_eq!(json["file"]["content_type"], "text/plain");
    assert_eq!(json["file"]["size"], 13); // "Hello, World!" = 13 bytes
}

#[tokio::test]
async fn upload_file_without_content_type_defaults_to_octet_stream() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "data.bin",
                        "data": encode_b64(b"\x00\x01\x02\x03")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    let json = body_json(response).await;
    assert_eq!(json["file"]["content_type"], "application/octet-stream");
}

#[tokio::test]
async fn upload_empty_name_returns_400() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"name":"","content_type":"text/plain","data":"SGVsbG8="}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn upload_invalid_base64_returns_400() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"name":"test.txt","content_type":"text/plain","data":"not-valid-base64!!"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let json = body_json(response).await;
    assert!(json["error"].as_str().unwrap().contains("Invalid base64"));
}

// ── GET /files: list ──────────────────────────────────────────────────────

#[tokio::test]
async fn list_files_empty_returns_empty_list() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/files")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["count"], 0);
    assert_eq!(json["files"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn list_files_after_upload_contains_file() {
    let state = create_test_state();

    // Upload a file
    let router1 = app(state.clone());
    let upload_resp = router1
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "document.txt",
                        "content_type": "text/plain",
                        "data": encode_b64(b"content here")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(upload_resp.status(), StatusCode::CREATED);

    // List files (fresh router, shared state)
    let router2 = app(state);
    let list_resp = router2
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/files")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let json = body_json(list_resp).await;
    assert_eq!(json["count"], 1);
    assert_eq!(json["files"][0]["name"], "document.txt");
}

// ── GET /files/{id}: metadata ─────────────────────────────────────────────

#[tokio::test]
async fn get_file_metadata_by_id() {
    let state = create_test_state();

    // Upload
    let router1 = app(state.clone());
    let upload_resp = router1
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "test.txt",
                        "content_type": "text/plain",
                        "data": encode_b64(b"Hello, World!")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let upload_json = body_json(upload_resp).await;
    let file_id = upload_json["file"]["id"].as_str().unwrap().to_string();

    // Get metadata
    let router2 = app(state);
    let get_resp = router2
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/files/{}", file_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(get_resp.status(), StatusCode::OK);
    let json = body_json(get_resp).await;
    assert_eq!(json["id"], file_id);
    assert_eq!(json["name"], "test.txt");
    assert_eq!(json["size"], 13);
}

#[tokio::test]
async fn get_nonexistent_file_returns_404() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/files/nonexistent-id")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let json = body_json(response).await;
    assert_eq!(json["code"], 404);
}

// ── GET /files/{id}/content: download ─────────────────────────────────────

#[tokio::test]
async fn download_file_content_matches_upload() {
    let state = create_test_state();
    let original_data = b"Hello, World! This is test content.";

    // Upload
    let router1 = app(state.clone());
    let upload_resp = router1
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "content-test.txt",
                        "content_type": "text/plain",
                        "data": encode_b64(original_data)
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let upload_json = body_json(upload_resp).await;
    let file_id = upload_json["file"]["id"].as_str().unwrap().to_string();

    // Download content
    let router2 = app(state);
    let download_resp = router2
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/files/{}/content", file_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(download_resp.status(), StatusCode::OK);
    let bytes = body_bytes(download_resp).await;
    assert_eq!(bytes.as_ref(), original_data);
}

#[tokio::test]
async fn download_content_has_correct_content_type_header() {
    let state = create_test_state();

    // Upload
    let router1 = app(state.clone());
    let upload_resp = router1
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "image.png",
                        "content_type": "image/png",
                        "data": encode_b64(b"\x89PNG\r\n\x1a\nfake")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let upload_json = body_json(upload_resp).await;
    let file_id = upload_json["file"]["id"].as_str().unwrap().to_string();

    // Download
    let router2 = app(state);
    let download_resp = router2
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/files/{}/content", file_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(download_resp.status(), StatusCode::OK);
    let ct = download_resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert_eq!(ct, "image/png");
}

#[tokio::test]
async fn download_nonexistent_file_returns_404() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/files/nonexistent-id/content")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ── DELETE /files/{id} ───────────────────────────────────────────────────

#[tokio::test]
async fn delete_file_returns_success() {
    let state = create_test_state();

    // Upload
    let router1 = app(state.clone());
    let upload_resp = router1
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "to-delete.txt",
                        "content_type": "text/plain",
                        "data": encode_b64(b"delete me")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let upload_json = body_json(upload_resp).await;
    let file_id = upload_json["file"]["id"].as_str().unwrap().to_string();

    // Delete
    let router2 = app(state.clone());
    let delete_resp = router2
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/files/{}", file_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(delete_resp.status(), StatusCode::OK);
    let json = body_json(delete_resp).await;
    assert_eq!(json["deleted"], true);
    assert_eq!(json["id"], file_id);

    // Verify file is gone from listing
    let router3 = app(state);
    let list_resp = router3
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/files")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let list_json = body_json(list_resp).await;
    assert_eq!(list_json["count"], 0);
}

#[tokio::test]
async fn delete_nonexistent_file_returns_404() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/files/nonexistent-id")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ── Full upload → download chain ──────────────────────────────────────────

#[tokio::test]
async fn full_chain_upload_download_delete() {
    let state = create_test_state();
    let original_data = b"Full chain integration test data";

    // Step 1: Upload
    let router1 = app(state.clone());
    let upload_resp = router1
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "chain-test.txt",
                        "content_type": "text/plain",
                        "data": encode_b64(original_data)
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(upload_resp.status(), StatusCode::CREATED);
    let upload_json = body_json(upload_resp).await;
    let file_id = upload_json["file"]["id"].as_str().unwrap().to_string();

    // Step 2: Verify in listing
    let router2 = app(state.clone());
    let list_resp = router2
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/files")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let list_json = body_json(list_resp).await;
    assert_eq!(list_json["count"], 1);

    // Step 3: Get metadata
    let router3 = app(state.clone());
    let meta_resp = router3
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/files/{}", file_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(meta_resp.status(), StatusCode::OK);

    // Step 4: Download content and verify
    let router4 = app(state.clone());
    let dl_resp = router4
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/files/{}/content", file_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let dl_bytes = body_bytes(dl_resp).await;
    assert_eq!(dl_bytes.as_ref(), original_data);

    // Step 5: Delete
    let router5 = app(state.clone());
    let del_resp = router5
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/files/{}", file_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(del_resp.status(), StatusCode::OK);

    // Step 6: Verify deleted
    let router6 = app(state);
    let final_list = router6
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/files")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let final_json = body_json(final_list).await;
    assert_eq!(final_json["count"], 0);
}

// ── GET /health ───────────────────────────────────────────────────────────

#[tokio::test]
async fn health_check_returns_ok() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["status"], "ok");
    assert_eq!(json["service"], "storage-service");
}

// ── Content Link CRUD ─────────────────────────────────────────────────────

#[tokio::test]
async fn test_content_link_crud() {
    let state = create_test_state();

    // Create a source document via API
    let router1 = app(state.clone());
    let src_resp = router1
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "source-doc.txt",
                        "content_type": "text/plain",
                        "data": encode_b64(b"Hello from source document!")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(src_resp.status(), StatusCode::CREATED);
    let src_body = body_json(src_resp).await;
    let src_id = src_body["file"]["id"].as_str().unwrap().to_string();

    // Create a target document
    let router2 = app(state.clone());
    let tgt_resp = router2
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "target-doc.txt",
                        "content_type": "text/plain",
                        "data": encode_b64(b"Target content")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(tgt_resp.status(), StatusCode::CREATED);
    let tgt_body = body_json(tgt_resp).await;
    let tgt_id = tgt_body["file"]["id"].as_str().unwrap().to_string();

    // Create content link
    let router3 = app(state.clone());
    let cl_resp = router3
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/documents/{}/content-links", tgt_id))
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "source_document_id": src_id,
                        "source_document_name": "Source Document",
                        "target_document_name": "Target Document",
                        "display_text": "See source doc"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(cl_resp.status(), StatusCode::CREATED);
    let cl_data = body_json(cl_resp).await;
    let cl_id = cl_data["id"].as_str().unwrap().to_string();
    assert_eq!(cl_data["source_document_id"], src_id);
    assert_eq!(cl_data["target_document_id"], tgt_id);

    // List content links for target
    let router4 = app(state.clone());
    let list_resp = router4
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/documents/{}/content-links", tgt_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_resp.status(), StatusCode::OK);
    let list_data = body_json(list_resp).await;
    assert_eq!(list_data["count"], 1);

    // Delete content link
    let router5 = app(state);
    let del_resp = router5
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/content-links/{}", cl_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(del_resp.status(), StatusCode::OK);
    let del_data = body_json(del_resp).await;
    assert_eq!(del_data["deleted"], true);
}
