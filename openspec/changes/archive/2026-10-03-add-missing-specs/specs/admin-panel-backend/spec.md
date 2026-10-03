## ADDED Requirements

### Requirement: Admin panel backend provides authentication endpoints
The admin panel backend at `services/server/AdminPanel/server/sources/routes/adminpanel/router.js` SHALL provide endpoints for setup, login, logout, password change, and session verification.

#### Scenario: GET /admin/api/v1/setup/required checks setup state
- **WHEN** a client requests the setup/required endpoint
- **THEN** the server SHALL return `{ setupRequired: <bool>, passwordValidationSchema: <object> }`
- **AND** if setup is required, SHALL lazily generate a bootstrap token if one doesn't exist

#### Scenario: POST /admin/api/v1/setup completes initial setup
- **WHEN** a client posts a valid bootstrap token and password
- **THEN** the server SHALL validate the password against the configured rules
- **AND** SHALL save the admin password
- **AND** SHALL invalidate the bootstrap token
- **AND** SHALL return a JWT access token as an httpOnly cookie

#### Scenario: POST /admin/api/v1/login authenticates admin
- **WHEN** a client posts the correct admin password
- **THEN** the server SHALL verify the password via `passwordManager.verifyAdminPassword()`
- **AND** SHALL set an httpOnly JWT cookie with admin claims
- **AND** SHALL return `{ tenant: "localhost", isAdmin: true }`

#### Scenario: POST /admin/api/v1/login rejects wrong password
- **WHEN** a client posts an incorrect password
- **THEN** the server SHALL log the failed attempt
- **AND** SHALL return HTTP 401 with `{ error: "Invalid password" }`

#### Scenario: GET /admin/api/v1/me returns auth status
- **WHEN** an authenticated client requests the /me endpoint
- **THEN** the server SHALL return `{ authorized: true, tenant: "localhost", isAdmin: true }`

#### Scenario: POST /admin/api/v1/change-password updates password
- **WHEN** an authenticated admin posts current and new passwords
- **THEN** the server SHALL verify the current password
- **AND** SHALL save the new password

### Requirement: Admin panel backend provides JWT generation for Document Server
The admin panel backend SHALL generate JWT tokens for secure communication with the Document Server.

#### Scenario: POST /generate-docserver-token creates JWT
- **WHEN** an authenticated admin posts a payload to generate-docserver-token
- **THEN** the server SHALL retrieve the inbox secret from `tenantManager`
- **AND** SHALL sign a JWT with the configured algorithm and expiration
- **AND** SHALL return `{ token: "<jwt>" }`

### Requirement: Admin panel backend provides configuration CRUD
The admin panel backend SHALL expose REST endpoints for reading and updating the runtime configuration via PATCH /admin/api/v1/config.

#### Scenario: GET /admin/api/v1/config returns current config
- **WHEN** an authenticated client requests the config endpoint
- **THEN** the server SHALL return the current configuration from `runtimeConfigManager`

#### Scenario: PATCH /admin/api/v1/config updates configuration
- **WHEN** an authenticated client POSTs a ConfigPatch to the config endpoint
- **THEN** the server SHALL apply the configuration change via `runtimeConfigManager`
- **AND** SHALL return the updated configuration

### Requirement: Admin panel backend provides health monitoring
The admin panel backend SHALL expose the system health status via endpoints at the admin API.

#### Scenario: GET /health returns system status
- **WHEN** any client requests the health endpoint
- **THEN** the server SHALL return health check results

### Requirement: Admin panel backend provides AI provider management
The admin panel backend SHALL expose endpoints for managing AI providers, including listing and updating provider configurations.

#### Scenario: GET /admin/api/v1/ai/providers lists providers
- **WHEN** an authenticated client requests AI providers
- **THEN** the server SHALL return the list of configured AI providers

#### Scenario: PUT /admin/api/v1/ai/providers updates a provider
- **WHEN** an authenticated client sends an updated provider configuration
- **THEN** the server SHALL update the provider configuration
- **AND** SHALL return the updated provider list

### Requirement: Admin panel backend provides WOPI key rotation
The admin panel backend SHALL provide an endpoint to rotate WOPI keys.

#### Scenario: POST /admin/api/v1/wopi/rotate-keys rotates keys
- **WHEN** an authenticated admin requests key rotation
- **THEN** the server SHALL generate new WOPI keys

### Requirement: Admin panel backend provides system logs
The admin panel backend SHALL provide an endpoint to retrieve system logs.

#### Scenario: GET /admin/api/v1/logs returns logs
- **WHEN** an authenticated client requests system logs
- **THEN** the server SHALL return log entries from the configured log directory
