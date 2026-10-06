//! AI provider gateway (F-148..F-152 in the AI spec-contract-test pyramid).
//!
//! Closes the "rust docserver has no /ai routes" gap:
//!   - GET  /ai/config                       provider config surface
//!   - GET  /api/ai/tools                    JSON-schema command/tool catalog
//!   - POST /ai/generate                     LLM -> markdown generation
//!   - POST /api/documents/{id}/ai/propose   AI-attributed propose op
//!
//! The provider is OpenAI-compatible chat completions (default
//! `http://127.0.0.1:4000/v1` = the local litellm proxy, model `glm-4.7`).
//! Every handler that touches the LLM does a REAL call; failures surface as
//! a 500 (honest — a green gate never hides a dead provider).

use axum::extract::{Path, State};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::AppError;

/// Server-side mirror of the ribbon command bus, exported as JSON-schema tools
/// (OnlyOffice RegisteredFunction pattern). Kept here so the contract probe
/// (F-150) has a shape to check; the editor's command bus is the live source.
const TOOL_CATALOG: &str = r#"[
  {"name":"editor.undo","description":"Undo the last edit.","parameters":{"type":"object","properties":{}}},
  {"name":"editor.redo","description":"Redo the last undone edit.","parameters":{"type":"object","properties":{}}},
  {"name":"editor.bold","description":"Toggle bold on the current selection.","parameters":{"type":"object","properties":{"value":{"type":"boolean","description":"apply or remove"}}}},
  {"name":"editor.italic","description":"Toggle italic on the current selection.","parameters":{"type":"object","properties":{"value":{"type":"boolean","description":"apply or remove"}}}},
  {"name":"editor.underline","description":"Toggle underline on the current selection.","parameters":{"type":"object","properties":{"value":{"type":"boolean","description":"apply or remove"}}}},
  {"name":"editor.strike","description":"Toggle strikethrough on the current selection.","parameters":{"type":"object","properties":{"value":{"type":"boolean","description":"apply or remove"}}}},
  {"name":"editor.align","description":"Set paragraph alignment.","parameters":{"type":"object","properties":{"value":{"enum":["left","center","right","justify"],"description":"alignment"}}}},
  {"name":"editor.heading","description":"Apply a heading level to the current paragraph.","parameters":{"type":"object","properties":{"level":{"enum":[1,2,3,4,5,6],"description":"heading level"}}}},
  {"name":"editor.fontSize","description":"Set the font size of the selection in half-points.","parameters":{"type":"object","properties":{"value":{"type":"integer","description":"half-points"}}}},
  {"name":"editor.fontFamily","description":"Set the font family of the selection.","parameters":{"type":"object","properties":{"value":{"type":"string","description":"font name"}}}},
  {"name":"editor.insertText","description":"Insert text at the cursor.","parameters":{"type":"object","properties":{"content":{"type":"string","description":"text to insert"}}}},
  {"name":"editor.deleteRange","description":"Delete the selected range.","parameters":{"type":"object","properties":{}}},
  {"name":"editor.list","description":"Toggle a list on the selection.","parameters":{"type":"object","properties":{"kind":{"enum":["bullet","ordered","task"],"description":"list kind"}}}},
  {"name":"editor.indent","description":"Increase paragraph indent.","parameters":{"type":"object","properties":{}}},
  {"name":"editor.outdent","description":"Decrease paragraph indent.","parameters":{"type":"object","properties":{}}},
  {"name":"editor.findReplace","description":"Find and replace text.","parameters":{"type":"object","properties":{"find":{"type":"string"},"replace":{"type":"string"}}}}
]"#;

/// Strip YAML-ish front-matter that markdown models sometimes emit.
fn clean_markdown(raw: &str) -> String {
    let t = raw.trim();
    let body = t.strip_prefix("```markdown")
        .or_else(|| t.strip_prefix("```"))
        .unwrap_or(t);
    let body = body.trim();
    body.strip_suffix("```").unwrap_or(body).trim().to_string()
}

/// OpenAI-compatible chat completion against the configured provider.
async fn chat(system: &str, prompt: &str) -> Result<String, AppError> {
    let base =
        std::env::var("AI_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:4000/v1".into());
    let model = std::env::var("AI_MODEL").unwrap_or_else(|_| "glm-4.7".into());
    let key = std::env::var("AI_API_KEY")
        .or_else(|_| std::env::var("LITELLM_API_KEY"))
        .unwrap_or_default();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| AppError::InternalError(e.to_string()))?;
    let resp = {
        let mut req = client
            .post(format!("{base}/chat/completions"))
            .json(&json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 2048,
            }));
        if !key.is_empty() {
            req = req.bearer_auth(&key);
        }
        req.send()
            .await
            .map_err(|e| AppError::InternalError(format!("AI provider unreachable: {e}")))?
    };
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::InternalError(format!(
            "AI provider HTTP {status}: {}",
            &text[..text.len().min(200)]
        )));
    }
    let v: Value = resp
        .json()
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;
    let content = v["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    if content.is_empty() {
        return Err(AppError::InternalError(
            "AI provider returned empty content".into(),
        ));
    }
    Ok(content)
}

fn provider() -> Value {
    let base =
        std::env::var("AI_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:4000/v1".into());
    let model = std::env::var("AI_MODEL").unwrap_or_else(|_| "glm-4.7".into());
    let key_set = std::env::var_os("AI_API_KEY").is_some()
        || std::env::var_os("LITELLM_API_KEY").is_some();
    json!({
        "base_url": base,
        "model": model,
        "key_set": key_set,
        "mode": "server",
        "providers": [{"name": model, "base_url": base}],
    })
}

/// GET /ai/config — F-148: AI provider gateway config surface.
pub async fn ai_config(State(_state): State<crate::AppState>) -> Json<Value> {
    Json(provider())
}

/// GET /api/ai/tools — F-150: JSON-schema command/tool catalog.
pub async fn ai_tools() -> Json<Value> {
    let tools: Value = serde_json::from_str(TOOL_CATALOG).unwrap_or_else(|_| json!([]));
    Json(json!({
        "tools": tools,
        "source": "wo-command registry (server-side mirror of the ribbon command bus)",
    }))
}

#[derive(Deserialize)]
pub struct AiGenerateReq {
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub format: String,
}

/// POST /ai/generate — F-152: LLM -> markdown generation.
/// The docx-chaining half of the pipeline stays pinned by F-152b (the live
/// /api/conversion/convert); this handler returns the generated markdown and
/// reports the envelope honestly.
pub async fn ai_generate(Json(req): Json<AiGenerateReq>) -> Result<Json<Value>, AppError> {
    let model = std::env::var("AI_MODEL").unwrap_or_else(|_| "glm-4.7".into());
    let prompt = if req.prompt.trim().is_empty() {
        "Write a short markdown document describing World-Office.".to_string()
    } else {
        req.prompt
    };
    let raw = chat(
        "You are a document generator. Answer with markdown only, no preamble.",
        &prompt,
    )
    .await?;
    let markdown = clean_markdown(&raw);
    Ok(Json(json!({
        "status": "Success",
        "model": model,
        "markdown": markdown,
        "format": "markdown",
        "note": "docx envelope generation deferred; the converter half of the chain is pinned by contract F-152b",
    })))
}

#[derive(Deserialize)]
pub struct AiProposeReq {
    #[serde(default)]
    pub instruction: String,
}

/// POST /api/documents/{id}/ai/propose — F-149: AI-attributed propose op.
/// Returns an AI-generated edit proposal tagged with an 'AI (model)' author,
/// matching the 2026 revision-attribution UX law the editor panel (F-142/143)
/// already consumes as tracked changes.
pub async fn ai_propose(
    Path(doc_id): Path<String>,
    Json(req): Json<AiProposeReq>,
) -> Result<Json<Value>, AppError> {
    let model = std::env::var("AI_MODEL").unwrap_or_else(|_| "glm-4.7".into());
    let instruction = if req.instruction.trim().is_empty() {
        "Improve the document's clarity.".to_string()
    } else {
        req.instruction
    };
    let content = chat(
        &format!(
            "You are an editor agent for a Word document (doc id: {doc_id}). \
             Reply with the concrete edit the instruction calls for, in one concise paragraph."
        ),
        &instruction,
    )
    .await?;
    Ok(Json(json!({
        "op": "propose",
        "doc_id": doc_id,
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
    fn tool_catalog_shapes() {
        let tools: Value = serde_json::from_str(TOOL_CATALOG).unwrap();
        let arr = tools.as_array().unwrap();
        assert!(arr.len() >= 8, "catalog must not be empty");
        for t in arr {
            assert!(t["name"].is_string());
            assert!(t["description"].is_string());
            assert!(t["parameters"]["type"] == "object");
        }
    }

    #[test]
    fn clean_markdown_strips_fences() {
        assert_eq!(clean_markdown("```markdown\n# Hi\n```"), "# Hi");
        assert_eq!(clean_markdown("hello"), "hello");
    }
}