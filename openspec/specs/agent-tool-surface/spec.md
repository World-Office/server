# agent-tool-surface Specification

## Purpose
Model-agnostic tool surface that lets AI agents discover and act on World-Office documents
through the existing WOPI and collaboration APIs.

## Requirements

### Requirement: Document operations are exposed as agent tools
<!-- The server must advertise the operations an agent needs to read and edit documents. -->

#### Scenario: agent discovers available tools
- **WHEN** an MCP-compatible agent connects to the tool surface
- **THEN** it can discover tools for `read_doc`, `apply_ops`, `get_versions`, `lock`, and `presence`

### Requirement: Tools are model-agnostic
<!-- No agent framework or vendor should require custom server code. -->

#### Scenario: any MCP agent can call the tools
- **WHEN** any MCP-compatible agent framework connects
- **THEN** it can call the tools without vendor-specific server code

### Requirement: Tool actions respect the store and lock control plane
<!-- Agents must not get a privileged write path. -->

#### Scenario: agent writes to a locked document without the token
- **WHEN** an agent calls `apply_ops` on a document that is locked by another client, without supplying the lock token
- **THEN** the call is rejected with the same `409` lock-mismatch contract returned to a human client

#### Scenario: agent reads a missing document
- **WHEN** an agent calls `read_doc` for an unknown document id
- **THEN** the tool returns a clear not-found result, not a server error
