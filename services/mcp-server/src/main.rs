pub mod client;
pub mod snapshots;
pub mod tools;

use rmcp::ServiceExt;
use rmcp::transport::stdio;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use std::sync::Arc;
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

        // rmcp 3: non-exhaustive config — start from defaults (legacy sessions on,
        // loopback-only host allowlist) then widen hosts from env.
        let allowed_hosts: Vec<String> = std::env::var("MCP_ALLOWED_HOSTS")
            .map(|v| {
                v.split(',')
                    .map(str::trim)
                    .filter(|h| !h.is_empty())
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default();
        let config = if allowed_hosts.is_empty() {
            StreamableHttpServerConfig::default().disable_allowed_hosts()
        } else {
            StreamableHttpServerConfig::default().with_allowed_hosts(allowed_hosts)
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
