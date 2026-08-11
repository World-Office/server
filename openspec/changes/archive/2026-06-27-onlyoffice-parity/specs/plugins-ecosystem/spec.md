## ADDED Requirements

### Requirement: MCP server SHALL expose a plugin discovery mechanism

The MCP server in `services/mcp-server/` SHALL support discovery of available MCP tool servers through a manifest registry. This allows third-party extensions to register themselves without modifying core code.

#### Scenario: List available plugins
- **WHEN** an admin requests available plugins from the MCP server
- **THEN** the server returns a list of all registered MCP tool servers with their capabilities

#### Scenario: Register a new plugin
- **WHEN** a new MCP tool server is added to the plugin registry
- **THEN** the MCP server SHALL recognize its tool definitions and make them available to clients

#### Scenario: Plugin with invalid schema
- **WHEN** a plugin MCP server provides a malformed tool schema
- **THEN** the MCP server SHALL reject the plugin and log the validation error

### Requirement: Web editor SHALL integrate with MCP tools via a bridge

The editor shell (`apps/web/apps/editor-shell/`) SHALL provide an MCP bridge that connects the editor UI to available MCP tools. This replaces the old sdkjs-plugins integration point.

#### Scenario: Editor loads with MCP bridge
- **WHEN** the editor loads in the browser
- **THEN** it SHALL establish a connection to the MCP client and enumerate available tools

#### Scenario: Tool button appears in editor toolbar
- **WHEN** an MCP tool is registered with a UI trigger
- **THEN** the editor toolbar SHALL display the tool's action button

#### Scenario: Tool executes via MCP protocol
- **WHEN** a user triggers an MCP tool from the editor
- **THEN** the MCP bridge SHALL call the tool via the MCP protocol and return the result

#### Scenario: Tool result rendered in editor
- **WHEN** an MCP tool returns a result (e.g., formatted text, translation, image)
- **THEN** the editor SHALL render the result in the document at the cursor position

### Requirement: Admin panel SHALL allow configuring MCP tool endpoints

The admin panel (`services/admin-panel/`) SHALL provide a configuration page for MCP tool servers, allowing admins to add, remove, and test external MCP connections.

#### Scenario: Add MCP tool server endpoint
- **WHEN** an admin enters an MCP server URL in the admin panel
- **THEN** the system SHALL validate the connection by listing its tools
- **AND** register the tool server in the MCP registry if valid

#### Scenario: Remove MCP tool server
- **WHEN** an admin removes a registered MCP tool server
- **THEN** its tools SHALL no longer be available to editors

#### Scenario: Test MCP connection
- **WHEN** an admin clicks "Test Connection" for an MCP server
- **THEN** the system SHALL attempt to connect and report success/failure

### Requirement: MCP tools SHALL be sandboxed from core editor logic

Each MCP tool server SHALL run as a separate process. The MCP server SHALL NOT allow plugins to directly manipulate the DOM or access the editor's internal state.

#### Scenario: Plugin process isolation
- **WHEN** a plugin MCP server process crashes
- **THEN** the MCP server SHALL continue running without affecting other tools or the editor

#### Scenario: Plugin resource limits
- **WHEN** a plugin exceeds configured resource limits (memory, execution time)
- **THEN** the MCP server SHALL terminate the plugin process gracefully
