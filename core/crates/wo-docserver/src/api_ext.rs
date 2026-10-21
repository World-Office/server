//! Editor extension API — collab (CRDT hub), agent-run audit, AI OCR.
//! Port of the deprecated Python docserver's collab/agents/ai-ocr routes
//! onto the Rust wo-docserver.

use std::sync::Mutex;

use axum::{
    body::{Body, Bytes},
    extract::{Path, Query, State},
    http::header::{HeaderValue, CACHE_CONTROL, CONTENT_TYPE},
    http::StatusCode,
    response::Response,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{AppError, AppState};

// ── Collaboration (CRDT hub over /api/documents/{id}/collab/*) ─────────

fn valid_doc_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 255
        && !id.starts_with('.')
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// GET /api/documents/{id}/collab/state
pub async fn collab_state(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    seed_collab(&state, &id).await;
    Ok(Json(state.collab.state(&id)))
}

/// GET /api/documents/{id}/collab/ops?since=N
pub async fn collab_ops(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    seed_collab(&state, &id).await;
    let since = params
        .get("since")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(0);
    Ok(Json(state.collab.ops_since(&id, since)))
}

#[derive(Deserialize)]
struct CollabOpsReq {
    #[serde(default = "anon")]
    client_id: String,
    #[serde(default)]
    base_rev: Option<usize>,
    /// `ops` is required: Python 400s when it is missing or not a list.
    #[serde(default)]
    ops: Option<Vec<Value>>,
}

fn anon() -> String {
    "anon".into()
}

/// POST /api/documents/{id}/collab/ops
pub async fn collab_apply_ops(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Bytes,
) -> Result<Json<Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    let payload: CollabOpsReq =
        serde_json::from_slice(&body).map_err(|_| AppError::BadRequest("invalid JSON".into()))?;
    let Some(ops) = payload.ops else {
        return Err(AppError::BadRequest("ops must be a list".into()));
    };
    Ok(Json(state.collab.apply_ops(
        &id,
        &payload.client_id,
        &ops,
        payload.base_rev,
    )))
}

#[derive(Deserialize)]
struct CollabSyncReq {
    #[serde(default)]
    text: String,
    #[serde(default)]
    client_id: String,
}

/// POST /api/documents/{id}/collab/sync
pub async fn collab_sync(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Bytes,
) -> Result<Json<Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    let payload: CollabSyncReq =
        serde_json::from_slice(&body).map_err(|_| AppError::BadRequest("invalid JSON".into()))?;
    let client_id = if payload.client_id.is_empty() {
        "anon"
    } else {
        &payload.client_id
    };
    Ok(Json(state.collab.sync_text(&id, client_id, &payload.text)))
}

/// POST /api/documents/{id}/collab/resync
pub async fn collab_resync(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Bytes,
) -> Result<Json<Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    let payload: CollabSyncReq =
        serde_json::from_slice(&body).map_err(|_| AppError::BadRequest("invalid JSON".into()))?;
    Ok(Json(state.collab.resync(&id, &payload.text)))
}

/// GET /api/documents/{id}/collab/stream — SSE live event stream.
pub async fn collab_stream(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    seed_collab(&state, &id).await;
    let rx = state.collab.subscribe(&id);
    let doc_id = id.clone();
    let state2 = state.clone();
    let stream = futures_util::stream::unfold(
        (rx, Some(state2.collab.state(&doc_id))),
        move |(mut rx, mut seed)| async move {
            let seed = std::mem::take(&mut seed);
            let item = if let Some(seed) = seed {
                format!("event: state\ndata: {seed}\n\n")
            } else {
                match tokio::time::timeout(std::time::Duration::from_secs(15), rx.recv()).await {
                    Ok(Ok(payload)) => format!("data: {payload}\n\n"),
                    Ok(Err(_)) => return None, // lagged/closed
                    Err(_) => ": keepalive\n\n".to_string(),
                }
            };
            Some((
                Ok::<_, std::convert::Infallible>(axum::body::Bytes::from(item)),
                (rx, None),
            ))
        },
    );
    let (mut parts, _) = Response::new(Body::empty()).into_parts();
    parts.status = StatusCode::OK;
    parts
        .headers
        .insert(CONTENT_TYPE, HeaderValue::from_static("text/event-stream"));
    parts
        .headers
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    parts.headers.insert(
        axum::http::header::HeaderName::from_static("x-accel-buffering"),
        HeaderValue::from_static("no"),
    );
    Ok(Response::from_parts(parts, Body::from_stream(stream)))
}

#[derive(Deserialize)]
struct PresenceReq {
    #[serde(default)]
    client_id: String,
    #[serde(default)]
    user: String,
    #[serde(default)]
    cursor: Option<Value>,
    #[serde(default)]
    avatar: Option<String>,
}

/// POST /api/documents/{id}/collab/presence — announce/leave.
pub async fn collab_presence(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Bytes,
) -> Result<Json<Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    let payload: PresenceReq =
        serde_json::from_slice(&body).map_err(|_| AppError::BadRequest("invalid JSON".into()))?;
    if payload.client_id.is_empty() {
        return Err(AppError::BadRequest("client_id required".into()));
    }
    let cursor = payload.cursor.unwrap_or(Value::Null);
    let clients = state
        .collab
        .set_presence(&id, &payload.client_id, &payload.user, cursor, payload.avatar.as_deref());
    Ok(Json(json!({ "ok": true, "clients": clients["clients"] })))
}

/// GET /api/documents/{id}/collab/presence — list active editors.
pub async fn collab_presence_list(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    Ok(Json(state.collab.clients(&id)))
}

/// Seed a collab doc from the stored document's plain text (best-effort),
/// mirroring Python `_collab_base_text`.
async fn seed_collab(state: &AppState, doc_id: &str) {
    if state.collab.rev(doc_id) > 0
        || !state.collab.state(doc_id)["text"]
            .as_str()
            .unwrap_or("")
            .is_empty()
    {
        return;
    }
    let Ok(Some(data)) = state.store.get_content(doc_id).await else {
        return;
    };
    // docx -> html -> plain text (cheap tag/wsp strip)
    let res = state.conversion_router.convert("docx", "html", &data);
    let Ok(html) = (match res.status {
        wo_x2t::ConversionStatus::Success | wo_x2t::ConversionStatus::PartialSuccess => res
            .output
            .map(|o| String::from_utf8_lossy(&o.data).into_owned())
            .ok_or(()),
        _ => Err(()),
    }) else {
        return;
    };
    let text = plain_text(&html);
    if !text.is_empty() {
        state.collab.resync(doc_id, &text);
    }
}

fn plain_text(html: &str) -> String {
    // paragraphs -> newlines, strip tags, collapse whitespace, unescape
    let s = html.replace("</p>", "\n").replace("<br", "\n");
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    let bytes = s.as_bytes();
    while i < bytes.len() {
        if bytes[i] == b'<' {
            match s[i..].find('>') {
                Some(end) => {
                    i += end + 1;
                    continue;
                }
                None => break,
            }
        }
        let ch = s[i..].chars().next().unwrap_or(' ');
        if ch.is_whitespace() {
            if !out.ends_with(' ') && !out.ends_with('\n') {
                out.push(' ');
            }
        } else {
            out.push(ch);
        }
        i += ch.len_utf8();
    }
    out.trim().to_string()
}

// ── Agent run audit (E20): in-memory equivalent of store.record_agent_run ─

#[derive(Clone, serde::Serialize)]
pub struct AgentRun {
    id: i64,
    ts: i64,
    doc_id: String,
    client_id: String,
    task: String,
    steps: u32,
    ops: u32,
    rev: u64,
    stopped_reason: String,
}

/// In-memory agent-run store (retention: newest MAX_AGENT_RUNS).
pub struct AgentRunStore {
    runs: Mutex<Vec<AgentRun>>,
    next_id: Mutex<i64>,
}

const MAX_AGENT_RUNS: usize = 500;

impl Default for AgentRunStore {
    fn default() -> Self {
        Self {
            runs: Mutex::new(Vec::new()),
            next_id: Mutex::new(1),
        }
    }
}

impl AgentRunStore {
    pub fn new() -> Self {
        Self::default()
    }

    #[allow(clippy::too_many_arguments)]
    pub fn record(
        &self,
        doc_id: &str,
        client_id: &str,
        task: &str,
        steps: u32,
        ops: u32,
        rev: u64,
        stopped_reason: &str,
    ) -> i64 {
        let id = {
            let mut n = self.next_id.lock().unwrap();
            let v = *n;
            *n += 1;
            v
        };
        let ts = chrono::Utc::now().timestamp_millis();
        let run = AgentRun {
            id,
            ts,
            doc_id: doc_id.to_string(),
            client_id: client_id.to_string(),
            task: task.to_string(),
            steps,
            ops,
            rev,
            stopped_reason: stopped_reason.to_string(),
        };
        let mut runs = self.runs.lock().unwrap();
        runs.push(run);
        if runs.len() > MAX_AGENT_RUNS {
            let excess = runs.len() - MAX_AGENT_RUNS;
            runs.drain(..excess);
        }
        id
    }

    pub fn list(
        &self,
        limit: usize,
        client_id: Option<&str>,
        doc_id: Option<&str>,
    ) -> Vec<AgentRun> {
        self.runs
            .lock()
            .unwrap()
            .iter()
            .rev()
            .filter(|r| client_id.is_none_or(|c| r.client_id == c))
            .filter(|r| doc_id.is_none_or(|d| r.doc_id == d))
            .take(limit.clamp(1, 1000))
            .cloned()
            .collect()
    }

    pub fn get(&self, run_id: i64) -> Option<AgentRun> {
        self.runs
            .lock()
            .unwrap()
            .iter()
            .rev()
            .find(|r| r.id == run_id)
            .cloned()
    }

    pub fn summary(&self) -> Vec<Value> {
        // per-client aggregates: runs, ops, docs, last seen
        let mut map: std::collections::HashMap<
            String,
            (u32, u32, std::collections::HashSet<String>, i64),
        > = std::collections::HashMap::new();
        for r in self.runs.lock().unwrap().iter() {
            let e = map
                .entry(r.client_id.clone())
                .or_insert((0, 0, Default::default(), 0));
            e.0 += 1;
            e.1 += r.ops;
            e.2.insert(r.doc_id.clone());
            e.3 = e.3.max(r.ts);
        }
        let mut out: Vec<Value> = map
            .into_iter()
            .map(|(client_id, (runs, ops, docs, last_ts))| {
                json!({
                    "client_id": client_id, "runs": runs, "ops": ops,
                    "docs": docs.len(), "last_ts": last_ts,
                })
            })
            .collect();
        out.sort_by(|a, b| b["last_ts"].as_i64().cmp(&a["last_ts"].as_i64()));
        out
    }
}

// ── Agent endpoints ────────────────────────────────────────────────────

/// GET /api/agents/runs?limit=N&client_id=…&doc_id=…
pub async fn agent_runs(
    State(state): State<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, AppError> {
    let limit = params
        .get("limit")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(100);
    if !(1..=1000).contains(&limit) {
        return Err(AppError::BadRequest("limit must be 1..1000".into()));
    }
    let client_id = params.get("client_id").map(String::as_str);
    let doc_id = params.get("doc_id").map(String::as_str);
    Ok(Json(
        json!({ "runs": state.agent_runs.list(limit, client_id, doc_id) }),
    ))
}

/// GET /api/agents/runs/{run_id}
pub async fn agent_run_detail(
    State(state): State<AppState>,
    Path(run_id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    match state.agent_runs.get(run_id) {
        Some(run) => {
            let mut v = serde_json::to_value(run).unwrap();
            // Python attaches the redacted trace here; the Rust server records
            // no traces yet (no local AgentRunner), so it is honestly null.
            v["trace"] = Value::Null;
            Ok(Json(v))
        }
        None => Err(AppError::NotFound("not found".into())),
    }
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// GET /agents — read-only server-rendered audit dashboard (E20S3).
/// Stoic: a page, not a SPA — same tables the Python reference rendered.
pub async fn agents_dashboard(State(state): State<AppState>) -> axum::response::Html<String> {
    let summary = state.agent_runs.summary();
    let runs = state.agent_runs.list(20, None, None);

    let mut agg = String::new();
    if summary.is_empty() {
        agg.push_str(r#"<p class="empty">No agent runs recorded yet.</p>"#);
    } else {
        agg.push_str(
            r#"<table><thead><tr><th>client</th><th class="num">runs</th><th class="num">ops</th><th class="num">docs</th><th>last seen</th></tr></thead><tbody>"#,
        );
        for a in &summary {
            agg.push_str(&format!(
                "<tr><td><code>{}</code></td><td class='num'>{}</td><td class='num'>{}</td><td class='num'>{}</td><td>{}</td></tr>",
                esc(a["client_id"].as_str().unwrap_or("")),
                a["runs"].as_u64().unwrap_or(0),
                a["ops"].as_u64().unwrap_or(0),
                a["docs"].as_u64().unwrap_or(0),
                a["last_ts"].as_i64().unwrap_or(0),
            ));
        }
        agg.push_str("</tbody></table>");
    }

    let mut rows = String::new();
    if runs.is_empty() {
        rows.push_str(r#"<p class="empty">Nothing here yet.</p>"#);
    } else {
        rows.push_str(
            r#"<table><thead><tr><th class="num">#</th><th>client</th><th>doc</th><th>task</th><th class="num">steps</th><th class="num">ops</th><th class="num">rev</th><th>stop</th></tr></thead><tbody>"#,
        );
        for r in &runs {
            rows.push_str(&format!(
                "<tr><td class='num'>{}</td><td><code>{}</code></td><td><code>{}</code></td><td>{}</td><td class='num'>{}</td><td class='num'>{}</td><td class='num'>{}</td><td>{}</td></tr>",
                r.id,
                esc(&r.client_id),
                esc(&r.doc_id),
                esc(&r.task),
                r.steps,
                r.ops,
                r.rev,
                esc(&r.stopped_reason),
            ));
        }
        rows.push_str("</tbody></table>");
    }

    axum::response::Html(format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>World Office — Agents</title>
  <style>
    :root {{ color-scheme: light dark; }}
    body {{ font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; }}
    h1 {{ font-size: 1.3rem; }} h2 {{ font-size: 1.05rem; margin-top: 2rem; }}
    table {{ border-collapse: collapse; width: 100%; margin-top: .5rem; }}
    th, td {{ border: 1px solid #8884; padding: .35rem .6rem; text-align: left; font-size: .85rem; }}
    th {{ opacity: .7; font-weight: 600; }}
    td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
    .empty {{ opacity: .6; font-style: italic; }}
    code {{ font-size: .8rem; }}
  </style>
</head>
<body>
  <h1>Agents — observability</h1>
  <p class="empty">Read-only audit view: who ran, when, with what budget and outcome.</p>

  <h2>Per-agent aggregates</h2>
  {agg}

  <h2>Recent runs (newest first)</h2>
  {rows}
</body>
</html>"#
    ))
}

/// GET /api/agents/summary
pub async fn agent_summary(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    Ok(Json(json!({ "agents": state.agent_runs.summary() })))
}

// ── AI OCR ─────────────────────────────────────────────────────────────

/// POST /api/documents/{id}/ai/ocr — extract text via the registered vision
/// model. Routes through the same propose pipeline as ai::ai_propose (real
/// call; unregistered/unreachable provider surfaces as an honest error).
pub async fn ai_ocr(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, AppError> {
    if !valid_doc_id(&id) {
        return Err(AppError::BadRequest("Invalid file id".into()));
    }
    if state.store.get(&id).await?.is_none() {
        return Err(AppError::NotFound("not found".into()));
    }
    let Some(data) = state.store.get_content(&id).await? else {
        return Err(AppError::NotFound("not found".into()));
    };
    let model = params
        .get("model")
        .cloned()
        .unwrap_or_else(|| "default".into());
    // OCR instruction is the propose pipeline's prompt
    let instruction = "Perform OCR on the document, extract all text, and return it as plain text.";
    let _ = data;
    let content = crate::ai::ocr_extract(&data).await?;
    let run_id = state.agent_runs.record(
        &id,
        &format!("agent=ocr-{model}"),
        instruction,
        1,
        1,
        0,
        "complete",
    );
    let _ = run_id;
    Ok(Json(json!({
        "ok": true,
        "op": "propose",
        "doc_id": id,
        "author": format!("AI ({model})"),
        "instruction": instruction,
        "content": content,
        "model": model,
    })))
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_run_filters_and_summary() {
        let s = AgentRunStore::new();
        s.record("a.docx", "agent=1", "task", 2, 3, 1, "complete");
        s.record("b.docx", "agent=1", "task", 1, 1, 1, "complete");
        s.record("a.docx", "agent=2", "task", 5, 9, 4, "budget");

        // doc filter isolates one doc, newest first
        let by_doc = s.list(100, None, Some("a.docx"));
        assert_eq!(by_doc.len(), 2);
        assert!(by_doc.iter().all(|r| r.doc_id == "a.docx"));

        // client filter isolates one agent
        let by_client = s.list(100, Some("agent=2"), None);
        assert_eq!(by_client.len(), 1);
        assert_eq!(by_client[0].ops, 9);

        // combined filters
        assert_eq!(s.list(100, Some("agent=1"), Some("b.docx")).len(), 1);

        // limit clamps
        assert_eq!(s.list(1, None, None).len(), 1);

        // summary aggregates per client, newest first
        let sum = s.summary();
        assert_eq!(sum.len(), 2);
        let a1 = sum.iter().find(|v| v["client_id"] == "agent=1").unwrap();
        assert_eq!(a1["runs"], 2);
        assert_eq!(a1["ops"], 4);
        assert_eq!(a1["docs"], 2); // a.docx + b.docx
    }
}
