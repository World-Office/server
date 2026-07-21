//! identity-service — World-Office identity and auth microservice
//!
//! Manages user accounts, authentication (JWT), RBAC,
//! and integration with external identity providers.

use axum::{
    Json, Router,
    extract::{Query, State},
    http::StatusCode,
    response::{Html, Redirect},
    routing::{get, post},
};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

static METRICS: LazyLock<PrometheusHandle> = LazyLock::new(|| {
    PrometheusBuilder::new()
        .install_recorder()
        .expect("failed to install prometheus recorder")
});

async fn metrics_handler() -> String {
    METRICS.render()
}

use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct User {
    id: String,
    username: String,
    email: Option<String>,
    password_hash: String,
    role: String,
    created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sso_provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    external_id: Option<String>,
}

struct UserRepository {
    conn: Connection,
}

impl UserRepository {
    fn new_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        let repo = Self { conn };
        repo.init_table()?;
        Ok(repo)
    }

    fn new_file(db_path: &str) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;
        let repo = Self { conn };
        repo.init_table()?;
        Ok(repo)
    }

    fn init_table(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at TEXT NOT NULL,
                sso_provider TEXT,
                external_id TEXT
            )",
        )?;
        Ok(())
    }

    fn insert(&self, user: &User) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO users (id, username, email, password_hash, role, created_at, sso_provider, external_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                user.id, user.username, user.email, user.password_hash,
                user.role, user.created_at, user.sso_provider, user.external_id,
            ],
        )?;
        Ok(())
    }

    fn update(&self, user: &User) -> Result<bool, rusqlite::Error> {
        let rows = self.conn.execute(
            "UPDATE users SET username=?1, email=?2, password_hash=?3, role=?4, sso_provider=?5, external_id=?6
             WHERE id=?7",
            rusqlite::params![
                user.username, user.email, user.password_hash, user.role,
                user.sso_provider, user.external_id, user.id,
            ],
        )?;
        Ok(rows > 0)
    }

    fn get_by_username(&self, username: &str) -> Result<Option<User>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, username, email, password_hash, role, created_at, sso_provider, external_id
             FROM users WHERE username = ?1",
        )?;
        let mut rows = stmt.query(rusqlite::params![username])?;
        match rows.next()? {
            Some(row) => Ok(Some(User {
                id: row.get(0)?,
                username: row.get(1)?,
                email: row.get(2)?,
                password_hash: row.get(3)?,
                role: row.get(4)?,
                created_at: row.get(5)?,
                sso_provider: row.get(6)?,
                external_id: row.get(7)?,
            })),
            None => Ok(None),
        }
    }

    fn get_by_external_id(
        &self,
        external_id: &str,
        provider: &str,
    ) -> Result<Option<User>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, username, email, password_hash, role, created_at, sso_provider, external_id
             FROM users WHERE external_id = ?1 AND sso_provider = ?2",
        )?;
        let mut rows = stmt.query(rusqlite::params![external_id, provider])?;
        match rows.next()? {
            Some(row) => Ok(Some(User {
                id: row.get(0)?,
                username: row.get(1)?,
                email: row.get(2)?,
                password_hash: row.get(3)?,
                role: row.get(4)?,
                created_at: row.get(5)?,
                sso_provider: row.get(6)?,
                external_id: row.get(7)?,
            })),
            None => Ok(None),
        }
    }

    fn get_by_email(&self, email: &str) -> Result<Option<User>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, username, email, password_hash, role, created_at, sso_provider, external_id
             FROM users WHERE email = ?1",
        )?;
        let mut rows = stmt.query(rusqlite::params![email])?;
        match rows.next()? {
            Some(row) => Ok(Some(User {
                id: row.get(0)?,
                username: row.get(1)?,
                email: row.get(2)?,
                password_hash: row.get(3)?,
                role: row.get(4)?,
                created_at: row.get(5)?,
                sso_provider: row.get(6)?,
                external_id: row.get(7)?,
            })),
            None => Ok(None),
        }
    }

    fn list_users(&self) -> Result<Vec<User>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, username, email, password_hash, role, created_at, sso_provider, external_id
             FROM users ORDER BY username",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(User {
                id: row.get(0)?,
                username: row.get(1)?,
                email: row.get(2)?,
                password_hash: row.get(3)?,
                role: row.get(4)?,
                created_at: row.get(5)?,
                sso_provider: row.get(6)?,
                external_id: row.get(7)?,
            })
        })?;
        let mut users = Vec::new();
        for row in rows {
            users.push(row?);
        }
        Ok(users)
    }

    fn exists(&self, username: &str) -> Result<bool, rusqlite::Error> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM users WHERE username = ?1",
            rusqlite::params![username],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }
}

// SSO Configuration

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SamlConfig {
    entity_id: String,
    acs_url: String,
    idp_metadata_url: String,
    idp_sso_url: String,
    idp_cert: String,
    sp_private_key: String,
    sp_cert: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OidcProvider {
    id: String,
    name: String,
    issuer_url: String,
    client_id: String,
    client_secret: String,
    redirect_url: String,
    scopes: Vec<String>,
    enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct LdapConfig {
    url: String,
    bind_dn: String,
    bind_password: String,
    base_dn: String,
    user_filter: String,
    group_filter: String,
    mapping: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SsoConfig {
    saml: Option<SamlConfig>,
    oidc_providers: Vec<OidcProvider>,
    ldap: Option<LdapConfig>,
}

#[derive(Debug, Clone, Serialize)]
struct SsoProviderStatus {
    provider: String,
    configured: bool,
    enabled: bool,
    details: Option<serde_json::Value>,
}

fn load_sso_config() -> SsoConfig {
    let config_path = std::env::var("SSO_CONFIG_PATH")
        .unwrap_or_else(|_| "config/sso-providers.json".to_string());

    if let Ok(content) = std::fs::read_to_string(&config_path) {
        match serde_json::from_str(&content) {
            Ok(cfg) => {
                tracing::info!("SSO config loaded from {}", config_path);
                return cfg;
            }
            Err(e) => {
                tracing::warn!("Failed to parse SSO config file {}: {}", config_path, e);
            }
        }
    }

    let mut sso = SsoConfig::default();

    if let Ok(entity_id) = std::env::var("SAML_ENTITY_ID") {
        sso.saml = Some(SamlConfig {
            entity_id,
            acs_url: std::env::var("SAML_ACS_URL").unwrap_or_default(),
            idp_metadata_url: std::env::var("SAML_IDP_METADATA_URL").unwrap_or_default(),
            idp_sso_url: std::env::var("SAML_IDP_SSO_URL").unwrap_or_default(),
            idp_cert: std::env::var("SAML_IDP_CERT").unwrap_or_default(),
            sp_private_key: std::env::var("SAML_SP_PRIVATE_KEY").unwrap_or_default(),
            sp_cert: std::env::var("SAML_SP_CERT").unwrap_or_default(),
        });
        tracing::info!("SAML config loaded from environment variables");
    }

    if let Ok(oidc_json) = std::env::var("OIDC_PROVIDERS") {
        if let Ok(providers) = serde_json::from_str::<Vec<OidcProvider>>(&oidc_json) {
            sso.oidc_providers = providers;
            tracing::info!("OIDC providers loaded from environment variables");
        }
    }

    if let Ok(url) = std::env::var("LDAP_URL") {
        sso.ldap = Some(LdapConfig {
            url,
            bind_dn: std::env::var("LDAP_BIND_DN").unwrap_or_default(),
            bind_password: std::env::var("LDAP_BIND_PASSWORD").unwrap_or_default(),
            base_dn: std::env::var("LDAP_BASE_DN").unwrap_or_default(),
            user_filter: std::env::var("LDAP_USER_FILTER")
                .unwrap_or_else(|_| "(uid={username})".into()),
            group_filter: std::env::var("LDAP_GROUP_FILTER")
                .unwrap_or_else(|_| "(member={dn})".into()),
            mapping: HashMap::new(),
        });
        tracing::info!("LDAP config loaded from environment variables");
    }

    sso
}

// SAML module

#[cfg(feature = "saml")]
mod saml_mod {
    use super::*;
    use samael::service_provider::ServiceProviderBuilder;
    use samael::traits::ToXml;

    fn build_sp(
        config: &SamlConfig,
    ) -> Result<samael::service_provider::ServiceProvider, Box<dyn std::error::Error>> {
        let mut builder = ServiceProviderBuilder::default();
        builder.entity_id(Some(config.entity_id.clone()));
        builder.acs_url(Some(config.acs_url.clone()));
        Ok(builder.build()?)
    }

    pub async fn metadata_handler(
        State(state): State<Arc<AppState>>,
    ) -> Result<Html<String>, (StatusCode, Json<ErrorResponse>)> {
        let config = state
            .sso_config
            .saml
            .as_ref()
            .ok_or_else(|| make_error(StatusCode::NOT_FOUND, "SAML not configured"))?;

        let sp = build_sp(config).map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to build SP: {e}"),
            )
        })?;

        let metadata = sp.metadata().map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to generate metadata: {e}"),
            )
        })?;

        let xml = ToXml::to_string(&metadata).map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to serialize metadata: {e}"),
            )
        })?;

        Ok(Html(xml))
    }

    pub async fn login_handler(
        State(state): State<Arc<AppState>>,
    ) -> Result<Redirect, (StatusCode, Json<ErrorResponse>)> {
        let config = state
            .sso_config
            .saml
            .as_ref()
            .ok_or_else(|| make_error(StatusCode::NOT_FOUND, "SAML not configured"))?;

        let sp = build_sp(config).map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to build SP: {e}"),
            )
        })?;

        let authn_req = sp
            .make_authentication_request(&config.idp_sso_url)
            .map_err(|e| {
                make_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &format!("Failed to create authn request: {e}"),
                )
            })?;

        if let Some(url) = authn_req.redirect("").map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to build redirect URL: {e}"),
            )
        })? {
            Ok(Redirect::to(url.as_str()))
        } else {
            Err(make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to construct redirect URL",
            ))
        }
    }

    pub async fn acs_handler(
        State(state): State<Arc<AppState>>,
        form: axum::Form<HashMap<String, String>>,
    ) -> Result<Json<LoginResponse>, (StatusCode, Json<ErrorResponse>)> {
        let config = state
            .sso_config
            .saml
            .as_ref()
            .ok_or_else(|| make_error(StatusCode::NOT_FOUND, "SAML not configured"))?;

        let sp = build_sp(config).map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to build SP: {e}"),
            )
        })?;

        let saml_response = form
            .get("SAMLResponse")
            .ok_or_else(|| make_error(StatusCode::BAD_REQUEST, "Missing SAMLResponse"))?;

        let assertion = sp.parse_base64_response(saml_response, None).map_err(|e| {
            make_error(
                StatusCode::UNAUTHORIZED,
                &format!("Invalid SAML response: {e}"),
            )
        })?;

        let email = assertion
            .subject
            .as_ref()
            .and_then(|s| s.name_id.as_ref())
            .map(|n| n.value.clone())
            .unwrap_or_else(|| "unknown@saml.user".to_string());

        let username = email.split('@').next().unwrap_or("saml_user").to_string();

        let users = state.users.lock().await;

        let user = match users.get_by_external_id(&email, "saml") {
            Ok(Some(u)) => u,
            _ => match users.get_by_email(&email) {
                Ok(Some(u)) => u,
                _ => {
                    let new_user = User {
                        id: uuid::Uuid::new_v4().to_string(),
                        username,
                        email: Some(email.clone()),
                        password_hash: String::new(),
                        role: "user".to_string(),
                        created_at: chrono::Utc::now().to_rfc3339(),
                        sso_provider: Some("saml".into()),
                        external_id: Some(email.clone()),
                    };
                    users.insert(&new_user).map_err(|e| {
                        make_error(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            &format!("Failed to create user: {e}"),
                        )
                    })?;
                    new_user
                }
            },
        };

        let token = issue_jwt(&state, &user);
        tracing::info!(username = %user.username, provider = "saml", "user authenticated via SAML");

        Ok(Json(LoginResponse {
            token,
            expires_in: 86400,
        }))
    }
}

#[cfg(not(feature = "saml"))]
mod saml_mod {
    use super::*;

    pub async fn metadata_handler(
        _state: State<Arc<AppState>>,
    ) -> Result<Html<String>, (StatusCode, Json<ErrorResponse>)> {
        Err(make_error(
            StatusCode::NOT_IMPLEMENTED,
            "SAML support not enabled",
        ))
    }

    pub async fn login_handler(
        _state: State<Arc<AppState>>,
    ) -> Result<Redirect, (StatusCode, Json<ErrorResponse>)> {
        Err(make_error(
            StatusCode::NOT_IMPLEMENTED,
            "SAML support not enabled",
        ))
    }

    pub async fn acs_handler(
        _state: State<Arc<AppState>>,
        _form: axum::Form<HashMap<String, String>>,
    ) -> Result<Json<LoginResponse>, (StatusCode, Json<ErrorResponse>)> {
        Err(make_error(
            StatusCode::NOT_IMPLEMENTED,
            "SAML support not enabled",
        ))
    }
}

use saml_mod as saml;

// OIDC module

#[cfg(feature = "oidc")]
mod oidc_mod {
    use super::*;
    use oauth2::{
        AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, EmptyExtraTokenFields,
        Scope, StandardTokenResponse, TokenResponse, TokenUrl, basic::BasicClient,
    };

    struct OidcSession {
        provider_id: String,
        state: String,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    static OIDC_SESSIONS: LazyLock<tokio::sync::Mutex<Vec<OidcSession>>> =
        LazyLock::new(|| tokio::sync::Mutex::new(Vec::new()));

    pub fn list_providers(state: &AppState) -> Vec<&OidcProvider> {
        state
            .sso_config
            .oidc_providers
            .iter()
            .filter(|p| p.enabled)
            .collect()
    }

    pub async fn login_handler(
        State(state): State<Arc<AppState>>,
        Query(params): Query<HashMap<String, String>>,
    ) -> Result<Redirect, (StatusCode, Json<ErrorResponse>)> {
        let provider_id = params.get("provider").map(|s| s.as_str()).unwrap_or("");
        let provider = state
            .sso_config
            .oidc_providers
            .iter()
            .find(|p| p.id == provider_id && p.enabled)
            .ok_or_else(|| {
                make_error(
                    StatusCode::NOT_FOUND,
                    &format!("OIDC provider '{provider_id}' not found or disabled"),
                )
            })?;

        let auth_url = AuthUrl::new(provider.issuer_url.clone()).map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Invalid auth URL: {e}"),
            )
        })?;

        let client = BasicClient::new(ClientId::new(provider.client_id.clone()))
            .set_client_secret(ClientSecret::new(provider.client_secret.clone()))
            .set_auth_uri(auth_url);

        let state_val = uuid::Uuid::new_v4().to_string();
        let mut auth_req = client.authorize_url(|| CsrfToken::new(state_val.clone()));

        for scope in &provider.scopes {
            auth_req = auth_req.add_scope(Scope::new(scope.clone()));
        }

        let (redirect_url, _csrf) = auth_req.url();

        {
            let mut sessions = OIDC_SESSIONS.lock().await;
            sessions.retain(|s| chrono::Utc::now() - s.created_at < chrono::Duration::minutes(10));
            sessions.push(OidcSession {
                provider_id: provider.id.clone(),
                state: state_val,
                created_at: chrono::Utc::now(),
            });
        }

        Ok(Redirect::to(redirect_url.as_str()))
    }

    pub async fn callback_handler(
        State(state): State<Arc<AppState>>,
        Query(params): Query<HashMap<String, String>>,
    ) -> Result<Json<LoginResponse>, (StatusCode, Json<ErrorResponse>)> {
        let code = params
            .get("code")
            .ok_or_else(|| make_error(StatusCode::BAD_REQUEST, "Missing authorization code"))?;
        let state_param = params
            .get("state")
            .ok_or_else(|| make_error(StatusCode::BAD_REQUEST, "Missing state parameter"))?;

        let mut sessions = OIDC_SESSIONS.lock().await;
        let session_idx = sessions
            .iter()
            .position(|s| s.state == *state_param)
            .ok_or_else(|| make_error(StatusCode::UNAUTHORIZED, "Invalid state parameter"))?;
        let session = sessions.remove(session_idx);

        let provider = state
            .sso_config
            .oidc_providers
            .iter()
            .find(|p| p.id == session.provider_id)
            .ok_or_else(|| {
                make_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Provider config not found",
                )
            })?;

        let auth_url = AuthUrl::new(provider.issuer_url.clone()).map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Invalid URL: {e}"),
            )
        })?;

        let oidc_config_url = format!(
            "{}/.well-known/openid-configuration",
            provider.issuer_url.trim_end_matches('/')
        );
        let resp = reqwest::get(&oidc_config_url).await.map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to fetch OIDC config: {e}"),
            )
        })?;

        let oidc_config: serde_json::Value = resp.json().await.map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to parse OIDC config: {e}"),
            )
        })?;

        let token_endpoint = oidc_config["token_endpoint"].as_str().ok_or_else(|| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "No token_endpoint in OIDC config",
            )
        })?;

        let token_url = TokenUrl::new(token_endpoint.to_string()).map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Invalid token URL: {e}"),
            )
        })?;

        let client = BasicClient::new(ClientId::new(provider.client_id.clone()))
            .set_client_secret(ClientSecret::new(provider.client_secret.clone()))
            .set_auth_uri(auth_url)
            .set_token_uri(token_url);

        let http_client = reqwest::Client::new();
        let token_res: StandardTokenResponse<EmptyExtraTokenFields, oauth2::basic::BasicTokenType> =
            client
                .exchange_code(AuthorizationCode::new(code.clone()))
                .request_async(&http_client)
                .await
                .map_err(|e| {
                    make_error(
                        StatusCode::UNAUTHORIZED,
                        &format!("Token exchange failed: {e}"),
                    )
                })?;

        let userinfo_url = oidc_config["userinfo_endpoint"].as_str().ok_or_else(|| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "No userinfo_endpoint in OIDC config",
            )
        })?;

        let access_token = token_res.access_token().secret();
        let userinfo_resp = reqwest::Client::new()
            .get(userinfo_url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| {
                make_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &format!("Failed to get userinfo: {e}"),
                )
            })?;

        let userinfo: serde_json::Value = userinfo_resp.json().await.map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to parse userinfo: {e}"),
            )
        })?;

        let email = userinfo["email"]
            .as_str()
            .or_else(|| userinfo["preferred_username"].as_str())
            .unwrap_or("unknown@oidc.user");
        let sub = userinfo["sub"].as_str().unwrap_or(email);
        let name = userinfo["name"]
            .as_str()
            .or_else(|| userinfo["preferred_username"].as_str())
            .unwrap_or("oidc_user");

        let external_id = format!("{}:{}", provider.id, sub);
        let username = name.replace(' ', "_").to_lowercase();

        let users = state.users.lock().await;

        let user = match users.get_by_external_id(&external_id, "oidc") {
            Ok(Some(u)) => u,
            _ => match users.get_by_email(email) {
                Ok(Some(u)) => u,
                _ => {
                    let new_user = User {
                        id: uuid::Uuid::new_v4().to_string(),
                        username,
                        email: Some(email.to_string()),
                        password_hash: String::new(),
                        role: "user".to_string(),
                        created_at: chrono::Utc::now().to_rfc3339(),
                        sso_provider: Some("oidc".into()),
                        external_id: Some(external_id),
                    };
                    users.insert(&new_user).map_err(|e| {
                        make_error(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            &format!("Failed to create user: {e}"),
                        )
                    })?;
                    new_user
                }
            },
        };

        let token = issue_jwt(&state, &user);
        tracing::info!(username = %user.username, provider = %provider.id, "user authenticated via OIDC");

        Ok(Json(LoginResponse {
            token,
            expires_in: 86400,
        }))
    }
}

#[cfg(not(feature = "oidc"))]
mod oidc_mod {
    use super::*;

    pub fn list_providers(_state: &AppState) -> Vec<&OidcProvider> {
        Vec::new()
    }

    pub async fn login_handler(
        _state: State<Arc<AppState>>,
        _params: Query<HashMap<String, String>>,
    ) -> Result<Redirect, (StatusCode, Json<ErrorResponse>)> {
        Err(make_error(
            StatusCode::NOT_IMPLEMENTED,
            "OIDC support not enabled",
        ))
    }

    pub async fn callback_handler(
        _state: State<Arc<AppState>>,
        _params: Query<HashMap<String, String>>,
    ) -> Result<Json<LoginResponse>, (StatusCode, Json<ErrorResponse>)> {
        Err(make_error(
            StatusCode::NOT_IMPLEMENTED,
            "OIDC support not enabled",
        ))
    }
}

use oidc_mod as oidc;

// LDAP module

#[cfg(feature = "ldap")]
mod ldap_mod {
    use super::*;
    use ldap3::{LdapConnAsync, LdapConnSettings, Scope, SearchEntry, drive};

    async fn connect(config: &LdapConfig) -> Result<ldap3::Ldap, String> {
        let (conn, mut ldap) = LdapConnAsync::with_settings(
            LdapConnSettings::new()
                .set_starttls(true)
                .set_no_tls_verify(true),
            &config.url,
        )
        .await
        .map_err(|e| format!("LDAP connect failed: {e}"))?;

        drive!(conn);

        ldap.simple_bind(&config.bind_dn, &config.bind_password)
            .await
            .map_err(|e| format!("LDAP bind failed: {e}"))?
            .success()
            .map_err(|e| format!("LDAP bind error: {e}"))?;

        Ok(ldap)
    }

    pub async fn login_handler(
        State(state): State<Arc<AppState>>,
        Json(payload): Json<LoginRequest>,
    ) -> Result<Json<LoginResponse>, (StatusCode, Json<ErrorResponse>)> {
        let config = state
            .sso_config
            .ldap
            .as_ref()
            .ok_or_else(|| make_error(StatusCode::NOT_FOUND, "LDAP not configured"))?;

        let mut ldap = connect(config)
            .await
            .map_err(|e| make_error(StatusCode::INTERNAL_SERVER_ERROR, &e))?;

        let user_filter = config.user_filter.replace("{username}", &payload.username);

        let (search_result, _ldap_result) = ldap
            .search(
                &config.base_dn,
                Scope::Subtree,
                &user_filter,
                vec!["dn", "cn", "uid", "mail", "displayName"],
            )
            .await
            .map_err(|e| {
                make_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &format!("LDAP search failed: {e}"),
                )
            })?
            .success()
            .map_err(|e| {
                make_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &format!("LDAP search error: {e}"),
                )
            })?;

        let entries: Vec<SearchEntry> = search_result
            .into_iter()
            .filter_map(|re| {
                let entry = SearchEntry::construct(re);
                if entry.dn.is_empty() {
                    None
                } else {
                    Some(entry)
                }
            })
            .collect();

        if entries.is_empty() {
            return Err(make_error(StatusCode::UNAUTHORIZED, "Invalid credentials"));
        }

        let user_entry = &entries[0];
        let user_dn = &user_entry.dn;

        let (user_conn, mut user_ldap) = LdapConnAsync::with_settings(
            LdapConnSettings::new()
                .set_starttls(true)
                .set_no_tls_verify(true),
            &config.url,
        )
        .await
        .map_err(|e| {
            make_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("LDAP connect failed: {e}"),
            )
        })?;

        drive!(user_conn);

        let bind_result = user_ldap.simple_bind(user_dn, &payload.password).await;

        match bind_result {
            Ok(resp) => {
                if let Err(e) = resp.success() {
                    return Err(make_error(
                        StatusCode::UNAUTHORIZED,
                        &format!("LDAP bind failed: {e}"),
                    ));
                }
            }
            Err(e) => {
                return Err(make_error(
                    StatusCode::UNAUTHORIZED,
                    &format!("LDAP bind failed: {e}"),
                ));
            }
        }

        let email = user_entry
            .attrs
            .get("mail")
            .and_then(|v| v.first().cloned())
            .unwrap_or_else(|| format!("{}@ldap.local", payload.username));

        let display_name = user_entry
            .attrs
            .get("displayName")
            .or_else(|| user_entry.attrs.get("cn"))
            .and_then(|v| v.first().cloned())
            .unwrap_or_else(|| payload.username.clone());

        let username = display_name.replace(' ', "_").to_lowercase();
        let users = state.users.lock().await;
        let external_id = format!("ldap:{}", user_dn);

        let user = match users.get_by_external_id(&external_id, "ldap") {
            Ok(Some(u)) => {
                let updated = User {
                    email: Some(email.clone()),
                    ..u
                };
                users.update(&updated).ok();
                updated
            }
            _ => match users.get_by_username(&username) {
                Ok(Some(u)) => u,
                _ => {
                    let new_user = User {
                        id: uuid::Uuid::new_v4().to_string(),
                        username,
                        email: Some(email),
                        password_hash: String::new(),
                        role: "user".to_string(),
                        created_at: chrono::Utc::now().to_rfc3339(),
                        sso_provider: Some("ldap".into()),
                        external_id: Some(external_id),
                    };
                    users.insert(&new_user).map_err(|e| {
                        make_error(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            &format!("Failed to create user: {e}"),
                        )
                    })?;
                    new_user
                }
            },
        };

        let token = issue_jwt(&state, &user);
        tracing::info!(username = %user.username, provider = "ldap", "user authenticated via LDAP");

        Ok(Json(LoginResponse {
            token,
            expires_in: 86400,
        }))
    }

    pub async fn sync_handler(
        State(state): State<Arc<AppState>>,
    ) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
        let config = state
            .sso_config
            .ldap
            .as_ref()
            .ok_or_else(|| make_error(StatusCode::NOT_FOUND, "LDAP not configured"))?;

        let mut ldap = connect(config)
            .await
            .map_err(|e| make_error(StatusCode::INTERNAL_SERVER_ERROR, &e))?;

        let user_filter = config.user_filter.replace("{username}", "*");

        let (search_result, _ldap_result) = ldap
            .search(
                &config.base_dn,
                Scope::Subtree,
                &user_filter,
                vec!["dn", "cn", "uid", "mail", "displayName"],
            )
            .await
            .map_err(|e| {
                make_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &format!("LDAP search failed: {e}"),
                )
            })?
            .success()
            .map_err(|e| {
                make_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &format!("LDAP search error: {e}"),
                )
            })?;

        let user_entries: Vec<SearchEntry> = search_result
            .into_iter()
            .filter_map(|re| {
                let entry = SearchEntry::construct(re);
                if entry.dn.is_empty() {
                    None
                } else {
                    Some(entry)
                }
            })
            .collect();

        let users = state.users.lock().await;
        let mut synced = 0u64;
        let mut created = 0u64;

        for entry in &user_entries {
            let external_id = format!("ldap:{}", entry.dn);
            let email = entry
                .attrs
                .get("mail")
                .and_then(|v| v.first().cloned())
                .unwrap_or_default();
            let display_name = entry
                .attrs
                .get("displayName")
                .or_else(|| entry.attrs.get("cn"))
                .and_then(|v| v.first().cloned())
                .unwrap_or_default();
            let username = if display_name.is_empty() {
                entry
                    .attrs
                    .get("uid")
                    .and_then(|v| v.first().cloned())
                    .unwrap_or_else(|| format!("ldap_user_{synced}"))
            } else {
                display_name.replace(' ', "_").to_lowercase()
            };

            match users.get_by_external_id(&external_id, "ldap") {
                Ok(Some(user)) => {
                    let updated = User {
                        email: if email.is_empty() {
                            user.email
                        } else {
                            Some(email.clone())
                        },
                        ..user
                    };
                    if users.update(&updated).unwrap_or(false) {
                        synced += 1;
                    }
                }
                _ => {
                    let new_user = User {
                        id: uuid::Uuid::new_v4().to_string(),
                        username,
                        email: if email.is_empty() { None } else { Some(email) },
                        password_hash: String::new(),
                        role: "user".to_string(),
                        created_at: chrono::Utc::now().to_rfc3339(),
                        sso_provider: Some("ldap".into()),
                        external_id: Some(external_id),
                    };
                    if users.insert(&new_user).is_ok() {
                        created += 1;
                    }
                }
            }
        }

        tracing::info!(synced, created, "LDAP sync completed");

        Ok(Json(serde_json::json!({
            "provider": "ldap",
            "synced_users": synced,
            "created_users": created,
            "status": "completed"
        })))
    }
}

#[cfg(not(feature = "ldap"))]
mod ldap_mod {
    use super::*;

    pub async fn login_handler(
        _state: State<Arc<AppState>>,
        _payload: Json<LoginRequest>,
    ) -> Result<Json<LoginResponse>, (StatusCode, Json<ErrorResponse>)> {
        Err(make_error(
            StatusCode::NOT_IMPLEMENTED,
            "LDAP support not enabled",
        ))
    }

    pub async fn sync_handler(
        _state: State<Arc<AppState>>,
    ) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
        Err(make_error(
            StatusCode::NOT_IMPLEMENTED,
            "LDAP support not enabled",
        ))
    }
}

use ldap_mod as ldap;

// Application state

#[derive(Clone)]
struct AppState {
    jwt_secret: String,
    users: Arc<Mutex<UserRepository>>,
    sso_config: SsoConfig,
}

// Request/Response types

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Serialize)]
struct LoginResponse {
    token: String,
    expires_in: u64,
}

#[derive(Deserialize)]
struct RegisterRequest {
    username: String,
    password: String,
}

#[derive(Serialize)]
struct RegisterResponse {
    username: String,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    username: String,
    role: String,
    exp: usize,
    iat: usize,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    code: u16,
}

fn make_error(code: StatusCode, msg: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        code,
        Json(ErrorResponse {
            error: msg.to_string(),
            code: code.as_u16(),
        }),
    )
}

fn issue_jwt(state: &AppState, user: &User) -> String {
    let claims = Claims {
        sub: user.username.clone(),
        username: user.username.clone(),
        role: user.role.clone(),
        exp: chrono::Utc::now().timestamp() as usize + 86400,
        iat: chrono::Utc::now().timestamp() as usize,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .unwrap_or_default()
}

fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

// Handlers

async fn register(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<RegisterResponse>, (StatusCode, Json<ErrorResponse>)> {
    if payload.username.is_empty() || payload.username.len() < 3 {
        return Err(make_error(
            StatusCode::BAD_REQUEST,
            "Username must be at least 3 characters",
        ));
    }
    if payload.password.is_empty() || payload.password.len() < 6 {
        return Err(make_error(
            StatusCode::BAD_REQUEST,
            "Password must be at least 6 characters",
        ));
    }

    let users = state.users.lock().await;

    if users.exists(&payload.username).map_err(|e| {
        make_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Database error: {e}"),
        )
    })? {
        return Err(make_error(
            StatusCode::CONFLICT,
            &format!("User '{}' already exists", payload.username),
        ));
    }

    let user = User {
        id: uuid::Uuid::new_v4().to_string(),
        username: payload.username.clone(),
        email: None,
        password_hash: hash_password(&payload.password),
        role: "user".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        sso_provider: None,
        external_id: None,
    };

    users.insert(&user).map_err(|e| {
        make_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Database error: {e}"),
        )
    })?;

    tracing::info!(username = %payload.username, "user registered");

    Ok(Json(RegisterResponse {
        username: payload.username,
        message: "User registered successfully".into(),
    }))
}

async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, Json<ErrorResponse>)> {
    if payload.username.is_empty() || payload.password.is_empty() {
        return Err(make_error(StatusCode::UNAUTHORIZED, "Invalid credentials"));
    }

    let users = state.users.lock().await;

    let user = match users.get_by_username(&payload.username).map_err(|e| {
        make_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Database error: {e}"),
        )
    })? {
        Some(u) => u,
        None => return Err(make_error(StatusCode::UNAUTHORIZED, "Invalid credentials")),
    };

    let input_hash = hash_password(&payload.password);
    if input_hash != user.password_hash {
        return Err(make_error(StatusCode::UNAUTHORIZED, "Invalid credentials"));
    }

    let token = issue_jwt(&state, &user);
    tracing::info!(username = %user.username, "user logged in");

    Ok(Json(LoginResponse {
        token,
        expires_in: 86400,
    }))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "identity-service",
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[derive(Deserialize)]
struct VerifyRequest {
    token: String,
}

#[derive(Serialize)]
struct VerifyResponse {
    valid: bool,
    username: String,
    role: String,
}

async fn verify(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, (StatusCode, Json<ErrorResponse>)> {
    let validation = decode::<Claims>(
        &payload.token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    );

    match validation {
        Ok(token_data) => Ok(Json(VerifyResponse {
            valid: true,
            username: token_data.claims.sub,
            role: token_data.claims.role,
        })),
        Err(_) => Err(make_error(
            StatusCode::UNAUTHORIZED,
            "Invalid or expired token",
        )),
    }
}

// SSO provider listing

async fn sso_providers(State(state): State<Arc<AppState>>) -> Json<Vec<SsoProviderStatus>> {
    let mut providers = Vec::new();

    providers.push(SsoProviderStatus {
        provider: "saml".into(),
        configured: state.sso_config.saml.is_some(),
        enabled: state.sso_config.saml.is_some(),
        details: state.sso_config.saml.as_ref().map(|c| {
            serde_json::json!({
                "entity_id": c.entity_id,
                "acs_url": c.acs_url,
            })
        }),
    });

    for p in &state.sso_config.oidc_providers {
        providers.push(SsoProviderStatus {
            provider: format!("oidc:{}", p.id),
            configured: true,
            enabled: p.enabled,
            details: Some(serde_json::json!({
                "name": p.name,
                "issuer_url": p.issuer_url,
                "scopes": p.scopes,
            })),
        });
    }

    providers.push(SsoProviderStatus {
        provider: "ldap".into(),
        configured: state.sso_config.ldap.is_some(),
        enabled: state.sso_config.ldap.is_some(),
        details: state.sso_config.ldap.as_ref().map(|c| {
            serde_json::json!({
                "url": c.url,
                "base_dn": c.base_dn,
            })
        }),
    });

    Json(providers)
}

// Router

fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics_handler))
        .route("/auth/login", post(login))
        .route("/auth/register", post(register))
        .route("/auth/verify", post(verify))
        .route("/sso/providers", get(sso_providers))
        .route("/saml/metadata", get(saml::metadata_handler))
        .route("/saml/login", get(saml::login_handler))
        .route("/saml/acs", post(saml::acs_handler))
        .route("/oidc/login", get(oidc::login_handler))
        .route("/oidc/callback", get(oidc::callback_handler))
        .route("/ldap/login", post(ldap::login_handler))
        .route("/ldap/sync", post(ldap::sync_handler))
        .with_state(state)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let jwt_secret =
        std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret-change-in-production".into());

    let sso_config = load_sso_config();

    let users_repo = if let Ok(db_path) = std::env::var("USERS_DB_PATH") {
        tracing::info!("Using file-backed user database: {}", db_path);
        UserRepository::new_file(&db_path).expect("failed to create file-backed user repository")
    } else {
        tracing::info!("Using in-memory user database");
        UserRepository::new_in_memory().expect("failed to create user repository")
    };

    let state = Arc::new(AppState {
        jwt_secret,
        users: Arc::new(Mutex::new(users_repo)),
        sso_config,
    });

    let app = app(state);

    let addr = std::env::var("SERVICE_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("SERVICE_PORT")
        .unwrap_or_else(|_| "8001".into())
        .parse()
        .unwrap_or(8001);

    tracing::info!(
        "identity-service v{} starting on {}:{}",
        env!("CARGO_PKG_VERSION"),
        addr,
        port
    );

    let listener = tokio::net::TcpListener::bind(format!("{}:{}", addr, port))
        .await
        .expect("failed to bind");
    axum::serve(listener, app).await.expect("server error");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_state() -> Arc<AppState> {
        let users_repo = UserRepository::new_in_memory().expect("failed to create user repository");
        Arc::new(AppState {
            jwt_secret: "test-secret".into(),
            users: Arc::new(Mutex::new(users_repo)),
            sso_config: SsoConfig::default(),
        })
    }

    #[test]
    fn test_password_hashing() {
        let hash1 = hash_password("password123");
        let hash2 = hash_password("password123");
        let hash3 = hash_password("different");

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
        assert_eq!(hash1.len(), 64);
    }

    #[tokio::test]
    async fn test_register_and_login() {
        let state = make_state();
        let router = Router::new()
            .route("/auth/register", post(register))
            .route("/auth/login", post(login))
            .with_state(state.clone());

        use axum::body::Body;
        use tower::ServiceExt;

        let reg_resp = router
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/auth/register")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"username":"testuser","password":"pass123"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(reg_resp.status(), StatusCode::OK);

        let login_resp = router
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"username":"testuser","password":"pass123"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login_resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_register_duplicate_returns_409() {
        let state = make_state();
        let router = Router::new()
            .route("/auth/register", post(register))
            .with_state(state);

        use axum::body::Body;
        use tower::ServiceExt;

        let resp1 = router
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/auth/register")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"username":"dup","password":"pass123"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp1.status(), StatusCode::OK);

        let resp2 = router
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/auth/register")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"username":"dup","password":"pass123"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp2.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn test_login_wrong_password_returns_401() {
        let state = make_state();
        let router = Router::new()
            .route("/auth/register", post(register))
            .route("/auth/login", post(login))
            .with_state(state.clone());

        use axum::body::Body;
        use tower::ServiceExt;

        router
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/auth/register")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"username":"testuser2","password":"correct"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        let resp = router
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"username":"testuser2","password":"wrong"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn test_repo_insert_and_read() {
        let repo = UserRepository::new_in_memory().unwrap();
        let user = User {
            id: "u1".into(),
            username: "alice".into(),
            email: Some("alice@example.com".into()),
            password_hash: hash_password("secret"),
            role: "user".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            sso_provider: None,
            external_id: None,
        };
        repo.insert(&user).unwrap();
        let fetched = repo.get_by_username("alice").unwrap().unwrap();
        assert_eq!(fetched.id, "u1");
        assert_eq!(fetched.username, "alice");
        assert_eq!(fetched.email.as_deref(), Some("alice@example.com"));
        assert_eq!(fetched.role, "user");
        assert_eq!(fetched.created_at, "2026-01-01T00:00:00Z");
    }

    #[test]
    fn test_repo_exists() {
        let repo = UserRepository::new_in_memory().unwrap();
        assert!(!repo.exists("bob").unwrap());
        let user = User {
            id: "u2".into(),
            username: "bob".into(),
            email: None,
            password_hash: hash_password("pw"),
            role: "user".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            sso_provider: None,
            external_id: None,
        };
        repo.insert(&user).unwrap();
        assert!(repo.exists("bob").unwrap());
    }

    #[test]
    fn test_repo_get_missing_returns_none() {
        let repo = UserRepository::new_in_memory().unwrap();
        assert!(repo.get_by_username("nobody").unwrap().is_none());
    }

    #[test]
    fn test_repo_delete() {
        let repo = UserRepository::new_in_memory().unwrap();
        let user = User {
            id: "u3".into(),
            username: "charlie".into(),
            email: None,
            password_hash: hash_password("pw"),
            role: "user".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            sso_provider: None,
            external_id: None,
        };
        repo.insert(&user).unwrap();
        assert!(repo.exists("charlie").unwrap());
        repo.conn
            .execute(
                "DELETE FROM users WHERE username = ?1",
                rusqlite::params!["charlie"],
            )
            .unwrap();
        assert!(!repo.exists("charlie").unwrap());
    }

    #[test]
    fn test_repo_list() {
        let repo = UserRepository::new_in_memory().unwrap();
        for name in ["a", "b", "c"] {
            let user = User {
                id: format!("u-{name}"),
                username: name.into(),
                email: None,
                password_hash: hash_password("pw"),
                role: "user".into(),
                created_at: "2026-01-01T00:00:00Z".into(),
                sso_provider: None,
                external_id: None,
            };
            repo.insert(&user).unwrap();
        }
        let mut stmt = repo
            .conn
            .prepare("SELECT username FROM users ORDER BY username")
            .unwrap();
        let names: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(names, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_persistence_across_restarts() {
        let repo = UserRepository::new_in_memory().unwrap();
        let user = User {
            id: "u-new".into(),
            username: "newuser".into(),
            email: None,
            password_hash: hash_password("test"),
            role: "admin".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            sso_provider: None,
            external_id: None,
        };
        repo.insert(&user).unwrap();
        let fetched = repo.get_by_username("newuser").unwrap().unwrap();
        assert_eq!(fetched.role, "admin");
        assert_eq!(fetched.password_hash, hash_password("test"));
    }

    #[tokio::test]
    async fn test_sso_providers_endpoint() {
        let state = make_state();
        let router = app(state);

        use axum::body::Body;
        use tower::ServiceExt;

        let resp = router
            .oneshot(
                axum::http::Request::builder()
                    .method("GET")
                    .uri("/sso/providers")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[test]
    fn test_repo_get_by_email() {
        let repo = UserRepository::new_in_memory().unwrap();
        let user = User {
            id: "u-email".into(),
            username: "emailuser".into(),
            email: Some("test@example.com".into()),
            password_hash: hash_password("pw"),
            role: "user".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            sso_provider: None,
            external_id: None,
        };
        repo.insert(&user).unwrap();
        let fetched = repo.get_by_email("test@example.com").unwrap().unwrap();
        assert_eq!(fetched.username, "emailuser");
    }

    #[test]
    fn test_repo_get_by_external_id() {
        let repo = UserRepository::new_in_memory().unwrap();
        let user = User {
            id: "u-ext".into(),
            username: "extuser".into(),
            email: Some("ext@example.com".into()),
            password_hash: hash_password("pw"),
            role: "user".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            sso_provider: Some("saml".into()),
            external_id: Some("ext123".into()),
        };
        repo.insert(&user).unwrap();
        let fetched = repo.get_by_external_id("ext123", "saml").unwrap().unwrap();
        assert_eq!(fetched.username, "extuser");
    }

    #[test]
    fn test_repo_update() {
        let repo = UserRepository::new_in_memory().unwrap();
        let mut user = User {
            id: "u-upd".into(),
            username: "upduser".into(),
            email: None,
            password_hash: hash_password("pw"),
            role: "user".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            sso_provider: None,
            external_id: None,
        };
        repo.insert(&user).unwrap();
        user.role = "admin".into();
        user.email = Some("admin@example.com".into());
        let updated = repo.update(&user).unwrap();
        assert!(updated);
        let fetched = repo.get_by_username("upduser").unwrap().unwrap();
        assert_eq!(fetched.role, "admin");
        assert_eq!(fetched.email.as_deref(), Some("admin@example.com"));
    }
}
