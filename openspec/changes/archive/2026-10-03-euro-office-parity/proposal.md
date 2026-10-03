## Why

World-Office has a `brand/euro-office` fork that contains features not yet ported to `main`. The most significant gaps are the AI Integration UI (14 providers) and 9 AdminPanel feature pages. Closing these gaps eliminates the fork's lead and consolidates development on `main`.

## What Changes

- Port **AI Integration** from Euro-Office AdminPanel (14 provider chat UI + backend proxy) into World-Office's TypeScript admin panel
- Add **9 missing AdminPanel feature pages**: WOPI Settings, Security Settings, Access Rules, File Limits, Logger Config, Expiration, Health Check, Request Filtering, Notification Config
- Add **SeaweedFS storage backend** (self-hosted S3-compatible distributed file store)
- Add **Dameng database connector** (only missing DB connector)
- Add **ActiveMQ + RabbitMQ messaging backends** as alternatives to internal NATS
- Add **Notification + Mail service** infrastructure (email/push)
- Add **Tenant management** for multi-tenancy support

## Capabilities

### New Capabilities
- `ai-integration`: Enhanced AI Integration — browser-based AI chat UI in AdminPanel with 14 provider support, plus AI proxy endpoint in DocService for editor integration
- `admin-panel-feature-pages`: 9 additional AdminPanel configuration and management pages
- `seaweedfs-storage`: Self-hosted distributed file storage backend via SeaweedFS
- `dameng-db-connector`: Dameng (达梦) database connector for DocService
- `messaging-backends`: ActiveMQ and RabbitMQ message queue support
- `notification-mail-services`: Email and push notification infrastructure services
- `tenant-management`: Multi-tenancy support for hosting multiple organizations

### Modified Capabilities
- `admin-panel-backend`: Add backend API endpoints and configuration for the 9 new feature pages
- `db-connectors` (plan/specs/db-connectors.md): Add Dameng connector requirements
- `ai-integration` (plan/specs/ai-integration.md): Upgrade requirements from simple POST/response proxy to full AI chat UI with SSE streaming and provider management

## Impact

- **AdminPanel frontend** (`services/admin-panel/`): New pages and AI UI components
- **DocService/Common** (`services/server/`): New storage, database, and messaging connector modules
- **Backend API** (`services/server/AdminPanel/`): New configuration endpoints for feature pages
- **No changes** to Rust core, E2E tests, or deployment infrastructure
