//! conversion-service — World-Office document conversion microservice.
//!
//! Handles format-to-format conversion requests via the wo-x2t core engine.
//! Accepts file content as base64, performs real conversion, returns result.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use chrono::Utc;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;
pub use wo_x2t::ConversionRouter;

/// Conversion job status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Completed,
    Failed,
}

/// A conversion job tracked in SQLite.
#[derive(Debug, Clone, Serialize)]
pub struct ConversionJob {
    pub id: String,
    pub input_format: String,
    pub output_format: String,
    pub status: JobStatus,
    pub created_at: String,
    pub completed_at: String,
    pub error: Option<String>,
    /// Base64-encoded converted output data.
    pub output_data: Option<String>,
    pub output_size: Option<usize>,
    pub duration_ms: Option<u64>,
}

/// SQLite-backed job repository.
pub struct JobRepository {
    conn: Connection,
}

impl JobRepository {
    /// Create a new repository with an in-memory database.
    pub fn new_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        let repo = Self { conn };
        repo.init_table()?;
        Ok(repo)
    }

    /// Create a new repository backed by a file.
    pub fn new(path: &str) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        let repo = Self { conn };
        repo.init_table()?;
        Ok(repo)
    }

    fn init_table(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS conversion_jobs (
                id TEXT PRIMARY KEY,
                source_format TEXT NOT NULL,
                target_format TEXT NOT NULL,
                status TEXT NOT NULL,
                input_size INTEGER,
                output_size INTEGER,
                created_at TEXT NOT NULL,
                completed_at TEXT,
                error TEXT
            )",
        )?;
        Ok(())
    }

    /// Insert a completed job. `input_size` is the decoded input byte count.
    pub fn insert(
        &mut self,
        job: &ConversionJob,
        input_size: usize,
    ) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO conversion_jobs (id, source_format, target_format, status, input_size, output_size, created_at, completed_at, error)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                job.id,
                job.input_format,
                job.output_format,
                serde_json::to_string(&job.status).unwrap_or_default(),
                input_size as i64,
                job.output_size.map(|s| s as i64),
                job.created_at,
                job.completed_at,
                job.error,
            ],
        )?;
        Ok(())
    }

    /// Get a job by ID.
    pub fn get(&self, id: &str) -> Result<Option<ConversionJob>, rusqlite::Error> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, source_format, target_format, status, input_size, output_size, created_at, completed_at, error FROM conversion_jobs WHERE id = ?1")?;
        let mut rows = stmt.query(params![id])?;

        match rows.next()? {
            Some(row) => Ok(Some(row_to_job(row)?)),
            None => Ok(None),
        }
    }

    /// List all jobs.
    pub fn list(&self) -> Result<Vec<ConversionJob>, rusqlite::Error> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, source_format, target_format, status, input_size, output_size, created_at, completed_at, error FROM conversion_jobs")?;
        let rows = stmt.query_map([], row_to_job)?;
        let mut jobs = Vec::new();
        for row in rows {
            jobs.push(row?);
        }
        Ok(jobs)
    }

    /// Delete a job by ID. Returns true if a row was deleted.
    pub fn delete(&mut self, id: &str) -> Result<bool, rusqlite::Error> {
        let affected = self
            .conn
            .execute("DELETE FROM conversion_jobs WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }
}

fn row_to_job(row: &rusqlite::Row<'_>) -> Result<ConversionJob, rusqlite::Error> {
    let status_str: String = row.get(3)?;
    let status = serde_json::from_str(&status_str).unwrap_or(JobStatus::Failed);
    Ok(ConversionJob {
        id: row.get(0)?,
        input_format: row.get(1)?,
        output_format: row.get(2)?,
        status,
        created_at: row.get(6)?,
        completed_at: row.get(7)?,
        error: row.get(8)?,
        output_data: None,
        output_size: row.get::<_, Option<i64>>(5)?.map(|s| s as usize),
        duration_ms: None,
    })
}

/// Application state shared across handlers.
#[derive(Clone)]
pub struct AppState {
    pub jobs: Arc<Mutex<JobRepository>>,
    pub router: Arc<ConversionRouter>,
}

/// Health check response.
#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub version: &'static str,
}

/// Conversion request.
#[derive(Deserialize)]
pub struct ConvertRequest {
    pub input_format: String,
    pub output_format: String,
    /// Base64-encoded file content.
    pub data: String,
}

/// Conversion response.
#[derive(Serialize)]
pub struct ConvertResponse {
    pub job: ConversionJob,
}

/// Job status response.
#[derive(Serialize)]
pub struct JobStatusResponse {
    pub job: ConversionJob,
}

/// Error response.
#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: u16,
}

/// Supported format pair.
#[derive(Serialize)]
pub struct FormatPair {
    pub source: String,
    pub target: String,
}

/// Create a fresh AppState for testing (in-memory SQLite).
pub fn create_test_state() -> Arc<AppState> {
    Arc::new(AppState {
        jobs: Arc::new(Mutex::new(
            JobRepository::new_in_memory().expect("in-memory db"),
        )),
        router: Arc::new(ConversionRouter::new()),
    })
}

/// POST /convert — submit a conversion and get result synchronously.
pub async fn submit_conversion(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ConvertRequest>,
) -> Result<Json<ConvertResponse>, (StatusCode, Json<ErrorResponse>)> {
    if payload.input_format.is_empty() || payload.output_format.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "input_format and output_format are required".into(),
                code: 400,
            }),
        ));
    }

    if payload.data.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "data (base64-encoded file content) is required".into(),
                code: 400,
            }),
        ));
    }

    // Decode base64 data
    let file_data =
        match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &payload.data) {
            Ok(data) => data,
            Err(e) => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: format!("Invalid base64 data: {}", e),
                        code: 400,
                    }),
                ));
            }
        };

    let job_id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    let input_size = file_data.len();

    // Perform actual conversion via wo-x2t
    let result = state
        .router
        .convert(&payload.input_format, &payload.output_format, &file_data);

    let job = match result.status {
        wo_x2t::ConversionStatus::Success | wo_x2t::ConversionStatus::PartialSuccess => {
            let output = result.output.unwrap();
            let output_b64 =
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &output.data);
            ConversionJob {
                id: job_id.clone(),
                input_format: payload.input_format,
                output_format: payload.output_format,
                status: JobStatus::Completed,
                created_at,
                completed_at: Utc::now().to_rfc3339(),
                error: None,
                output_data: Some(output_b64),
                output_size: Some(output.data.len()),
                duration_ms: Some(result.duration_ms),
            }
        }
        wo_x2t::ConversionStatus::UnsupportedFormat => ConversionJob {
            id: job_id.clone(),
            input_format: payload.input_format,
            output_format: payload.output_format,
            status: JobStatus::Failed,
            created_at,
            completed_at: Utc::now().to_rfc3339(),
            error: result.error,
            output_data: None,
            output_size: None,
            duration_ms: Some(result.duration_ms),
        },
        _ => ConversionJob {
            id: job_id.clone(),
            input_format: payload.input_format,
            output_format: payload.output_format,
            status: JobStatus::Failed,
            created_at,
            completed_at: Utc::now().to_rfc3339(),
            error: result.error,
            output_data: None,
            output_size: None,
            duration_ms: Some(result.duration_ms),
        },
    };

    {
        let mut repo = state.jobs.lock().await;
        if let Err(e) = repo.insert(&job, input_size) {
            tracing::error!(job_id = %job_id, error = %e, "failed to persist job");
        }
    }

    tracing::info!(
        job_id = %job_id,
        from = %job.input_format,
        to = %job.output_format,
        status = ?job.status,
        duration_ms = job.duration_ms,
        "conversion completed"
    );

    Ok(Json(ConvertResponse { job }))
}

/// GET /jobs/{id} — get the status and result of a conversion job.
pub async fn get_job_status(
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<String>,
) -> Result<Json<JobStatusResponse>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.jobs.lock().await;

    match repo.get(&job_id) {
        Ok(Some(job)) => Ok(Json(JobStatusResponse { job })),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Job {} not found", job_id),
                code: 404,
            }),
        )),
        Err(e) => {
            tracing::error!(job_id = %job_id, error = %e, "database error fetching job");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "database error".into(),
                    code: 500,
                }),
            ))
        }
    }
}

/// GET /jobs — list all conversion jobs.
pub async fn list_jobs(State(state): State<Arc<AppState>>) -> Json<Vec<ConversionJob>> {
    let repo = state.jobs.lock().await;
    let all = repo.list().unwrap_or_default();
    Json(all)
}

/// GET /health — liveness check.
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "conversion-service",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// GET /formats — list supported conversion format pairs.
pub async fn supported_formats(State(state): State<Arc<AppState>>) -> Json<Vec<FormatPair>> {
    let pairs = state
        .router
        .registry()
        .registered_pairs()
        .into_iter()
        .map(|(src, tgt)| FormatPair {
            source: src.to_string(),
            target: tgt.to_string(),
        })
        .collect();
    Json(pairs)
}

/// Build the full application router.
pub fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/convert", post(submit_conversion))
        .route("/jobs", get(list_jobs))
        .route("/jobs/{id}", get(get_job_status))
        .route("/formats", get(supported_formats))
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_job(id: &str, status: JobStatus, error: Option<&str>) -> ConversionJob {
        ConversionJob {
            id: id.to_string(),
            input_format: "docx".to_string(),
            output_format: "pdf".to_string(),
            status,
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
            completed_at: "2026-01-01T00:00:01+00:00".to_string(),
            error: error.map(String::from),
            output_data: None,
            output_size: Some(1024),
            duration_ms: None,
        }
    }

    #[test]
    fn test_insert_and_get() {
        let mut repo = JobRepository::new_in_memory().unwrap();
        let job = make_job("job-1", JobStatus::Completed, None);
        repo.insert(&job, 2048).unwrap();

        let fetched = repo.get("job-1").unwrap().expect("job should exist");
        assert_eq!(fetched.id, "job-1");
        assert_eq!(fetched.input_format, "docx");
        assert_eq!(fetched.output_format, "pdf");
        assert_eq!(fetched.status, JobStatus::Completed);
        assert_eq!(fetched.output_size, Some(1024));
        assert!(fetched.output_data.is_none());
        assert!(fetched.duration_ms.is_none());
    }

    #[test]
    fn test_insert_failed_job() {
        let mut repo = JobRepository::new_in_memory().unwrap();
        let job = make_job("job-2", JobStatus::Failed, Some("unsupported format"));
        repo.insert(&job, 512).unwrap();

        let fetched = repo.get("job-2").unwrap().expect("job should exist");
        assert_eq!(fetched.status, JobStatus::Failed);
        assert_eq!(fetched.error, Some("unsupported format".to_string()));
    }

    #[test]
    fn test_get_nonexistent() {
        let repo = JobRepository::new_in_memory().unwrap();
        assert!(repo.get("no-such-job").unwrap().is_none());
    }

    #[test]
    fn test_list_jobs() {
        let mut repo = JobRepository::new_in_memory().unwrap();
        repo.insert(&make_job("a", JobStatus::Completed, None), 100)
            .unwrap();
        repo.insert(&make_job("b", JobStatus::Failed, Some("err")), 200)
            .unwrap();
        repo.insert(&make_job("c", JobStatus::Completed, None), 300)
            .unwrap();

        let jobs = repo.list().unwrap();
        assert_eq!(jobs.len(), 3);
        assert!(jobs.iter().any(|j| j.id == "a"));
        assert!(jobs.iter().any(|j| j.id == "b"));
        assert!(jobs.iter().any(|j| j.id == "c"));
    }

    #[test]
    fn test_delete_job() {
        let mut repo = JobRepository::new_in_memory().unwrap();
        repo.insert(&make_job("del-me", JobStatus::Completed, None), 100)
            .unwrap();

        assert!(repo.delete("del-me").unwrap());
        assert!(!repo.delete("del-me").unwrap()); // already deleted
        assert!(repo.get("del-me").unwrap().is_none());
    }

    #[test]
    fn test_persistence_across_restart() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let path = tmp.path().to_str().unwrap().to_string();

        // "Session 1": insert a job
        {
            let mut repo = JobRepository::new(&path).unwrap();
            let job = make_job("persist-1", JobStatus::Completed, None);
            repo.insert(&job, 4096).unwrap();
        }

        // "Session 2": drop connection, reopen, read
        {
            let repo = JobRepository::new(&path).unwrap();
            let fetched = repo.get("persist-1").unwrap().expect("job should persist");
            assert_eq!(fetched.id, "persist-1");
            assert_eq!(fetched.input_format, "docx");
            assert_eq!(fetched.status, JobStatus::Completed);
        }
    }

    #[test]
    fn test_empty_list() {
        let repo = JobRepository::new_in_memory().unwrap();
        assert!(repo.list().unwrap().is_empty());
    }
}
