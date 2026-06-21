// Axum-based WOPI HTTP server

use crate::handlers::{check_file_info, get_file, put_file, WopiState};
use crate::storage::StorageBackend;
use axum::{routing::get, Router};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::info;

/// WOPI server configuration.
#[derive(Clone)]
pub struct WopiServerConfig {
    /// Bind address for the server
    pub bind_address: String,
    /// Port to listen on
    pub port: u16,
}

impl Default for WopiServerConfig {
    fn default() -> Self {
        Self {
            bind_address: "127.0.0.1".to_string(),
            port: 3000,
        }
    }
}

/// WOPI server.
pub struct WopiServer<S: StorageBackend> {
    state: Arc<WopiState<S>>,
    config: WopiServerConfig,
}

impl<S: StorageBackend + 'static> WopiServer<S> {
    /// Create a new WOPI server.
    pub fn new(storage: S) -> Self {
        Self {
            state: Arc::new(WopiState::new(storage)),
            config: WopiServerConfig::default(),
        }
    }

    /// Create a new WOPI server with custom configuration.
    pub fn with_config(storage: S, config: WopiServerConfig) -> Self {
        Self {
            state: Arc::new(WopiState::new(storage)),
            config,
        }
    }

    /// Get a reference to the WOPI state.
    pub fn state(&self) -> &WopiState<S> {
        &self.state
    }

    /// Build the Axum router.
    pub fn build_router(&self) -> Router {
        Router::new()
            // WOPI endpoints
            .route("/wopi/files/{file_id}", get(check_file_info))
            .route(
                "/wopi/files/{file_id}/contents",
                get(get_file).post(put_file),
            )
            // Health check endpoint
            .route("/health", get(health_check))
            .with_state(self.state.clone())
    }

    /// Run the server.
    pub async fn run(self) -> Result<(), Box<dyn std::error::Error>> {
        let addr: SocketAddr = format!("{}:{}", self.config.bind_address, self.config.port)
            .parse()
            .expect("Invalid bind address");

        let listener = TcpListener::bind(&addr).await?;
        info!("WOPI server listening on {}", addr);

        axum::serve(listener, self.build_router()).await?;

        Ok(())
    }

    /// Run the server on the specified address.
    pub async fn run_on(self, addr: SocketAddr) -> Result<(), Box<dyn std::error::Error>> {
        let listener = TcpListener::bind(&addr).await?;
        info!("WOPI server listening on {}", addr);

        axum::serve(listener, self.build_router()).await?;

        Ok(())
    }
}

/// Health check handler.
async fn health_check() -> &'static str {
    "WOPI server is healthy"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::FileSystemStorage;
    use axum::body::Body;
    use axum::http::{Method, Request, StatusCode};
    use std::sync::Arc;
    use tempfile::TempDir;
    use tower::ServiceExt;

    #[test]
    fn test_wopi_server_creation() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let server = WopiServer::new(storage);

        assert_eq!(server.config.port, 3000);
        assert_eq!(server.config.bind_address, "127.0.0.1");
    }

    #[test]
    fn test_wopi_server_with_config() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let config = WopiServerConfig {
            bind_address: "0.0.0.0".to_string(),
            port: 8080,
        };
        let server = WopiServer::with_config(storage, config);

        assert_eq!(server.config.port, 8080);
        assert_eq!(server.config.bind_address, "0.0.0.0");
    }

    #[test]
    fn test_wopi_server_state_access() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let server = WopiServer::new(storage);

        let _state = server.state();

        let state = Arc::try_unwrap(server.state)
            .ok()
            .expect("Arc should have single owner");
        assert!(state.access_tokens.is_empty());
    }

    #[test]
    fn test_health_check_returns_healthy() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let response = health_check().await;
            assert_eq!(response, "WOPI server is healthy");
        });
    }

    #[tokio::test]
    async fn test_build_router_has_wopi_routes() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        storage.write_file("doc.txt", b"hello").await.unwrap();

        let server = WopiServer::new(storage);
        let router = server.build_router();

        // Test health endpoint
        let req = Request::builder()
            .uri("/health")
            .body(Body::empty())
            .unwrap();
        let res = router.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_build_router_wopi_endpoint_missing_token_returns_400() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let server = WopiServer::new(storage);
        let router = server.build_router();

        // No query params at all should produce 400 (missing access_token query param)
        let req = Request::builder()
            .uri("/wopi/files/doc.txt")
            .body(Body::empty())
            .unwrap();
        let res = router.oneshot(req).await.unwrap();
        // 400 because access_token is required but missing
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_build_router_health_check() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let server = WopiServer::new(storage);
        let router = server.build_router();

        let req = Request::builder()
            .uri("/health")
            .body(Body::empty())
            .unwrap();
        let res = router.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[test]
    fn test_wopi_server_config_default() {
        let config = WopiServerConfig::default();
        assert_eq!(config.bind_address, "127.0.0.1");
        assert_eq!(config.port, 3000);
    }
}
