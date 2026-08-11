## 1. AI Integration — Admin Panel Frontend (as TypeScript React pages)

- [x] 1.1 Create AiChat page component in `services/admin-panel/src/pages/AiChat/` with TypeScript React
- [x] 1.2 Create AiProviders page component for AI provider management (add/edit/delete providers)
- [x] 1.3 Create AiSettings page component for AI configuration (timeout, CORS, proxy URL)
- [x] 1.4 Implement provider validation on add (test API key with a lightweight request)
- [x] 1.5 Register routes and navigation links for all 3 AI pages in the admin panel router

## 2. AI Integration — Backend Proxy

- [x] 2.1 Port `aiProxyHandler.js` from Euro-Office into `services/server/DocService/sources/ai/`
- [x] 2.2 Implement provider credential storage (encrypted API keys in config)
- [x] 2.3 Add AI proxy endpoint route to DocService router
- [x] 2.4 Add streaming response support for providers that support SSE

## 3. AdminPanel Feature Pages (as TypeScript React, following existing patterns)

- [x] 3.1 Create WOPI Settings page component (`WOPISettings.tsx`) with settings form
- [x] 3.2 Create Security Settings page (`SecuritySettings.tsx` — password policy, TLS, rate limiting)
- [x] 3.3 Create Access Rules page (`AccessRules.tsx` — IP allow/deny lists)
- [x] 3.4 Create File Limits page (`FileLimits.tsx` — upload size, allowed extensions)
- [x] 3.5 Create Logger Config page (`LoggerConfig.tsx` — log level, retention, output)
- [x] 3.6 Create Expiration page (`Expiration.tsx` — session timeout, JWT expiration)
- [x] 3.7 Create Health Check page (`HealthCheck.tsx` — backend service status display)
- [x] 3.8 Create Request Filtering page (`RequestFiltering.tsx` — URL allow/deny)
- [x] 3.9 Create Notification Config page (`NotificationConfig.tsx` — email templates)

## 4. SeaweedFS Storage Backend

- [x] 4.1 Port `storage-seaweedfs.js` into `services/server/Common/sources/storage/`
- [x] 4.2 Implement the existing storage backend interface (upload, download, delete, list)
- [x] 4.3 Add SeaweedFS configuration options (master URL, volume server URLs, replication strategy)

## 5. Dameng Database Connector

- [x] 5.1 Port `damengConnector.js` into `services/server/DocService/sources/databaseConnectors/`
- [x] 5.2 Implement the same interface as existing MSSQL and Oracle connectors (query, execute, connect, disconnect)
- [x] 5.3 Verify Dameng JDBC driver availability and document npm dependency

## 6. Messaging Backends

- [x] 6.1 Port `activeMQCore.js` into `services/server/Common/sources/` (connect, publish, subscribe, disconnect)
- [x] 6.2 Port `rabbitMQCore.js` into `services/server/Common/sources/` (connect, publish, subscribe, disconnect)
- [x] 6.3 Implement common messaging interface for interchangeability with NATS

## 7. Notification & Mail Services

- [x] 7.1 Port `notificationService.js` into `services/server/Common/sources/` (create, deliver, list notifications)
- [x] 7.2 Port `mailService.js` into `services/server/Common/sources/` (send, template rendering, SMTP config)
- [x] 7.3 Implement notification delivery channels (email, push) with configurable routing

## 8. Tenant Management

- [x] 8.1 Port `tenantManager.js` into `services/server/Common/sources/` (create, configure, isolate tenants)
- [x] 8.2 Implement tenant-scoped data isolation for storage and configuration
- [x] 8.3 Add tenant CRUD API endpoints to the admin panel backend

## 9. Verification

- [x] 9.1 Verify all AI Integration specs against the running admin panel
- [x] 9.2 Verify all AdminPanel feature pages render and interact with API endpoints
- [x] 9.3 Verify Dameng connector loads without errors
