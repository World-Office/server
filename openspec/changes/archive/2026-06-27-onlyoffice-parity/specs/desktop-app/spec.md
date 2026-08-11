## ADDED Requirements

### Requirement: Desktop app SHALL wrap web editors in a native window

The Tauri desktop application SHALL load the existing web editors (`apps/web/`) in a native webview window, providing a seamless desktop editing experience without requiring a browser.

#### Scenario: Launch desktop app
- **WHEN** the user launches the desktop application
- **THEN** it SHALL display the editor shell in a native window
- **AND** the editor SHALL function identically to the browser version

#### Scenario: Open document from file system
- **WHEN** the user opens a supported document format from the local filesystem
- **THEN** the desktop app SHALL load the file and pass it to the editor for rendering

#### Scenario: Save document to file system
- **WHEN** the user saves a document
- **THEN** the desktop app SHALL write the document back to the original filesystem path

### Requirement: Desktop app SHALL provide native OS integration

The desktop application SHALL integrate with the host operating system through system tray, native menus, file associations, and window management.

#### Scenario: System tray with context menu
- **WHEN** the user minimizes the application to tray
- **THEN** the system tray icon SHALL show a context menu with: New Document, Open, Recent Files, Quit

#### Scenario: Native file menu
- **WHEN** the user clicks File in the application menu
- **THEN** it SHALL show native OS menu items: New, Open, Save, Save As, Export, Print, Quit

#### Scenario: File association
- **WHEN** the user double-clicks a supported file (docx, xlsx, pptx, pdf, odt, etc.) in the OS file manager
- **THEN** the desktop app SHALL open and display the document

#### Scenario: Multi-window support
- **WHEN** the user opens multiple documents
- **THEN** each document SHALL open in a separate native window

#### Scenario: Recent files list
- **WHEN** the user opens the File menu
- **THEN** it SHALL display a list of recently opened documents

### Requirement: Desktop app SHALL support auto-updates

The desktop application SHALL check for and apply updates automatically using Tauri's updater plugin.

#### Scenario: Update check on startup
- **WHEN** the application starts
- **THEN** it SHALL check for a new version against the configured update server

#### Scenario: Update available notification
- **WHEN** an update is available
- **THEN** the user SHALL be notified with an option: Update Now / Later

#### Scenario: Silent background update
- **WHEN** the user chooses Update Now
- **THEN** the update SHALL download and install in the background
- **AND** the application SHALL restart after installation

### Requirement: Desktop app SHALL handle print rendering

The desktop application SHALL provide print preview and sending to local/network printers.

#### Scenario: Print from desktop app
- **WHEN** the user selects File → Print or presses Ctrl+P
- **THEN** the application SHALL render the document for print and show the native print dialog

#### Scenario: Print preview
- **WHEN** the user selects Print Preview
- **THEN** the application SHALL show a WYSIWYG preview of the printed document

### Requirement: Desktop app SHALL support credential storage

The desktop application SHALL securely store authentication credentials using the OS keychain.

#### Scenario: Save credentials
- **WHEN** the user authenticates and checks "Remember me"
- **THEN** the credentials SHALL be stored in the OS keychain

#### Scenario: Retrieve saved credentials
- **WHEN** the application starts and saved credentials exist
- **THEN** it SHALL attempt to authenticate using the stored credentials
