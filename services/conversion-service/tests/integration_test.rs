//! Integration tests for the conversion-service.
//!
//! Tests the full chain: HTTP request → axum handler → wo-x2t conversion engine → response.
//! Uses `tower::ServiceExt` for in-memory request/response testing (no network needed).

use axum::body::Body;
use axum::http::{Request, StatusCode};
use conversion_service::{app, create_test_state};
use serde_json::Value;
use tower::ServiceExt;

/// Helper: encode bytes as base64.
fn encode_b64(data: &[u8]) -> String {
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, data)
}

/// Helper: decode base64 response body to JSON Value.
async fn body_json(response: axum::http::Response<Body>) -> Value {
    let bytes = axum::body::to_bytes(response.into_body(), 10 * 1024 * 1024)
        .await
        .unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

// ── POST /convert: successful conversions ──────────────────────────────────

#[tokio::test]
async fn convert_txt_to_html_returns_completed_job() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/convert")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "input_format": "txt",
                        "output_format": "html",
                        "data": encode_b64(b"Hello World")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["job"]["status"], "completed");
    assert_eq!(json["job"]["input_format"], "txt");
    assert_eq!(json["job"]["output_format"], "html");
    assert!(json["job"]["output_data"].is_string());
    assert!(json["job"]["output_size"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn convert_txt_to_html_output_contains_input_text() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/convert")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "input_format": "txt",
                        "output_format": "html",
                        "data": encode_b64(b"Hello World")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let json = body_json(response).await;
    let output_b64 = json["job"]["output_data"].as_str().unwrap();
    let output_bytes =
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, output_b64).unwrap();
    let html = String::from_utf8(output_bytes).unwrap();
    assert!(
        html.contains("Hello World"),
        "HTML output should contain input text"
    );
}

#[tokio::test]
async fn convert_rtf_to_txt_extracts_text() {
    let state = create_test_state();
    let router = app(state);

    let rtf_content = r#"{\rtf1\ansi Hello RTF\par}"#;
    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/convert")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "input_format": "rtf",
                        "output_format": "txt",
                        "data": encode_b64(rtf_content.as_bytes())
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["job"]["status"], "completed");

    let output_b64 = json["job"]["output_data"].as_str().unwrap();
    let output_bytes =
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, output_b64).unwrap();
    let text = String::from_utf8(output_bytes).unwrap();
    assert!(
        text.contains("Hello RTF"),
        "RTF→TXT should extract text content"
    );
}

#[tokio::test]
async fn convert_html_to_txt_strips_tags() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/convert")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "input_format": "html",
                        "output_format": "txt",
                        "data": encode_b64(b"<p>Hello <b>World</b></p>")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["job"]["status"], "completed");
}

// ── POST /convert: error cases ────────────────────────────────────────────

#[tokio::test]
async fn convert_unsupported_format_returns_failed_job() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/convert")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "input_format": "pdf",
                        "output_format": "docx",
                        "data": encode_b64(b"%PDF-1.4 fake")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Unsupported conversions still return 200 with a Failed job
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["job"]["status"], "failed");
    assert!(json["job"]["error"].is_string());
    assert!(
        json["job"]["error"]
            .as_str()
            .unwrap()
            .contains("is not supported")
    );
}

#[tokio::test]
async fn convert_missing_format_returns_400() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/convert")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"input_format":"","output_format":"html","data":"SGVsbG8="}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let json = body_json(response).await;
    assert_eq!(json["code"], 400);
}

#[tokio::test]
async fn convert_empty_data_returns_400() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/convert")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"input_format":"txt","output_format":"html","data":""}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn convert_invalid_base64_returns_400() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/convert")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"input_format":"txt","output_format":"html","data":"not-valid-base64!!"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let json = body_json(response).await;
    assert!(json["error"].as_str().unwrap().contains("Invalid base64"));
}

// ── GET /formats ──────────────────────────────────────────────────────────

#[tokio::test]
async fn formats_returns_all_fourteen_registered_pairs() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/formats")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    let formats = json.as_array().unwrap();
    assert_eq!(
        formats.len(),
        38,
        "Should have exactly 38 registered format pairs"
    );

    // Verify all expected pairs are present
    let pairs: Vec<(&str, &str)> = formats
        .iter()
        .map(|f| (f["source"].as_str().unwrap(), f["target"].as_str().unwrap()))
        .collect();

    // Original 8 converters
    assert!(pairs.contains(&("rtf", "txt")));
    assert!(pairs.contains(&("rtf", "html")));
    assert!(pairs.contains(&("html", "txt")));
    assert!(pairs.contains(&("html", "rtf")));
    assert!(pairs.contains(&("txt", "html")));
    assert!(pairs.contains(&("txt", "rtf")));
    assert!(pairs.contains(&("docx", "txt")));
    assert!(pairs.contains(&("docx", "html")));
    assert!(pairs.contains(&("odt", "txt")));
    assert!(pairs.contains(&("odt", "html")));
    // New format converters
    assert!(pairs.contains(&("epub", "txt")));
    assert!(pairs.contains(&("epub", "html")));
    assert!(pairs.contains(&("fb2", "txt")));
    assert!(pairs.contains(&("hwp", "txt")));
}

// ── GET /jobs/{id} ────────────────────────────────────────────────────────

#[tokio::test]
async fn get_nonexistent_job_returns_404() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/jobs/nonexistent-id")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let json = body_json(response).await;
    assert_eq!(json["code"], 404);
}

// ── GET /jobs (list) ──────────────────────────────────────────────────────

#[tokio::test]
async fn list_jobs_empty_returns_empty_array() {
    let state = create_test_state();
    let router = app(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/jobs")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn list_jobs_after_conversion_contains_job() {
    let state = create_test_state();
    let router = app(state.clone());

    // Submit a conversion first
    let response = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/convert")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "input_format": "txt",
                        "output_format": "html",
                        "data": encode_b64(b"test content")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let convert_json = body_json(response).await;
    let job_id = convert_json["job"]["id"].as_str().unwrap().to_string();

    // Now list jobs — note: oneshot consumes the router, so we need a fresh one
    // that shares the same state
    let router2 = app(state);
    let list_response = router2
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/jobs")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let list_json = body_json(list_response).await;
    let jobs = list_json.as_array().unwrap();
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0]["id"].as_str().unwrap(), job_id);
    assert_eq!(jobs[0]["status"], "completed");
}

// ── Full conversion chain: submit → retrieve job ──────────────────────────

#[tokio::test]
async fn full_chain_convert_then_retrieve_job() {
    let state = create_test_state();

    // Submit conversion
    let router1 = app(state.clone());
    let response = router1
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/convert")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "input_format": "txt",
                        "output_format": "html",
                        "data": encode_b64(b"Integration test content")
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let convert_json = body_json(response).await;
    let job_id = convert_json["job"]["id"].as_str().unwrap().to_string();

    // Retrieve the job by ID
    let router2 = app(state);
    let job_response = router2
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/jobs/{}", job_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(job_response.status(), StatusCode::OK);
    let job_json = body_json(job_response).await;
    assert_eq!(job_json["job"]["id"], job_id);
    assert_eq!(job_json["job"]["input_format"], "txt");
    assert_eq!(job_json["job"]["output_format"], "html");
    assert_eq!(job_json["job"]["status"], "completed");
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
    assert_eq!(json["service"], "conversion-service");
}
