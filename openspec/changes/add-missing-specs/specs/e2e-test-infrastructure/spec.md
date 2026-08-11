## ADDED Requirements

### Requirement: E2E tests run against a full Docker Compose stack
The test infrastructure at `server/tests/` SHALL define a Docker Compose stack (`docker-compose.test.yml`) that includes a Document Server (WOPI client) and OCIS (WOPI host) for end-to-end testing.

#### Scenario: Docker Compose stack starts all services
- **WHEN** the E2E test stack is started with `docker compose -f docker-compose.test.yml up -d`
- **THEN** the `documentserver` container SHALL start on port 8080 with WOPI enabled
- **AND** the `ocis` container SHALL start on port 9200 with basic auth
- **AND** the OCIS service SHALL have COLLABORATION_WOPI_SRC configured to point to the Document Server

#### Scenario: Document Server health check passes
- **WHEN** the Document Server container is healthy
- **THEN** the `/hosting/discovery` endpoint SHALL return a 200 status

#### Scenario: OCIS health check passes
- **WHEN** the OCIS container is healthy
- **THEN** the `/health` endpoint on port 9200 SHALL return a 200 status

### Requirement: E2E tests use Playwright and Jest
The test suite SHALL use Playwright for browser automation and Jest as the test runner.

#### Scenario: E2E test runs against running stack
- **WHEN** `npm test` is executed from `server/tests/`
- **THEN** Playwright SHALL open a browser and navigate to the test URLs
- **AND** SHALL verify that the Document Server loads
- **AND** SHALL verify WOPI discovery endpoint is accessible from the Document Server

### Requirement: JWT secrets are shared between services
The E2E test stack SHALL configure matching JWT secrets across Document Server and OCIS to enable WOPI authentication.

#### Scenario: Shared JWT enables WOPI flow
- **WHEN** OCIS requests a WOPI editing session from Document Server
- **THEN** the JWT signed by OCIS SHALL be validated by Document Server using the shared secret

### Requirement: Tests clean up after themselves
The E2E test infrastructure SHALL clean up Docker containers and volumes after test completion.

#### Scenario: Docker stack is torn down
- **WHEN** the E2E test run completes (success or failure)
- **THEN** the Docker containers SHALL be stopped and removed
- **AND** the test volumes SHALL be removed
