## Context

World-Office (`main`) and Euro-Office (`brand/euro-office`) share a common heritage but have diverged. The parity analysis at `plan/euro-office-world-office-feature-parity-spec.md` identifies 14 items Euro-Office has that World-Office needs to port. This design covers the implementation approach for each port item, organized by priority.

Existing World-Office architecture: Rust core (19 format crates) + TypeScript monorepo (Turbo). DocService, FileConverter, Common, and the old AdminPanel JS backend live at `services/server/`. A newer TypeScript admin panel lives at `services/admin-panel/`.

## Goals / Non-Goals

**Goals:**
- Port AI Integration (chat UI + proxy) from Euro-Office AdminPanel to World-Office TypeScript admin panel
- Add 9 missing AdminPanel feature pages (WOPI Settings, Security Settings, Access Rules, File Limits, Logger Config, Expiration, Health Check, Request Filtering, Notification Config)
- Add SeaweedFS storage backend, Dameng DB connector, messaging backends (ActiveMQ/RabbitMQ), notification/mail services, and tenant management

**Non-Goals:**
- Not porting License management (AGPL-incompatible)
- Not porting CI workflows (Forgejo vs GitHub Actions — different platform)
- Not porting SQL schemas or pre-commit hooks (operational, not feature gaps)
- Not modifying Rust core, E2E test infrastructure, or deployment configs
- No changes to the existing AI MCP server (`services/mcp-server/`)

## Decisions

### D1: AI Integration → TypeScript React rewrite, not direct copy
Euro-Office AI is a JS plugin (plain JS + HTML, Webpack build). World-Office admin panel is TypeScript + React (Vite). Direct copy is impossible — must rewrite the components as TypeScript React.
- **Alternative considered**: Embed Euro-Office JS plugin via iframe — rejected due to poor UX and integration challenges
- **Decision**: Rewrite AiChat, AiProviders, AiSettings pages as TypeScript React components following existing patterns in `services/admin-panel/src/`

### D2: AI Proxy → extend DocService or create standalone service
Euro-Office has `DocService/sources/ai/aiProxyHandler.js` as a backend proxy for editor AI requests.
- **Alternative A**: Extend World-Office DocService's existing `/docservice/ai` proxy — chosen. The Euro-Office proxy is already a Node.js module in DocService, and World-Office has the same DocService at `services/server/DocService/`.
- **Alternative B**: Create a new AI proxy service — rejected, adds deployment complexity
- **Decision**: Port `aiProxyHandler.js` into `services/server/DocService/sources/ai/` with minimal changes

### D3: AdminPanel feature pages → new TypeScript routes
The 9 missing pages are configuration/management interfaces backed by the existing admin API at `services/server/AdminPanel/`.
- **Decision**: Each page gets a new React component in `services/admin-panel/src/pages/` and a route in the router. Backend API endpoints already exist for most (config GET/PATCH, WOPI key rotation, system logs) — only frontend components are new.

### D4: SeaweedFS → storage connector module
Euro-Office has `Common/sources/storage/storage-seaweedfs.js`. World-Office's `services/server/Common/` already exists.
- **Decision**: Directly port the SeaweedFS connector into `services/server/Common/sources/storage/`. SeaweedFS deploys as a Docker container (master + volume server). The connector uses the HTTP API for file operations.

### D5: Dameng connector → follow existing DB connector pattern
- **Decision**: Port `damengConnector.js` into `services/server/DocService/sources/databaseConnectors/`. The connector follows the same interface as the existing MSSQL and Oracle connectors already present there.

### D6: Messaging backends → Common/sources modules
- **Decision**: Port `activeMQCore.js` and `rabbitMQCore.js` into `services/server/Common/sources/`. These are thin wrappers around standard message queue client libraries.

### D7: Notification/Mail services → Common/sources modules
- **Decision**: Port `notificationService.js` and `mailService.js` into `services/server/Common/sources/`. These provide email and push notification infrastructure.

### D8: Tenant management → Common/sources module
- **Decision**: Port `tenantManager.js` into `services/server/Common/sources/`. Provides organization-scoped isolation for multi-tenancy.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| AI Integration rewrite may miss euro-office features | Reference test cases from euro-office AdminPanel CI |
| SeaweedFS connector may need adaptation for WO's storage abstraction layer | Follow existing storage interface (look at storage-fs.js, storage-s3.js patterns) |
| Dameng JDBC driver unavailable in npm | Use `node-jt400` or native JDBC bridge — fallback: mark as optional connector |
| AdminPanel feature pages depend on backend API endpoints | Verify each page's API requirements against existing `AdminPanel` backend before building |
| Old AdminPanel (`services/server/AdminPanel/`) vs new (`services/admin-panel/`) confusion | Target the new TypeScript frontend unless the page maps to old JS backend only |
