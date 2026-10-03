## ADDED Requirements

### Requirement: wo-wopi implements core WOPI protocol endpoints
The `wo-wopi` Rust crate (axum server, 1,013 lines at `core/crates/wo-wopi/`) SHALL implement the MS-WOPI protocol with endpoints for CheckFileInfo, GetFile, PutFile, Lock, and Unlock operations.

#### Scenario: CheckFileInfo returns file metadata
- **WHEN** a WOPI client sends GET /wopi/files/{file_id} with a valid access token
- **THEN** the server SHALL return file metadata including size, name, and permissions as JSON

#### Scenario: GetFile returns file contents
- **WHEN** a WOPI client sends GET /wopi/files/{file_id}/contents with a valid access token
- **THEN** the server SHALL return the raw binary file contents

#### Scenario: PutFile saves updated contents
- **WHEN** a WOPI client sends POST /wopi/files/{file_id}/contents with valid token and binary body
- **THEN** the server SHALL save the file contents and return a success response

#### Scenario: Lock prevents concurrent edits
- **WHEN** a WOPI client locks a file with Lock operation
- **THEN** other clients SHALL receive a LockConflict error when attempting PutFile

#### Scenario: Invalid access token returns 401
- **WHEN** a request is made without or with an invalid access token
- **THEN** the server SHALL return HTTP 401 Unauthorized

#### Scenario: File not found returns 404
- **WHEN** a request is made for a non-existent file_id
- **THEN** the server SHALL return HTTP 404 Not Found

### Requirement: Storage backend abstraction
`wo-wopi` SHALL define a `StorageBackend` trait with methods for `file_info`, `get_file`, `put_file`, `lock`, and `unlock`. A `FileSystemStorage` implementation SHALL store files on disk.

#### Scenario: FileSystemStorage creates files on disk
- **WHEN** PutFile is called
- **THEN** `FileSystemStorage` SHALL write the data to disk in its configured data directory

### Requirement: wo-docserver serves editor UI and proxies WOPI
The `wo-docserver` Rust crate (756 lines at `core/crates/wo-docserver/`) SHALL serve the React editor UI, proxy WOPI requests to the OCIS WOPI host, handle document conversion, and provide a `/hosting/discovery` endpoint for E2E health checks.

#### Scenario: wo-docserver proxies CheckFileInfo to OCIS
- **WHEN** a client sends GET /wopi/files/{file_id} to wo-docserver with a valid JWT
- **THEN** wo-docserver SHALL validate the JWT against its `JWT_SECRET`
- **AND** SHALL forward the request to OCIS via `WopiClient.check_file_info()`
- **AND** SHALL return the OCIS response

#### Scenario: wo-docserver proxies GetFile to OCIS
- **WHEN** a client sends GET /wopi/files/{file_id}/contents to wo-docserver
- **THEN** wo-docserver SHALL validate the JWT and proxy to OCIS
- **AND** SHALL return the raw file bytes

#### Scenario: wo-docserver proxies PutFile to OCIS
- **WHEN** a client sends POST /wopi/files/{file_id}/contents to wo-docserver
- **THEN** wo-docserver SHALL validate the JWT and forward the updated content to OCIS

#### Scenario: /health returns ok
- **WHEN** a client sends GET /health to wo-docserver
- **THEN** the response SHALL be "ok"

#### Scenario: /hosting/discovery proxies OCIS discovery
- **WHEN** a client sends GET /hosting/discovery to wo-docserver
- **THEN** wo-docserver SHALL proxy to the OCIS WOPI discovery endpoint

#### Scenario: /hosting/wopi/{editor_type}/{action} launches editor shell
- **WHEN** a client sends GET /hosting/wopi/word/edit with access_token and file_id
- **THEN** wo-docserver SHALL return an HTML page that redirects to the document editor at `http://localhost:3006`

#### Scenario: /api/conversion/convert invokes wo-x2t
- **WHEN** a client sends POST /api/conversion/convert with source_format, target_format, and base64-encoded data
- **THEN** wo-docserver SHALL invoke `ConversionRouter::convert()` from `wo-x2t`
- **AND** SHALL return the converted document as base64-encoded data

#### Scenario: /api/conversion/formats lists supported pairs
- **WHEN** a client sends GET /api/conversion/formats
- **THEN** wo-docserver SHALL return a list of all registered conversion format pairs from `wo-x2t`

### Requirement: WOPI authentication uses JWT
Access to WOPI endpoints SHALL be authenticated using signed JWT tokens. The `wo-docserver` SHALL validate tokens against a shared `JWT_SECRET` that is configured via environment variable.

#### Scenario: Missing JWT returns 400
- **WHEN** a request to /wopi/files/{file_id} has no access_token query parameter
- **THEN** wo-docserver SHALL return HTTP 400 Bad Request

#### Scenario: Invalid JWT returns 401
- **WHEN** a request has an invalid or expired access_token
- **THEN** wo-docserver SHALL return HTTP 401 Unauthorized
