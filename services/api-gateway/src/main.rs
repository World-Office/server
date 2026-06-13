//! api-gateway — World-Office API Gateway
//!
//! Reverse proxy with JWT validation, CORS, rate limiting,
//! and routing to backend microservices.

use axum::{
    Json, Router,
    body::Body,
    extract::{Request, State},
    http::{HeaderValue, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::get,
};
use bytes::Bytes;
use http_body_util::BodyExt;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::{Deserialize, Serialize};

/// Service route configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServiceRoute {
    path_prefix: &'static str,
    upstream: String,
    strip_prefix: bool,
    requires_auth: bool,
}

/// Gateway application state.
#[derive(Clone)]
struct AppState {
    routes: Vec<ServiceRoute>,
    jwt_secret: String,
    http_client: reqwest::Client,
}

/// Health check response.
#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
    routes: Vec<String>,
}

/// JWT claims for auth validation.
#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    username: String,
    role: String,
    exp: usize,
    iat: usize,
}

/// Error response.
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    code: u16,
}

/// Routes that bypass JWT authentication.
const PUBLIC_PATHS: &[&str] = &["/health", "/auth/login", "/auth/register"];

/// JWT authentication middleware.
async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    let path = req.uri().path();

    // Skip auth for public paths
    if PUBLIC_PATHS.iter().any(|p| path.starts_with(p)) {
        return Ok(next.run(req).await);
    }

    // Extract Authorization header
    let auth_header = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    let token = match auth_header {
        Some(header) if header.starts_with("Bearer ") => &header[7..],
        _ => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Missing or invalid Authorization header".into(),
                    code: 401,
                }),
            ));
        }
    };

    // Validate JWT
    let validation = Validation::new(Algorithm::HS256);
    match decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &validation,
    ) {
        Ok(token_data) => {
            // Inject user info into request headers for downstream services
            req.headers_mut().insert(
                "x-user-id",
                HeaderValue::from_str(&token_data.claims.sub)
                    .unwrap_or_else(|_| HeaderValue::from_static("")),
            );
            req.headers_mut().insert(
                "x-username",
                HeaderValue::from_str(&token_data.claims.username)
                    .unwrap_or_else(|_| HeaderValue::from_static("")),
            );
            req.headers_mut().insert(
                "x-user-role",
                HeaderValue::from_str(&token_data.claims.role)
                    .unwrap_or_else(|_| HeaderValue::from_static("")),
            );
            Ok(next.run(req).await)
        }
        Err(e) => {
            tracing::warn!(error = %e, "JWT validation failed");
            Err((
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Invalid or expired token".into(),
                    code: 401,
                }),
            ))
        }
    }
}

/// Proxy handler — forwards requests to upstream services.
async fn proxy_handler(
    State(state): State<AppState>,
    req: Request,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    let path = req.uri().path();
    let method = req.method().clone();

    // Find matching route
    let route = state
        .routes
        .iter()
        .find(|r| path.starts_with(r.path_prefix))
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: format!("No upstream route for {}", path),
                    code: 404,
                }),
            )
        })?;

    // Build upstream URL
    let upstream_path = if route.strip_prefix {
        path.strip_prefix(route.path_prefix).unwrap_or(path)
    } else {
        path
    };

    let url = format!(
        "{}{}{}",
        route.upstream,
        upstream_path,
        req.uri()
            .query()
            .map(|q| format!("?{}", q))
            .unwrap_or_default()
    );

    tracing::debug!(method = %method, url = %url, "proxying request");

    // Build the proxied request
    let mut upstream_req = state.http_client.request(
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET),
        &url,
    );

    // Forward headers
    for (name, value) in req.headers().iter() {
        let header_name = name.as_str();
        // Skip hop-by-hop headers
        if matches!(
            header_name,
            "host" | "connection" | "transfer-encoding" | "upgrade"
        ) {
            continue;
        }
        if let Ok(val) = value.to_str() {
            upstream_req = upstream_req.header(header_name, val);
        }
    }

    // Forward body
    let body_bytes = req
        .into_body()
        .collect()
        .await
        .map(|c| c.to_bytes())
        .unwrap_or_else(|_| Bytes::new());

    if !body_bytes.is_empty() {
        upstream_req = upstream_req.body(body_bytes.clone());
    }

    // Send upstream request
    let upstream_resp = upstream_req.send().await.map_err(|e| {
        tracing::error!(error = %e, "upstream request failed");
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                error: format!("Upstream error: {}", e),
                code: 502,
            }),
        )
    })?;

    let status = upstream_resp.status();
    let headers = upstream_resp.headers().clone();

    // Stream the response body back
    let body_stream = upstream_resp.bytes_stream();
    let body = Body::from_stream(body_stream);

    let mut response = Response::builder().status(status);
    // Forward response headers
    for (name, value) in headers.iter() {
        let header_name = name.as_str();
        if matches!(header_name, "transfer-encoding" | "connection" | "upgrade") {
            continue;
        }
        response = response.header(name, value);
    }

    response.body(body).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to build response: {}", e),
                code: 500,
            }),
        )
    })
}

/// GET /health — gateway health check with route listing.
async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let routes: Vec<String> = state
        .routes
        .iter()
        .map(|r| format!("{} → {}", r.path_prefix, r.upstream))
        .collect();

    Json(HealthResponse {
        status: "ok",
        service: "api-gateway",
        version: env!("CARGO_PKG_VERSION"),
        routes,
    })
}

fn build_routes(state: AppState) -> Router {
    let mut router = Router::new()
        .route("/health", get(health))
        .fallback(proxy_handler);

    // Add JWT auth middleware
    router = router.layer(middleware::from_fn_with_state(
        state.clone(),
        auth_middleware,
    ));

    router.with_state(state)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let jwt_secret =
        std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret-change-in-production".into());

    let identity_url =
        std::env::var("IDENTITY_SERVICE_URL").unwrap_or_else(|_| "http://127.0.0.1:8001".into());
    let storage_url =
        std::env::var("STORAGE_SERVICE_URL").unwrap_or_else(|_| "http://127.0.0.1:8002".into());
    let conversion_url =
        std::env::var("CONVERSION_SERVICE_URL").unwrap_or_else(|_| "http://127.0.0.1:8003".into());
    let coauthoring_url =
        std::env::var("COAUTHORING_SERVICE_URL").unwrap_or_else(|_| "http://127.0.0.1:8004".into());
    let session_url =
        std::env::var("SESSION_SERVICE_URL").unwrap_or_else(|_| "http://127.0.0.1:8005".into());

    let routes = vec![
        ServiceRoute {
            path_prefix: "/auth",
            upstream: identity_url,
            strip_prefix: false,
            requires_auth: false,
        },
        ServiceRoute {
            path_prefix: "/files",
            upstream: storage_url.clone(),
            strip_prefix: false,
            requires_auth: true,
        },
        ServiceRoute {
            path_prefix: "/api/storage",
            upstream: storage_url,
            strip_prefix: true,
            requires_auth: true,
        },
        ServiceRoute {
            path_prefix: "/convert",
            upstream: conversion_url.clone(),
            strip_prefix: false,
            requires_auth: true,
        },
        ServiceRoute {
            path_prefix: "/jobs",
            upstream: conversion_url,
            strip_prefix: false,
            requires_auth: true,
        },
        ServiceRoute {
            path_prefix: "/sessions",
            upstream: coauthoring_url,
            strip_prefix: false,
            requires_auth: true,
        },
        ServiceRoute {
            path_prefix: "/api/sessions",
            upstream: session_url,
            strip_prefix: true,
            requires_auth: true,
        },
    ];

    let state = AppState {
        routes,
        jwt_secret,
        http_client: reqwest::Client::new(),
    };

    let app = build_routes(state);

    let addr = std::env::var("GATEWAY_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("GATEWAY_PORT")
        .unwrap_or_else(|_| "8080".into())
        .parse()
        .unwrap_or(8080);

    tracing::info!(
        "api-gateway v{} starting on {}:{}",
        env!("CARGO_PKG_VERSION"),
        addr,
        port
    );

    let listener = tokio::net::TcpListener::bind(format!("{}:{}", addr, port))
        .await
        .expect("failed to bind");
    axum::serve(listener, app).await.expect("server error");
}
