use std::sync::Arc;

use crate::client::StorageClient;
use rmcp::ServerHandler;
use rmcp::model::*;
use rmcp::service::RequestContext;
use serde_json::{Map, Value, json};

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
            // ── ContentLink tools ──
            Tool::new(
                "create_contentlink",
                "Create a cross-document content link. Embeds a live reference from the target document to content in a source document. The resolved content stays in sync as the source document changes.",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "target_document_id": { "type": "string", "description": "ID of the document to add the reference to" },
                        "source_document_id": { "type": "string", "description": "ID of the document whose content to reference" },
                        "source_document_name": { "type": "string", "description": "Human-readable name of the source document" },
                        "target_document_name": { "type": "string", "description": "Human-readable name of the target document" },
                        "display_text": { "type": "string", "description": "Optional display text for the link. Defaults to source document name." }
                    },
                    "required": ["target_document_id", "source_document_id", "source_document_name", "target_document_name"]
                }))),
            ),
            Tool::new(
                "list_contentlinks",
                "List all content links (cross-document references) for a document, including resolved content previews",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "document_id": { "type": "string", "description": "Document ID" }
                    },
                    "required": ["document_id"]
                }))),
            ),
            Tool::new(
                "resolve_contentlink",
                "Re-fetch and cache the resolved content for a content link. Useful when the source document has been updated.",
                Arc::new(object(json!({
                    "type": "object",
                    "properties": {
                        "link_id": { "type": "string", "description": "Content link ID" }
                    },
                    "required": ["link_id"]
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
                    + "Agents can check their @mentions to discover when they've been referenced. "
                    + "Create cross-document content links to embed live references between documents.",
            ),
        }
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        Self::tool_definitions()
            .into_iter()
            .find(|t| t.name == name)
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
                    Ok(CallToolResult::success(vec![Content::text(
                        data.to_string(),
                    )]))
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
                        Ok(CallToolResult::success(vec![Content::text(
                            data.to_string(),
                        )]))
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
                        Ok(CallToolResult::success(vec![Content::text(
                            data.to_string(),
                        )]))
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
                        Ok(CallToolResult::success(vec![Content::text(
                            data.to_string(),
                        )]))
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
                        let _ = crate::snapshots::auto_snapshot(&self.client, id, content).await;
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
                        Ok(CallToolResult::success(vec![Content::text(
                            data.to_string(),
                        )]))
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
                    Ok(data) => Ok(CallToolResult::success(vec![Content::text(
                        data.to_string(),
                    )])),
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
                let author_name =
                    Self::get_arg(&request.arguments, "author_name").ok_or_else(|| {
                        ErrorData::invalid_params("Missing required parameter: author_name", None)
                    })?;
                // Use the agent name as author_id (agents don't have user accounts)
                let author_id = author_name.to_string();
                match self
                    .client
                    .add_comment(doc_id, &author_id, author_name, text)
                    .await
                {
                    Ok(data) => Ok(CallToolResult::success(vec![Content::text(
                        data.to_string(),
                    )])),
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            "resolve_comment" => {
                let comment_id =
                    Self::get_arg(&request.arguments, "comment_id").ok_or_else(|| {
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
                let agent_name =
                    Self::get_arg(&request.arguments, "agent_name").ok_or_else(|| {
                        ErrorData::invalid_params("Missing required parameter: agent_name", None)
                    })?;
                match self.client.list_mentions(agent_name).await {
                    Ok(data) => Ok(CallToolResult::success(vec![Content::text(
                        data.to_string(),
                    )])),
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            // ── ContentLink tool handlers ──
            "create_contentlink" => {
                let target_doc_id = Self::get_arg(&request.arguments, "target_document_id")
                    .ok_or_else(|| {
                        ErrorData::invalid_params("Missing required: target_document_id", None)
                    })?;
                let source_doc_id = Self::get_arg(&request.arguments, "source_document_id")
                    .ok_or_else(|| {
                        ErrorData::invalid_params("Missing required: source_document_id", None)
                    })?;
                let source_name = Self::get_arg(&request.arguments, "source_document_name")
                    .ok_or_else(|| {
                        ErrorData::invalid_params("Missing required: source_document_name", None)
                    })?;
                let target_name = Self::get_arg(&request.arguments, "target_document_name")
                    .ok_or_else(|| {
                        ErrorData::invalid_params("Missing required: target_document_name", None)
                    })?;
                let display_text =
                    Self::get_arg(&request.arguments, "display_text").unwrap_or(source_name);

                match self
                    .client
                    .create_content_link(
                        target_doc_id,
                        source_doc_id,
                        source_name,
                        target_name,
                        display_text,
                    )
                    .await
                {
                    Ok(data) => Ok(CallToolResult::success(vec![Content::text(
                        data.to_string(),
                    )])),
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            "list_contentlinks" => {
                let doc_id = Self::get_arg(&request.arguments, "document_id").ok_or_else(|| {
                    ErrorData::invalid_params("Missing required: document_id", None)
                })?;
                match self.client.list_content_links(doc_id).await {
                    Ok(data) => Ok(CallToolResult::success(vec![Content::text(
                        data.to_string(),
                    )])),
                    Err(e) => Ok(Self::error_result(e.to_string())),
                }
            }
            "resolve_contentlink" => {
                let link_id = Self::get_arg(&request.arguments, "link_id")
                    .ok_or_else(|| ErrorData::invalid_params("Missing required: link_id", None))?;
                match self.client.resolve_content_link(link_id).await {
                    Ok(data) => Ok(CallToolResult::success(vec![Content::text(
                        data.to_string(),
                    )])),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_definitions_returns_14_tools() {
        assert_eq!(McpTools::tool_definitions().len(), 14);
    }

    #[test]
    fn tool_names_are_correct() {
        let tools = McpTools::tool_definitions();
        let names: Vec<&str> = tools.iter().map(|t| t.name.as_ref()).collect();
        assert_eq!(
            names,
            vec![
                "list_documents",
                "get_document_info",
                "read_document",
                "create_document",
                "write_document",
                "list_snapshots",
                "restore_snapshot",
                "list_comments",
                "add_comment",
                "resolve_comment",
                "list_mentions",
                "create_contentlink",
                "list_contentlinks",
                "resolve_contentlink",
            ]
        );
    }

    #[test]
    fn write_document_requires_id_and_content() {
        let tools = McpTools::tool_definitions();
        let t = tools
            .iter()
            .find(|t| t.name.as_ref() == "write_document")
            .unwrap();
        let required: Vec<&str> = t
            .input_schema
            .get("required")
            .and_then(|v| v.as_array())
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(required, vec!["id", "content"]);
    }

    #[test]
    fn add_comment_requires_document_id_text_author_name() {
        let tools = McpTools::tool_definitions();
        let t = tools
            .iter()
            .find(|t| t.name.as_ref() == "add_comment")
            .unwrap();
        let required: Vec<&str> = t
            .input_schema
            .get("required")
            .and_then(|v| v.as_array())
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(required, vec!["document_id", "text", "author_name"]);
    }

    #[test]
    fn create_contentlink_requires_four_params() {
        let tools = McpTools::tool_definitions();
        let t = tools
            .iter()
            .find(|t| t.name.as_ref() == "create_contentlink")
            .unwrap();
        let required: Vec<&str> = t
            .input_schema
            .get("required")
            .and_then(|v| v.as_array())
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(
            required,
            vec![
                "target_document_id",
                "source_document_id",
                "source_document_name",
                "target_document_name",
            ]
        );
    }

    #[test]
    fn list_documents_has_no_required_params() {
        let tools = McpTools::tool_definitions();
        let t = tools
            .iter()
            .find(|t| t.name.as_ref() == "list_documents")
            .unwrap();
        let required: Vec<serde_json::Value> = t
            .input_schema
            .get("required")
            .and_then(|v| v.as_array())
            .unwrap()
            .to_vec();
        assert!(required.is_empty());
    }

    #[test]
    fn get_arg_returns_some_for_present_key() {
        let mut map = Map::new();
        map.insert("key".into(), Value::String("val".into()));
        assert_eq!(McpTools::get_arg(&Some(map), "key"), Some("val"));
    }

    #[test]
    fn get_arg_returns_none_for_missing_key() {
        let mut map = Map::new();
        map.insert("a".into(), Value::String("b".into()));
        assert_eq!(McpTools::get_arg(&Some(map), "missing"), None);
    }

    #[test]
    fn get_arg_returns_none_when_args_is_none() {
        assert_eq!(McpTools::get_arg(&None, "key"), None);
    }

    #[test]
    fn error_result_sets_is_error() {
        let result = McpTools::error_result("fail".into());
        assert_eq!(result.is_error, Some(true));
    }

    #[test]
    fn error_result_contains_message() {
        let result = McpTools::error_result("something went wrong".into());
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["content"][0]["text"], "something went wrong");
    }

    #[test]
    fn server_info_contains_correct_metadata() {
        let client = crate::client::StorageClient::new("http://localhost:9999".into());
        let handler = McpTools::new(client);
        let info = handler.get_info();
        assert_eq!(info.server_info.name, "World Office MCP Server");
        assert_eq!(info.server_info.version, "0.1.0");
        assert!(info.instructions.is_some());
    }

    #[test]
    fn get_tool_returns_matching_tool() {
        let client = crate::client::StorageClient::new("http://localhost:9999".into());
        let handler = McpTools::new(client);
        let tool = handler.get_tool("list_documents");
        assert!(tool.is_some());
        assert_eq!(tool.unwrap().name.as_ref(), "list_documents");
    }

    #[test]
    fn get_tool_returns_none_for_unknown() {
        let client = crate::client::StorageClient::new("http://localhost:9999".into());
        let handler = McpTools::new(client);
        assert!(handler.get_tool("nonexistent_tool").is_none());
    }
}
