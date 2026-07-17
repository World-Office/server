# WORLD-OFFICE-NEXTCLOUD

**Generated:** 2026-03-31
**Source:** codeberg.org/World-Office/server (independent rewrite)
**Files:** ~153 | **License:** Apache-2.0 | **Version:** 11.0.0

## OVERVIEW

Nextcloud app that integrates World Office Document Server — enables editing DOCX/XLSX/PPTX/PDF from within Nextcloud with co-editing, track changes, watermarks, and 50+ format support.

## STRUCTURE

```
worldoffice-nextcloud/
├── appinfo/info.xml          # App metadata (NC 33-34, namespace: Worldoffice)
├── lib/                      # PHP backend
│   ├── Controller/EditorController.php  # Main editor endpoint
│   ├── AdminSettings.php     # Admin panel settings
│   ├── AppConfig.php         # App configuration
│   ├── DocumentService.php   # DocServer communication
│   ├── Crypt.php             # JWT token handling
│   ├── Hooks.php              # Nextcloud file hooks
│   ├── Preview.php            # Document preview generation
│   ├── FileCreator.php        # New file creation (doc/xls/ppt)
│   └── Cron/EditorsCheck.php # Background health check
├── src/                      # JS frontend (Vue 3 + Vite)
├── templates/                # PHP templates (editor.php)
├── l10n/                     # Translations
├── test-env/                 # Docker Compose test environment
├── .eslintrc.js              # ESLint config
├── .stylelintrc.json         # Stylelint config
├── composer.json             # PHP deps (firebase/php-jwt ^6.0, PHP 8.1-8.4)
└── package.json              # JS deps (@nextcloud/*, Vue 3.5, Vite 7)
```

## ARCHITECTURE: WOPI-First Bridge

The Nextcloud integration uses a **WOPI-first** architecture with DocsAPI fallback:

```
Nextcloud PHP (EditorController)
  │
  ├── Detection: WOPI or DocsAPI?
  │   ├── useWopi=true  → WOPI bridge (default)
  │   └── useWopi=false → DocsAPI fallback (backward compat, ?use_docsapi=true)
  │
  ├── WOPI Path (default):
  │   ├── EditorController generates WOPI access token (JWT)
  │   ├── editor.php renders data attributes (usewopi, access_token, file_id, etc.)
  │   ├── editor.js detects useWopi → calls initWopiEditor()
  │   └── React editor loads in iframe from wo-docserver/editors/{type}/
  │       ├── PostMessage bridge for lifecycle events
  │       └── WOPI PutFile for auto-save (debounced 3s)
  │
  └── DocsAPI Path (legacy):
      ├── EditorController builds DocsAPI config JSON
      ├── editor.php loads api.js from document server
      └── DocsAPI.DocEditor initializes in iframe
```

### WOPI Flow

1. User opens file → `EditorController::indexAction()` generates JWT with `file_id`, `user_id`, expiry
2. `editor.php` renders `#iframeEditor` with WOPI data attributes
3. `editor.js` detects `data-usewopi="true"` → calls `initWopiEditor()`
4. Editor iframe loads from `wo-docserver/editors/{type}/?access_token=...&file_id=...&embedded=true`
5. React editor runs in embedded mode (minimal chrome) with postMessage bridge
6. Auto-save: document changes trigger debounced WOPI PutFile to Nextcloud WOPI host
7. On close: postMessage protocol triggers save-then-exit

### WOPI Endpoints (Nextcloud PHP)

| Route | Controller Method | Description |
|-------|------------------|-------------|
| `GET  /wopi/files/{fileId}` | `WOPIController::checkFileInfo()` | File metadata JSON |
| `GET  /wopi/files/{fileId}/contents` | `WOPIController::getContents()` | Raw file bytes |
| `PUT  /wopi/files/{fileId}/contents` | `WOPIController::putContents()` | Save file |
| `POST /wopi/files/{fileId}/lock` | `WOPIController::lockFile()` | Acquire lock |
| `POST /wopi/files/{fileId}/unlock` | `WOPIController::unlockFile()` | Release lock |
| `POST /wopi/files/{fileId}/refreshLock` | `WOPIController::refreshLock()` | Refresh lock |

### PostMessage Protocol

**Editor → Nextcloud parent (upstream):**
| Event | When | Payload |
|-------|------|---------|
| `app_ready` | Editor initialized | — |
| `document_ready` | File loaded and rendered | — |
| `document_modified` | Unsaved changes exist | — |
| `document_saved` | Save completed | `{ version: string }` |
| `error` | Fatal error | `{ code: string, message: string }` |
| `request_close` | User wants to close | — |

**Nextcloud parent → Editor (downstream):**
| Command | Action | Payload |
|---------|--------|---------|
| `save` | Trigger save | — |
| `close` | Force close | — |
| `set_user` | Update user info | `{ userId, userName }` |
| `theme` | Dark/light mode | `{ theme: 'light'|'dark' }` |

## REQUIREMENTS

- **Nextcloud:** 33-34
- **PHP:** 8.1 - 8.4
- **Node.js:** 20+ (for building)
- **Document Server:** World Office Docs (must be reachable from both Nextcloud server AND client browsers)
- **PHP deps:** `firebase/php-jwt ^6.0`

## KEY CONFIGURATION SETTINGS

| Setting | Description | Default |
|---------|-------------|---------|
| `DocumentServerUrl` | Public URL of DocServer | (required) |
| `DocumentServerInternalUrl` | Internal URL (server-to-server) | same as above |
| `StorageUrl` | Nextcloud URL visible to DocServer | (required) |
| `jwt_secret` | JWT shared secret | (auto-generated) |
| `VerifyPeerOff` | Disable SSL cert verification | false |

## BUILD

```bash
npm install
npm run build        # production build (vite)
npm run dev          # development build
composer install      # PHP dependencies
```

## ANTI-PATTERNS

- NEVER mismatch `jwt_secret` between Nextcloud and DocServer — causes 403 errors
- NEVER use `world-office` as app ID — this project uses `worldoffice`
- NEVER skip `composer install` — JWT handling depends on firebase/php-jwt
- NEVER forget `chown -R www-data:www-data` after copying app files

## TEST ENVIRONMENT

```bash
cd test-env
docker compose up -d
# Open http://localhost:8081 (admin/admin)
```

See `test-env/README.md` for full instructions.
