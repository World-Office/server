## ADDED Requirements

### Requirement: Deployment companion runs as an Express web application
The OpenCloud integration SHALL be a Node.js / Express application located at `server/integrations/opencloud/` that runs on a configurable port (default 3000) and provides a setup wizard, health dashboard, and configuration API.

#### Scenario: Application starts without .env
- **WHEN** the app starts with no `.env` file present
- **THEN** it SHALL print an informational message and remain available at `/setup`
- **AND** the `/api/health` endpoint SHALL still return a 200 response

#### Scenario: Application starts with valid .env
- **WHEN** the app starts with a valid `.env` containing all required fields
- **THEN** it SHALL start on the configured PORT
- **AND** the `/api/health` endpoint SHALL return service status

### Requirement: Setup wizard generates .env configuration
The setup wizard at `/setup` SHALL present a web form for configuring the entire stack: OCIS domain, Document Server domain, JWT secrets, Docker images, feature toggles, and dashboard port. On submission, it SHALL validate all fields, generate .env content, write it to disk, and re-generate `docker-compose.yml` and OCIS config files.

#### Scenario: Successful setup submission
- **WHEN** the user submits valid form data with auto-generated secrets
- **THEN** the system SHALL write a `.env` file with all required configuration
- **AND** SHALL generate a `docker-compose.yml` file
- **AND** SHALL generate `data/ocis/config/web-ui.json` and `data/ocis/config/idp.json`
- **AND** SHALL redirect to `/setup?success=true`

#### Scenario: Setup with missing OCIS domain
- **WHEN** the user submits the form with an empty OCIS_DOMAIN
- **THEN** the system SHALL re-render the form with a validation error for OCIS_DOMAIN
- **AND** SHALL NOT write any files

#### Scenario: Setup with short JWT secret
- **WHEN** the user submits the form with a JWT secret shorter than 32 characters
- **THEN** the system SHALL re-render the form with a validation error indicating the minimum length

### Requirement: Health dashboard shows service status
The dashboard at `/dashboard` SHALL display the status of all managed Docker containers (OCIS, OCIS Collaboration, Document Server, Traefik) using `docker ps`, and show a summary status banner (All Systems Operational / System Degraded / System Down).

#### Scenario: All containers running
- **WHEN** all 4 container names (`worldoffice-ocis`, `worldoffice-ocis-collaboration`, `worldoffice-documentserver`, `worldoffice-traefik`) are in `running` state
- **THEN** the dashboard SHALL show a green "All Systems Operational" banner
- **AND** each service card SHALL show its status as "Running"

#### Scenario: Some containers stopped
- **WHEN** some containers are stopped but at least one is running
- **THEN** the dashboard SHALL show an amber "System Degraded" banner

#### Scenario: No containers running
- **WHEN** no containers are running
- **THEN** the dashboard SHALL show a red "System Down" banner

### Requirement: Health API returns structured JSON
The `/api/health` endpoint SHALL return a JSON object with overall status, per-service container status, configured domains, and version.

#### Scenario: Health check response format
- **WHEN** a client sends GET /api/health
- **THEN** the response SHALL contain `status`, `services`, `config`, and `version` fields
- **AND** `services` SHALL contain entries for `ocis`, `ocis_collaboration`, `documentserver`, and `traefik`
- **AND** each service entry SHALL have `running`, `container`, and `health` fields

### Requirement: WOPI connectivity check
The `/api/health/wopi` endpoint SHALL attempt to reach the OCIS WOPI discovery endpoint to verify WOPI connectivity.

#### Scenario: WOPI discovery accessible
- **WHEN** the OCIS WOPI discovery endpoint returns status < 500
- **THEN** SHALL return `{ "accessible": true, "statusCode": <code>, "discoveryUrl": <url> }`

#### Scenario: WOPI discovery unreachable
- **WHEN** the OCIS WOPI discovery endpoint cannot be reached
- **THEN** SHALL return `{ "accessible": false, "error": <message>, "discoveryUrl": <url> }`

### Requirement: docker-compose.yml generation
The system SHALL generate a Docker Compose file with four services: Traefik (reverse proxy), OCIS (file sharing), OCIS Collaboration (WOPI service), and Document Server (document editing). The generated file SHALL configure Traefik labels for routing, JWT secrets, and network configuration.

#### Scenario: Generated compose file contains all services
- **WHEN** the user completes the setup wizard
- **THEN** the generated `docker-compose.yml` SHALL contain services for `traefik`, `ocis`, `ocis-collaboration`, and `documentserver`
- **AND** SHALL define the `worldoffice-network` bridge network
- **AND** Traefik SHALL be configured with Docker provider and web/websecure entrypoints

#### Scenario: OCIS service configuration
- **WHEN** the generated compose file is inspected
- **THEN** the OCIS service SHALL have `OCIS_DOMAIN`, `OCIS_JWT_SECRET`, and `OCIS_URL` environment variables set
- **AND** SHALL expose the internal service port
- **AND** SHALL have Traefik routing labels for the configured OCIS_DOMAIN

### Requirement: OCIS configuration files generated
The system SHALL generate OCIS web UI configuration (`web-ui.json`) and identity provider configuration (`idp.json`) with proper WOPI settings.

#### Scenario: web-ui.json generation
- **WHEN** setup completes
- **THEN** `web-ui.json` SHALL contain an `apps.files` section with enabled file management
- **AND** an `editor` section with mimeTypeHandlers for OOXML and ODF formats
- **AND** an `openIdConnect.metadataUrl` pointing to `{OCIS_WOPI_SRC}/.well-known/openid-configuration`

#### Scenario: idp.json generation
- **WHEN** setup completes
- **THEN** `idp.json` SHALL contain an OIDC issuer set to `{OCIS_WOPI_SRC}`
- **AND** an OIDC clientSecret set to `OCIS_JWT_SECRET`
- **AND** basic authentication enabled
