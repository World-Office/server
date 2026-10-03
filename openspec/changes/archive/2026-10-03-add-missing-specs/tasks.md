## 1. OpenCloud Integration Spec Sync

- [x] 1.1 Read `server/integrations/opencloud/` key files (app.js, routes/*, lib/*, views/*) to verify spec accuracy
- [x] 1.2 Run the companion app locally to verify setup wizard, dashboard, and API endpoints respond correctly
- [x] 1.3 Sync `specs/opencloud-integration/spec.md` to `plan/specs/opencloud-integration/`

## 2. WOPI Collaboration Spec Sync

- [x] 2.1 Read `core/crates/wo-wopi/src/` to verify WOPI endpoint descriptions against actual code
- [x] 2.2 Read `core/crates/wo-docserver/src/` to verify proxy, discovery, and conversion specs
- [x] 2.3 Run `cargo test -p wo-wopi -p wo-docserver` to confirm tests exist and pass (46 + 12 tests pass)
- [x] 2.4 Sync `specs/wopi-collaboration/spec.md` to `plan/specs/wopi-collaboration/`

## 3. Document Server Spec Sync

- [x] 3.1 Read `services/server/` to verify DocBuilder CLI, DocService, and FileConverter descriptions
- [x] 3.2 Verify storage backends at `services/server/Common/sources/storage/` exist as described
- [x] 3.3 Verify PDF signing files at `core-enterprise/crates/wo-digital-signature/` exist as described
- [x] 3.4 Sync `specs/document-server/spec.md` to `plan/specs/document-server/`

## 4. Admin Panel Backend Spec Sync

- [x] 4.1 Read `services/server/AdminPanel/` to verify auth, config, and API endpoint descriptions
- [x] 4.2 Verify admin panel frontend at `services/admin-panel/` hooks and pages
- [x] 4.3 Run `tsc --noEmit` in services/admin-panel/ to confirm zero type errors
- [x] 4.4 Sync `specs/admin-panel-backend/spec.md` to `plan/specs/admin-panel-backend/`

## 5. E2E Test Infrastructure Spec Sync

- [x] 5.1 Read `server/tests/docker-compose.test.yml` to verify stack configuration descriptions
- [x] 5.2 Check test scripts in `server/tests/` for Playwright/Jest setup
- [x] 5.3 Sync `specs/e2e-test-infrastructure/spec.md` to `plan/specs/e2e-test-infrastructure/`

## 6. Final Validation

- [x] 6.1 All 5 spec files synced to `plan/specs/`
- [x] 6.2 All spec files verified against actual codebase (cargo tests pass: wo-wopi 46, wo-docserver 12, conversion-service 14, storage-service 16; tsc --noEmit 0 errors)
- [x] 6.3 Verify all existing specs in `plan/specs/` are still intact (no overwrites)
