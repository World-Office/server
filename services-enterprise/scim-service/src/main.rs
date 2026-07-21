//! scim-service — World-Office enterprise SCIM provisioning microservice binary.

#![cfg_attr(feature = "enterprise", allow(unused))]
#![cfg_attr(not(feature = "enterprise"), allow(dead_code))]

use scim_service::{AppState, app, repository::ScimRepository};
use std::sync::Arc;
use tokio::sync::Mutex;

#[cfg_attr(not(feature = "enterprise"), allow(unreachable_code))]
#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let db_path = std::env::var("SCIM_DB_PATH").unwrap_or_else(|_| "./data/scim.db".into());

    let repo = ScimRepository::new(&db_path).expect("failed to open SCIM database");

    let state = Arc::new(AppState {
        repo: Arc::new(Mutex::new(repo)),
    });

    let app = app(state);

    let addr = std::env::var("SERVICE_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("SERVICE_PORT")
        .unwrap_or_else(|_| "8004".into())
        .parse()
        .unwrap_or(8004);

    tracing::info!(
        "scim-service v{} starting on {}:{}",
        env!("CARGO_PKG_VERSION"),
        addr,
        port
    );

    let listener = tokio::net::TcpListener::bind(format!("{}:{}", addr, port))
        .await
        .expect("failed to bind");
    axum::serve(listener, app).await.expect("server error");
}
