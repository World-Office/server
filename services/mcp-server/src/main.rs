pub mod client;
pub mod snapshots;
pub mod tools;

use rmcp::ServiceExt;
use rmcp::transport::stdio;
use tools::McpTools;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let storage_url = std::env::var("STORAGE_SERVICE_URL")
        .unwrap_or_else(|_| "http://localhost:8002".to_string());

    let client = client::StorageClient::new(storage_url);
    let mcp_tools = McpTools::new(client);

    tracing::info!("Starting World Office MCP server");

    let service = mcp_tools.serve(stdio()).await?;
    service.waiting().await?;

    Ok(())
}
