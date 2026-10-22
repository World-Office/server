pub mod client;
pub mod snapshots;
pub mod tools;

use rmcp::ServiceExt;
use rmcp::transport::stdio;
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService,
};
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use tools::McpTools;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let storage_url = std::env::var("STORAGE_SERVICE_URL")
        .unwrap_or_else(|_| "http://localhost:8002".to_string());

    // MCP_HTTP_PORT env var enables HTTP/SSE transport (streamable HTTP).
    // Without it, the server uses stdio (default).
    let http_port = std::env::var("MCP_HTTP_PORT").ok();

    if let Some(port_str) = http_port {
        let port: u16 = port_str.parse().unwrap_or(3100);
        tracing::info!("Starting World Office MCP server (HTTP/SSE on port {port})");

        let config = StreamableHttpServerConfig {
            sse_keep_alive: Some(std::time::Duration::from_secs(15)),
            sse_retry: Some(std::time::Duration::from_secs(3)),
            stateful_mode: true,
            cancellation_token: CancellationToken::new(),
        };
        let session_manager = Arc::new(LocalSessionManager::default());
        let service: StreamableHttpService<McpTools, LocalSessionManager> =
            StreamableHttpService::new(
                || {
                    let url = std::env::var("STORAGE_SERVICE_URL")
                        .unwrap_or_else(|_| "http://localhost:8002".to_string());
                    Ok(McpTools::new(client::StorageClient::new(url)))
                },
                session_manager,
                config,
            );

        let router = axum::Router::new().nest_service("/mcp", service);
        let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
        tracing::info!("MCP HTTP server listening on 0.0.0.0:{port}");
        axum::serve(listener, router).await?;
    } else {
        tracing::info!("Starting World Office MCP server (stdio)");
        let client = client::StorageClient::new(storage_url);
        let mcp_tools = McpTools::new(client);
        let service = mcp_tools.serve(stdio()).await?;
        service.waiting().await?;
    }

    Ok(())
}
