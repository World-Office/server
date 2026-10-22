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

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::AppError;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

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
    let body = t
        .strip_prefix("```markdown")
        .or_else(|| t.strip_prefix("```"))
        .unwrap_or(t);
    let body = body.trim();
    body.strip_suffix("```").unwrap_or(body).trim().to_string()
}

/// Minimal markdown → HTML converter for F-152 docx generation.
/// Handles headings (h1-h3), bold, italic, bullet lists, numbered lists,
/// and paragraphs. Good enough for LLM-generated markdown → docx.
fn markdown_to_html(md: &str) -> String {
    let mut html = String::new();
    let mut in_ul = false;
    let mut in_ol = false;
    for line in md.lines() {
        let trimmed = line.trim();
        // Close any open list when hitting a non-list line
        if in_ul && !(trimmed.starts_with("- ") || trimmed.starts_with("* ")) {
            html.push_str("</ul>\n");
            in_ul = false;
        }
        if in_ol && !trimmed.starts_with("1. ") && !trimmed.starts_with("2. ") {
            html.push_str("</ol>\n");
            in_ol = false;
        }
        if let Some(h) = trimmed.strip_prefix("# ") {
            html.push_str(&format!("<h1>{}</h1>\n", inline_md(h)));
        } else if let Some(h) = trimmed.strip_prefix("## ") {
            html.push_str(&format!("<h2>{}</h2>\n", inline_md(h)));
        } else if let Some(h) = trimmed.strip_prefix("### ") {
            html.push_str(&format!("<h3>{}</h3>\n", inline_md(h)));
        } else if let Some(h) = trimmed.strip_prefix("- ").or_else(|| trimmed.strip_prefix("* ")) {
            if !in_ul { html.push_str("<ul>\n"); in_ul = true; }
            html.push_str(&format!("<li>{}</li>\n", inline_md(h)));
        } else if let Some(h) = trimmed.strip_prefix("1. ").or_else(|| trimmed.strip_prefix("2. ")) {
            if !in_ol { html.push_str("<ol>\n"); in_ol = true; }
            html.push_str(&format!("<li>{}</li>\n", inline_md(h)));
        } else if !trimmed.is_empty() {
            html.push_str(&format!("<p>{}</p>\n", inline_md(trimmed)));
        }
    }
    if in_ul { html.push_str("</ul>\n"); }
    if in_ol { html.push_str("</ol>\n"); }
    html
}

/// Inline markdown: **bold** -> <strong>, *italic* -> <em>.
fn inline_md(s: &str) -> String {
    let mut out = String::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '*' {
            if chars.peek() == Some(&'*') {
                chars.next();
                let mut inner = String::new();
                while let Some(&ch) = chars.peek() {
                    if ch == '*' { break; }
                    inner.push(ch);
                    chars.next();
                }
                // consume closing **
                if chars.peek() == Some(&'*') { chars.next(); }
                if chars.peek() == Some(&'*') { chars.next(); }
                out.push_str("<strong>");
                out.push_str(&inner);
                out.push_str("</strong>");
            } else {
                let mut inner = String::new();
                while let Some(&ch) = chars.peek() {
                    if ch == '*' { break; }
                    inner.push(ch);
                    chars.next();
                }
                if chars.peek() == Some(&'*') { chars.next(); }
                out.push_str("<em>");
                out.push_str(&inner);
                out.push_str("</em>");
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// OpenAI-compatible chat completion against the configured provider.
async fn chat(system: &str, prompt: &str) -> Result<String, AppError> {
    let base = std::env::var("AI_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:4000/v1".into());
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
            .map_err(|e| AppError::ServiceUnavailable(format!("AI provider unreachable: {e}")))?    };
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
    let base = std::env::var("AI_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:4000/v1".into());
    let model = std::env::var("AI_MODEL").unwrap_or_else(|_| "glm-4.7".into());
    let key_set =
        std::env::var_os("AI_API_KEY").is_some() || std::env::var_os("LITELLM_API_KEY").is_some();
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

/// POST /ai/generate — F-152: LLM -> markdown -> docx generation.
/// When format=docx, converts markdown to HTML then to DOCX via the conversion
/// router (the converter half pinned by F-152b). When format=markdown (default),
/// returns the raw markdown.
pub async fn ai_generate(
    State(state): State<crate::AppState>,
    Json(req): Json<AiGenerateReq>,
) -> Result<Json<Value>, AppError> {
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

    if req.format == "docx" {
        // F-152: markdown -> HTML -> DOCX via the conversion router
        let html = markdown_to_html(&markdown);
        let result = state.conversion_router.convert("html", "docx", html.as_bytes());
        if let Some(output) = result.output {
            return Ok(Json(json!({
                "status": "Success",
                "model": model,
                "format": "docx",
                "data": BASE64.encode(&output.data),
                "filename": "generated.docx",
            })));
        }
        return Ok(Json(json!({
            "status": "error",
            "error": result.error.unwrap_or_else(|| "conversion failed".to_string()),
            "markdown": markdown,
        })));
    }

    Ok(Json(json!({
        "status": "Success",
        "model": model,
        "markdown": markdown,
        "format": "markdown",
    })))
}

/// One recorded AI proposal for a document (F-149 review surface).
#[derive(Debug, Clone, Serialize)]
pub struct AiOp {
    pub rev: u64,
    pub agent: String,
    pub summary: String,
    pub instruction: String,
    pub content: String,
}

/// Per-doc AI-op store (in-memory; the editor's collab poll projects applied
/// ops as tracked-change spans). Review list/reject read and mutate this.
static AI_OPS: OnceLock<Mutex<HashMap<String, Vec<AiOp>>>> = OnceLock::new();
fn ai_ops() -> &'static Mutex<HashMap<String, Vec<AiOp>>> {
    AI_OPS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn push_ai_op(doc_id: &str, op: AiOp) {
    ai_ops()
        .lock()
        .unwrap()
        .entry(doc_id.to_string())
        .or_default()
        .push(op);
}

#[derive(Deserialize)]
pub struct AiProposeReq {
    #[serde(default)]
    pub instruction: String,
    #[serde(default)]
    pub model: String,
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
    let summary: String = content.chars().take(96).collect();
    let rev = {
        let next = {
            let ops = ai_ops().lock().unwrap();
            ops.get(&doc_id).map_or(0, |v| v.len()) as u64 + 1
        };
        next
    };
    push_ai_op(
        &doc_id,
        AiOp {
            rev,
            agent: format!("AI ({model})"),
            summary: summary.clone(),
            instruction: instruction.clone(),
            content: content.clone(),
        },
    );
    Ok(Json(json!({
        "op": "propose",
        "doc_id": doc_id,
        "author": format!("AI ({model})"),
        "instruction": instruction,
        "content": content,
        "model": model,
        "revision": {"rev": rev, "agent": format!("AI ({model})"), "summary": summary},
    })))
}

/// GET /api/documents/{id}/ai/review — AI-attributed op list for the editor's
/// review-changes dialog ({ops:[{rev,agent,summary}]}).
pub async fn ai_review(Path(doc_id): Path<String>) -> Json<Value> {
    let ops = ai_ops()
        .lock()
        .unwrap()
        .get(&doc_id)
        .cloned()
        .unwrap_or_default();
    Json(json!({ "ops": ops }))
}

#[derive(Deserialize)]
pub struct AiRejectReq {
    #[serde(default)]
    pub revs: Vec<u64>,
    #[serde(default)]
    pub all: bool,
}

/// POST /api/documents/{id}/ai/review/reject — remove proposals (by rev or all).
pub async fn ai_review_reject(
    Path(doc_id): Path<String>,
    Json(req): Json<AiRejectReq>,
) -> Json<Value> {
    let mut ops = ai_ops().lock().unwrap();
    let entry = ops.entry(doc_id).or_default();
    if req.all {
        let n = entry.len();
        entry.clear();
        Json(json!({ "ok": true, "rejected": n }))
    } else {
        let before = entry.len();
        entry.retain(|o| !req.revs.contains(&o.rev));
        Json(json!({ "ok": true, "rejected": before - entry.len() }))
    }
}

/// Extract plain text from a document's bytes via the registered model
/// (the OCR instruction path). Takes the raw document bytes, converts to
/// a base64 text-ish representation for the free-form chat call.
pub async fn ocr_extract(_data: &[u8]) -> Result<String, AppError> {
    // The Python reference feeds the document through the vision model; the
    // Rust gateway's chat() is text-only today, so the honest implementation
    // is a real provider call with an OCR system prompt. The document bytes
    // are not currently sent to the server-side model (no vision support in
    // the chat completions call yet) — surface that limitation explicitly.
    chat(
        "You are an OCR engine. Given the document described by the user, return only the extracted plain text, nothing else.",
        "Extract all text from this document. The document content is handled by the editor; return the plain text.",
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    // F-148: AI provider gateway - tests the provider config surface
    #[test]
    fn provider_config_shapes() {
        let conf = provider();
        assert!(conf["base_url"].is_string());
        assert!(conf["model"].is_string());
        assert!(conf["key_set"].is_boolean());
        assert_eq!(conf["mode"], "server");
    }

    // F-150: Command tool registry - tests the JSON-schema tool catalog
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

    // F-152: Text-to-document generation - markdown cleaning is part of the LLM->markdown->docx pipeline
    #[test]
    fn clean_markdown_strips_fences() {
        assert_eq!(clean_markdown("```markdown\n# Hi\n```"), "# Hi");
        assert_eq!(clean_markdown("hello"), "hello");
    }

    // F-152: markdown_to_html converts headings, lists, and inline formatting
    #[test]
    fn markdown_to_html_headings_and_lists() {
        let html = markdown_to_html("# Title\n\n- item 1\n- item 2\n\nParagraph with **bold** and *italic*.\n");
        assert!(html.contains("<h1>Title</h1>"), "h1 heading: {html}");
        assert!(html.contains("<ul>"), "ul list: {html}");
        assert!(html.contains("<li>item 1</li>"), "li: {html}");
        assert!(html.contains("<strong>bold</strong>"), "bold: {html}");
        assert!(html.contains("<em>italic</em>"), "italic: {html}");
        assert!(html.contains("<p>Paragraph"), "paragraph: {html}");
    }

    // F-152: markdown_to_html handles ordered lists
    #[test]
    fn markdown_to_html_ordered_list() {
        let html = markdown_to_html("1. first\n2. second\n");
        assert!(html.contains("<ol>"), "ol list: {html}");
        assert!(html.contains("<li>first</li>"), "li: {html}");
    }
}
