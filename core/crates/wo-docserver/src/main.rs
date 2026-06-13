// wo-docserver binary entry point.

use std::net::SocketAddr;

use tracing::info;
use wo_docserver::config::DocServerConfig;
use wo_docserver::create_app;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialise tracing with a sensible default subscriber.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "wo_docserver=info,tower_http=debug".into()),
        )
        .init();

    let config = DocServerConfig::from_env();
    let addr: SocketAddr = config.bind_addr().parse().expect("Invalid bind address");

    let app = create_app(config.clone());

    info!("World-Office Document Server listening on {addr}");
    info!("WOPI host: {}", config.wopi_host_url);
    info!(
        "Editor UI dir: {}{}",
        config.editor_ui_dir,
        if std::path::Path::new(&config.editor_ui_dir).exists() {
            " (found)"
        } else {
            " (not found — serving landing page)"
        }
    );

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
