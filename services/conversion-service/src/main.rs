//! conversion-service — World-Office document conversion microservice binary.

use conversion_service::{AppState, ConversionRouter, JobRepository, app};
use std::sync::Arc;
use tokio::sync::Mutex;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let router = ConversionRouter::new();
    let state = Arc::new(AppState {
        jobs: Arc::new(Mutex::new(
            JobRepository::new_in_memory().expect("failed to open database"),
        )),
        router: Arc::new(router),
    });
    let app = app(state);

    let addr = std::env::var("SERVICE_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("SERVICE_PORT")
        .unwrap_or_else(|_| "8003".into())
        .parse()
        .unwrap_or(8003);

    tracing::info!(
        "conversion-service v{} starting on {}:{}",
        env!("CARGO_PKG_VERSION"),
        addr,
        port
    );

    let listener = tokio::net::TcpListener::bind(format!("{}:{}", addr, port))
        .await
        .expect("failed to bind");
    axum::serve(listener, app).await.expect("server error");
}
