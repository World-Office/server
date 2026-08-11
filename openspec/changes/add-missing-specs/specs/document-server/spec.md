## ADDED Requirements

### Requirement: Document conversion via DocBuilder CLI
The Node.js DocBuilder CLI at `services/server/DocBuilder/` SHALL provide command-line document conversion between supported formats using the `wo-x2t` conversion orchestrator.

#### Scenario: DocBuilder converts between formats
- **WHEN** the user runs DocBuilder with a source file and target format
- **THEN** it SHALL invoke the conversion pipeline
- **AND** SHALL output the converted file

### Requirement: DocService handles co-authoring coordination
The Node.js DocService at `services/server/` SHALL manage document editing sessions, coordinate real-time changes, and handle save callbacks from the editor. It SHALL use the DocBuilder CLI for document format conversion.

#### Scenario: DocService initializes editing session
- **WHEN** a user opens a document for editing
- **THEN** DocService SHALL create a session with a unique document key
- **AND** SHALL initialize the appropriate editor configuration

#### Scenario: DocService receives save callback
- **WHEN** the editor sends a save callback with updated content
- **THEN** DocService SHALL validate the JWT in the callback
- **AND** SHALL save the updated content via the storage backend

### Requirement: Multiple storage backends
The system SHALL support multiple storage backends selected by configuration, including local filesystem, S3-compatible, Azure Blob, and SeaweedFS.

#### Scenario: Storage backend selection by config
- **WHEN** `services.CoAuthoring.sql.type` is set to `storage-seaweedfs`
- **THEN** `storage-base.js` SHALL load the SeaweedFS backend module

#### Scenario: File stored and retrieved via backend
- **WHEN** a file is uploaded through the Document Server
- **THEN** it SHALL be stored via the configured storage backend
- **AND** SHALL be retrievable via the same backend

### Requirement: FileConverter handles document import/export
The FileConverter at `services/server/FileConverter/` SHALL handle document import/export including format conversion, PDF signing, and OCR.

#### Scenario: FileConverter converts document
- **WHEN** a document needs format conversion during import
- **THEN** FileConverter SHALL convert from source to internal format
- **AND** SHALL invoke the configured conversion pipeline

### Requirement: PDF signing with multiple providers
The FileConverter signing module at `FileConverter/sources/signing/` SHALL support PDF digital signatures via AWS KMS and Cloud Signature Consortium (CSC) API.

#### Scenario: PDF signed via AWS KMS
- **WHEN** a PDF is submitted for signing with AWS KMS configuration
- **THEN** `pdfAwsKmsSigner.js` SHALL use AWS KMS to create the digital signature
- **AND** SHALL embed the signature into the PDF document

#### Scenario: PDF signed via CSC API
- **WHEN** a PDF is submitted for signing with CSC API configuration
- **THEN** `pdfCscSigner.js` SHALL use the CSC API to create the digital signature
- **AND** SHALL embed the signature into the PDF

### Requirement: Rust microservices for specific document operations
The system SHALL provide Rust microservices (axum + tokio) for identity management, storage, conversion, co-authoring, and session management at `services/`.

#### Scenario: Storage service persists files
- **WHEN** a file is uploaded via POST /files to the storage-service
- **THEN** it SHALL store metadata in SQLite (id, name, content_type, size, path, timestamps)
- **AND** SHALL store the blob on disk
- **AND** SHALL return the file ID

#### Scenario: Storage service lists files
- **WHEN** a GET /files request is made
- **THEN** the storage-service SHALL return a list of all stored file metadata entries
