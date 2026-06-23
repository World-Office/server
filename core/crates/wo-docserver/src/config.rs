// wo-docserver configuration — loaded from environment variables.

use std::env;

/// Document server configuration.
#[derive(Debug, Clone)]
pub struct DocServerConfig {
    /// Bind host (env: DOCSERVER_HOST, default: "0.0.0.0").
    pub host: String,
    /// Bind port (env: DOCSERVER_PORT, default: 80).
    pub port: u16,
    /// JWT secret for token validation (env: JWT_SECRET, required).
    pub jwt_secret: String,
    /// WOPI host URL to proxy requests to (env: WOPI_HOST_URL, default: "http://ocis:9200").
    pub wopi_host_url: String,
    /// Directory containing the React editor UI build (env: EDITOR_UI_DIR, default: "./editor-ui").
    pub editor_ui_dir: String,
    /// Local data directory (env: DOCSERVER_DATA_DIR, default: "./data").
    pub data_dir: String,
}

impl DocServerConfig {
    /// Load configuration from environment variables.
    ///
    /// Panics if `JWT_SECRET` is not set.
    pub fn from_env() -> Self {
        Self {
            host: env::var("DOCSERVER_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: env::var("DOCSERVER_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(80),
            jwt_secret: env::var("JWT_SECRET")
                .expect("JWT_SECRET environment variable is required"),
            wopi_host_url: env::var("WOPI_HOST")
                .or_else(|_| env::var("WOPI_HOST_URL"))
                .unwrap_or_else(|_| "http://ocis:9200".into()),
            editor_ui_dir: env::var("EDITOR_UI_DIR").unwrap_or_else(|_| "./editor-ui".into()),
            data_dir: env::var("DOCSERVER_DATA_DIR").unwrap_or_else(|_| "./data".into()),
        }
    }

    /// Returns the full bind address string (e.g. "0.0.0.0:80").
    pub fn bind_addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_from_env_defaults() {
        env::set_var("DOCSERVER_PORT", "80");
        env::remove_var("PORT");
        env::set_var("JWT_SECRET", "test-secret-for-unit-tests");
        let config = DocServerConfig::from_env();
        assert_eq!(config.host, "0.0.0.0");
        assert_eq!(config.port, 80);
        assert_eq!(config.jwt_secret, "test-secret-for-unit-tests");
        assert_eq!(config.wopi_host_url, "http://ocis:9200");
        assert_eq!(config.editor_ui_dir, "./editor-ui");
        assert_eq!(config.data_dir, "./data");
        assert_eq!(config.bind_addr(), "0.0.0.0:80");
    }

    #[test]
    fn test_config_custom_port() {
        env::set_var("JWT_SECRET", "test-secret");
        env::set_var("DOCSERVER_PORT", "9090");
        let config = DocServerConfig::from_env();
        assert_eq!(config.port, 9090);
        assert_eq!(config.bind_addr(), "0.0.0.0:9090");
        // Clean up
        env::remove_var("DOCSERVER_PORT");
    }

    #[test]
    #[should_panic(expected = "JWT_SECRET environment variable is required")]
    fn test_config_missing_jwt_secret() {
        env::remove_var("JWT_SECRET");
        let _ = DocServerConfig::from_env();
    }
}
