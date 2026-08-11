## Why

The project has 7 spec documents in `plan/specs/` covering admin-pages, AI integration, cross-cutting concerns, DB connectors, PDF signing, SeaweedFS storage, and spellchecker. However, entire subsystems are undocumented: the OpenCloud deployment companion, WOPI collaboration service, Document Server, admin panel backend APIs, and E2E test infrastructure. Without specs for these, onboarding, implementation decisions, and cross-team communication lack a single source of truth.

## What Changes

- Create 5 new capability specs in `plan/specs/`:
  - `opencloud-integration.md` — deployment companion (setup wizard, dashboard, Docker Compose generation, OCIS config)
  - `wopi-collaboration.md` — WOPI protocol flow between OCIS (host) and Document Server (client)
  - `document-server.md` — document editing server, conversion pipeline, co-authoring
  - `admin-panel-backend.md` — backend REST APIs that power the admin panel
  - `e2e-test-infrastructure.md` — test stack, Docker Compose, Playwright test patterns
- Archive or refresh any spec in `plan/specs/` that has drifted from reality
- No breaking changes — existing specs remain intact, only additions

## Capabilities

### New Capabilities
- `opencloud-integration`: Deployment companion at `server/integrations/opencloud/` — Express app that generates Docker Compose stacks (Traefik + OCIS + Document Server), provides setup wizard, health dashboard, and OCIS config files for the cloud.graphwiz.ai demo.
- `wopi-collaboration`: WOPI protocol implementation — OCIS as WOPI Host, Document Server as WOPI Client. Covers discovery, JWT auth, file locking, co-authoring session management, and the `wo-wopi` Rust service.
- `document-server`: Document editing server at `services/server/` — document conversion pipeline (FileConverter), co-authoring service (DocService with DocBuilder CLI), storage backends, and editor embedding.
- `admin-panel-backend`: Backend API layer powering the React admin panel — REST endpoints for config CRUD, health monitoring, AI provider management, WOPI key rotation, system logs, user/document management.
- `e2e-test-infrastructure`: Test stack at `server/tests/` — Docker Compose with OCIS + Document Server, Playwright test suite, nginx TLS gateway, and test patterns for WOPI document editing flow.

### Modified Capabilities
- *(none — existing specs are up to date and don't require requirement changes)*

## Impact

- Affected directories: `plan/specs/`, `server/integrations/opencloud/`, `server/services/server/`, `server/tests/`
- No code changes — only documentation/spec files
- No dependency changes
- No API changes
- No migration needed
