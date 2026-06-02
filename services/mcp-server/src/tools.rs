use std::sync::Arc;

use crate::client::StorageClient;
use rmcp::model::*;
use rmcp::service::RequestContext;
use rmcp::ServerHandler;
use serde_json::{json, Map, Value};

pub struct McpTools {
    client: StorageClient,
}

impl McpTools {
    pub fn new(client: StorageClient) -> Self {
        Self { client }
    }

    fn tool_definitions() -> Vec<Tool> {
        vec![
            Tool::new(
                "list_documents",
                "List all documents stored in World Office",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {},
                    "required": []
                }))),
            ),
            Tool::new(
                "get_document_info",
                "Get detailed information about a specific document",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Document ID" }
                    },
                    "required": ["id"]
                }))),
            ),
            Tool::new(
                "read_document",
                "Read the full content of a document",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Document ID" }
                    },
                    "required": ["id"]
                }))),
            ),
            Tool::new(
                "create_document",
                "Create a new empty document, or with optional initial content",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "Document name" },
                        "content": { "type": "string", "description": "Initial content (optional)" }
                    },
                    "required": ["name"]
                }))),
            ),
            Tool::new(
                "write_document",
                "Write content to a document. Automatically creates a version snapshot of the previous content before writing.",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Document ID" },
                        "content": { "type": "string", "description": "New content" }
                    },
                    "required": ["id", "content"]
                }))),
            ),
            Tool::new(
                "list_snapshots",
                "List version snapshots for a document",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Document ID" }
                    },
                    "required": ["id"]
                }))),
            ),
            Tool::new(
                "restore_snapshot",
                "Restore a document to a previous version snapshot",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "file_id": { "type": "string", "description": "Document ID" },
                        "snapshot_id": { "type": "string", "description": "Snapshot ID" }
                    },
                    "required": ["file_id", "snapshot_id"]
                }))),
            ),
            // ── Comment tools ──
            Tool::new(
                "list_comments",
                "List all comments for a document, including replies and resolution status",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "document_id": { "type": "string", "description": "Document ID" }
                    },
                    "required": ["document_id"]
                }))),
            ),
            Tool::new(
                "add_comment",
                "Add a comment to a document. The text can include @agent_name mentions.",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "document_id": { "type": "string", "description": "Document ID" },
                        "text": { "type": "string", "description": "Comment text. Use @agent_name to mention other agents." },
                        "author_name": { "type": "string", "description": "Display name of the comment author" }
                    },
                    "required": ["document_id", "text", "author_name"]
                }))),
            ),
            Tool::new(
                "resolve_comment",
                "Mark a comment as resolved",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "comment_id": { "type": "string", "description": "Comment ID" }
                    },
                    "required": ["comment_id"]
                }))),
            ),
            Tool::new(
                "list_mentions",
                "List all comments that mention a specific agent name",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "agent_name": { "type": "string", "description": "Agent name (without @ prefix)" }
                    },
                    "required": ["agent_name"]
                }))),
            ),
        ]
    }

    fn get_arg<'a>(args: &'a Option<Map<String, Value>>, key: &str) -> Option<&'a str> {
        args.as_ref()?.get(key).and_then(|v| v.as_str())
    }

    fn error_result(msg: String) -> CallToolResult {
        CallToolResult {
            content: vec![Content::text(msg)],
            structured_content: None,
            meta: None,
            is_error: Some(true),
        }
    }
}

impl ServerHandler for McpTools {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::default(),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            server_info: Implementation {
                name: "World Office MCP Server".to_string(),
                version: "0.1.0".to_string(),
                ..Default::default()
            },
            instructions: Some(
                "Read, write, and manage World Office documents with automatic version snapshots. "
                    .to_string()
                    + "Comment on documents with @agent mentions and resolve threads. "
                    + "Agents can check their @mentions to discover when they've been referenced.",
            ),
        }
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        Self::tool_definitions().into_iter().find(|t| t.name == name)
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<rmcp::RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult {
            tools: Self::tool_definitions(),
            meta: None,
            next_cursor: None,
        })
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<rmcp::RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        match request.name.as_ref() {
            "list_documents" => match self.client.list_files().await {
                Ok(files) => {
                    let data = json!(files);
                    Ok(CallToolResult::success(vec![Content::text(data.to_string())]))
                }
                Err(e) => Ok(Self::error_result(e.to_string())),
            },
            "get_document_info" => {
                let id = Self::get_arg(&request.arguments, "id").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: id", None)
                })?;
                match self.client.get_file(id).await {
                    Ok(file) => {
                        let data = json!(file);
                        Ok(CallToolResult::success(vec![Content::text(data.to_string())]))
                    }
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            "read_document" => {
                let id = Self::get_arg(&request.arguments, "id").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: id", None)
                })?;
                match self.client.read_content(id).await {
                    Ok(content) => {
                        let data = json!({ "content": content });
                        Ok(CallToolResult::success(vec![Content::text(data.to_string())]))
                    }
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            "create_document" => {
                let name = Self::get_arg(&request.arguments, "name").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: name", None)
                })?;
                let content = Self::get_arg(&request.arguments, "content").unwrap_or("");
                match self.client.create_file(name, content).await {
                    Ok(id) => {
                        let data = json!({ "id": id });
                        Ok(CallToolResult::success(vec![Content::text(data.to_string())]))
                    }
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            "write_document" => {
                let id = Self::get_arg(&request.arguments, "id").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: id", None)
                })?;
                let content = Self::get_arg(&request.arguments, "content").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: content", None)
                })?;
                match self.client.write_file(id, content).await {
                    Ok(_) => {
                        let _ =
                            crate::snapshots::auto_snapshot(&self.client, id, content).await;
                        Ok(CallToolResult::success(vec![Content::text(
                            json!({ "status": "success" }).to_string(),
                        )]))
                    }
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            "list_snapshots" => {
                let id = Self::get_arg(&request.arguments, "id").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: id", None)
                })?;
                match self.client.list_snapshots(id).await {
                    Ok(snapshots) => {
                        let data = json!(snapshots);
                        Ok(CallToolResult::success(vec![Content::text(data.to_string())]))
                    }
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            "restore_snapshot" => {
                let file_id = Self::get_arg(&request.arguments, "file_id").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: file_id", None)
                })?;
                let snapshot_id =
                    Self::get_arg(&request.arguments, "snapshot_id").ok_or_else(|| {
                        ErrorData::invalid_params("Missing required parameter: snapshot_id", None)
                    })?;
                match self.client.restore_snapshot(file_id, snapshot_id).await {
                    Ok(_) => Ok(CallToolResult::success(vec![Content::text(
                        json!({ "status": "success" }).to_string(),
                    )])),
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            // ── Comment tool handlers ──
            "list_comments" => {
                let doc_id = Self::get_arg(&request.arguments, "document_id").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: document_id", None)
                })?;
                match self.client.list_comments(doc_id).await {
                    Ok(data) => Ok(CallToolResult::success(vec![Content::text(data.to_string())])),
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            "add_comment" => {
                let doc_id = Self::get_arg(&request.arguments, "document_id").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: document_id", None)
                })?;
                let text = Self::get_arg(&request.arguments, "text").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: text", None)
                })?;
                let author_name = Self::get_arg(&request.arguments, "author_name").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: author_name", None)
                })?;
                // Use the agent name as author_id (agents don't have user accounts)
                let author_id = author_name.to_string();
                match self.client.add_comment(doc_id, &author_id, author_name, text).await {
                    Ok(data) => Ok(CallToolResult::success(vec![Content::text(data.to_string())])),
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            "resolve_comment" => {
                let comment_id = Self::get_arg(&request.arguments, "comment_id").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: comment_id", None)
                })?;
                match self.client.resolve_comment(comment_id).await {
                    Ok(_) => Ok(CallToolResult::success(vec![Content::text(
                        json!({ "status": "success" }).to_string(),
                    )])),
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            "list_mentions" => {
                let agent_name = Self::get_arg(&request.arguments, "agent_name").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required parameter: agent_name", None)
                })?;
                match self.client.list_mentions(agent_name).await {
                    Ok(data) => Ok(CallToolResult::success(vec![Content::text(data.to_string())])),
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            other => Err(ErrorData::invalid_params(
                format!("Unknown tool: {}", other),
                None,
            )),
        }
    }
}
