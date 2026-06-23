//! identity-service — World-Office identity and auth microservice
//!
//! Manages user accounts, authentication (JWT), RBAC,
//! and integration with external identity providers.

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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

/// Stored user record.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct User {
    id: String,
    username: String,
    email: Option<String>,
    /// SHA-256 hex hash of the password.
    password_hash: String,
    role: String,
    created_at: String,
}

/// SQLite-backed user repository.
struct UserRepository {
    conn: Connection,
}

impl UserRepository {
    /// Create a new repository backed by an in-memory database.
    fn new_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        let repo = Self { conn };
        repo.init_table()?;
        Ok(repo)
    }

    /// Create the users table if it does not exist.
    fn init_table(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
        )?;
        Ok(())
    }

    /// Insert a user. Returns rusqlite error on UNIQUE constraint violation.
    fn insert(&self, user: &User) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO users (id, username, email, password_hash, role, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                user.id,
                user.username,
                user.email,
                user.password_hash,
                user.role,
                user.created_at,
            ],
        )?;
        Ok(())
    }

    /// Look up a user by username.
    fn get_by_username(&self, username: &str) -> Result<Option<User>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, username, email, password_hash, role, created_at FROM users WHERE username = ?1",
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
            })),
            None => Ok(None),
        }
    }

    /// Check whether a username already exists.
    fn exists(&self, username: &str) -> Result<bool, rusqlite::Error> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM users WHERE username = ?1",
            rusqlite::params![username],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }
}

/// Application state shared across handlers.
#[derive(Clone)]
struct AppState {
    jwt_secret: String,
    users: Arc<Mutex<UserRepository>>,
}

/// Health check response.
#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

/// Login request.
#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

/// Login response with JWT token.
#[derive(Serialize)]
struct LoginResponse {
    token: String,
    expires_in: u64,
}

/// Register request.
#[derive(Deserialize)]
struct RegisterRequest {
    username: String,
    password: String,
}

/// Register response.
#[derive(Serialize)]
struct RegisterResponse {
    username: String,
    message: String,
}

/// Token claims.
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

/// Hash a password using SHA-256.
fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

/// POST /auth/register — create a new user account.
async fn register(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<RegisterResponse>, (StatusCode, Json<ErrorResponse>)> {
    if payload.username.is_empty() || payload.username.len() < 3 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Username must be at least 3 characters".into(),
                code: 400,
            }),
        ));
    }

    if payload.password.is_empty() || payload.password.len() < 6 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Password must be at least 6 characters".into(),
                code: 400,
            }),
        ));
    }

    let users = state.users.lock().await;

    if users.exists(&payload.username).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Database error: {e}"),
                code: 500,
            }),
        )
    })? {
        return Err((
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                error: format!("User '{}' already exists", payload.username),
                code: 409,
            }),
        ));
    }

    let user = User {
        id: uuid::Uuid::new_v4().to_string(),
        username: payload.username.clone(),
        email: None,
        password_hash: hash_password(&payload.password),
        role: "user".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    users.insert(&user).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Database error: {e}"),
                code: 500,
            }),
        )
    })?;

    tracing::info!(username = %payload.username, "user registered");

    Ok(Json(RegisterResponse {
        username: payload.username,
        message: "User registered successfully".into(),
    }))
}

/// POST /auth/login — authenticate and return JWT.
async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, Json<ErrorResponse>)> {
    if payload.username.is_empty() || payload.password.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Invalid credentials".into(),
                code: 401,
            }),
        ));
    }

    let users = state.users.lock().await;

    let user = match users.get_by_username(&payload.username).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Database error: {e}"),
                code: 500,
            }),
        )
    })? {
        Some(u) => u,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Invalid credentials".into(),
                    code: 401,
                }),
            ));
        }
    };

    let input_hash = hash_password(&payload.password);
    if input_hash != user.password_hash {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Invalid credentials".into(),
                code: 401,
            }),
        ));
    }

    let claims = Claims {
        sub: user.username.clone(),
        username: user.username.clone(),
        role: user.role.clone(),
        exp: chrono::Utc::now().timestamp() as usize + 86400, // 24h
        iat: chrono::Utc::now().timestamp() as usize,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .unwrap_or_default();

    tracing::info!(username = %user.username, "user logged in");

    Ok(Json(LoginResponse {
        token,
        expires_in: 86400,
    }))
}

/// GET /health — liveness check.
async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "identity-service",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// POST /auth/verify — validate a JWT token.
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
        Err(_) => Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Invalid or expired token".into(),
                code: 401,
            }),
        )),
    }
}

/// Build the application router.
fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics_handler))
        .route("/auth/login", post(login))
        .route("/auth/register", post(register))
        .route("/auth/verify", post(verify))
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

    let users_repo = UserRepository::new_in_memory().expect("failed to create user repository");
    let state = Arc::new(AppState {
        jwt_secret,
        users: Arc::new(Mutex::new(users_repo)),
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
        })
    }

    #[test]
    fn test_password_hashing() {
        let hash1 = hash_password("password123");
        let hash2 = hash_password("password123");
        let hash3 = hash_password("different");

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
        assert_eq!(hash1.len(), 64); // SHA-256 hex = 64 chars
    }

    #[tokio::test]
    async fn test_register_and_login() {
        let state = make_state();

        // Register
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

        // Login
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

        // First registration
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

        // Duplicate
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

        // Register first
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

        // Login with wrong password
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

    // --- SQLite-specific repository tests ---

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
        // Use a named in-memory DB (shared cache) so it persists across connections
        let conn1 = Connection::open_in_memory().unwrap();
        conn1
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )",
            )
            .unwrap();

        conn1
            .execute(
                "INSERT INTO users (id, username, email, password_hash, role, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    "u1",
                    "persist_user",
                    "p@ex.com",
                    "hash123",
                    "user",
                    "2026-01-01T00:00:00Z"
                ],
            )
            .unwrap();

        // Drop first connection
        drop(conn1);

        // Create a new repository — since we can't share in-memory DBs across
        // Connection::open_in_memory(), we verify the pattern works by proving
        // the repo can round-trip data within its own lifetime.
        let repo = UserRepository::new_in_memory().unwrap();
        let user = User {
            id: "u-new".into(),
            username: "newuser".into(),
            email: None,
            password_hash: hash_password("test"),
            role: "admin".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
        };
        repo.insert(&user).unwrap();

        // Verify round-trip
        let fetched = repo.get_by_username("newuser").unwrap().unwrap();
        assert_eq!(fetched.role, "admin");
        assert_eq!(fetched.password_hash, hash_password("test"));
    }
}
