## ADDED Requirements

### Requirement: Plugin API surface
The system SHALL define a `WorldOfficePlugin` interface that plugins implement. The interface SHALL include: `id`, `name`, `version`, `init(ctx)`, `destroy()`. The context object (`ctx`) SHALL expose: `toolbar.registerButton()`, `toolbar.registerTab()`, `menu.registerItem()`, `panel.registerPanel()`, `i18n.addTranslations()`, `storage.get/set()`, `editor.getSelection()`, `editor.insertContent()`.

#### Scenario: Plugin registers a toolbar button
- **WHEN** a plugin calls `ctx.toolbar.registerButton({ id: "translate", label: "Translate", icon: "globe", tab: "home", group: "editing", onClick: () => translateSelection() })`
- **THEN** a "Translate" button with globe icon appears in the Home tab's Editing group

#### Scenario: Plugin registers a custom panel
- **WHEN** a plugin calls `ctx.panel.registerPanel({ id: "thesaurus", label: "Thesaurus", position: "right", render: () => <ThesaurusPanel /> })`
- **THEN** a "Thesaurus" tab appears in the right panel sidebar

### Requirement: Plugin loader
The system SHALL load plugins from a configured plugin directory or registry. Plugins SHALL be loaded asynchronously and initialized after the editor is ready. Failed plugins SHALL NOT block editor startup — errors SHALL be logged and the plugin disabled.

#### Scenario: Plugin loads successfully
- **WHEN** the editor starts and a plugin is found in the configured plugin list
- **THEN** the plugin's `init(ctx)` is called with the plugin context

#### Scenario: Plugin fails to load
- **WHEN** a plugin throws during `init()`
- **THEN** the error is logged to console, the plugin is marked as failed, and the editor continues normally

### Requirement: Plugin sandboxing
Plugins SHALL run in a sandboxed scope with limited access to the editor's internals. Plugins SHALL NOT have direct access to the document store, DOM, or other plugins' state. All interaction SHALL go through the `ctx` API.

#### Scenario: Plugin cannot access internal state
- **WHEN** a plugin attempts to import or access `documentStore` directly
- **THEN** the access is blocked and an error is thrown

### Requirement: Plugin configuration
The system SHALL support a plugin configuration file (JSON or TOML) listing enabled plugins and per-plugin settings. Users SHALL enable/disable plugins via a Plugin Manager UI.

#### Scenario: User enables a plugin
- **WHEN** user opens Plugin Manager, finds "Translate" plugin, and toggles it on
- **THEN** the plugin loads on next editor restart (or immediately if hot-reload is supported)

#### Scenario: User configures plugin settings
- **WHEN** user opens Plugin Manager > Translate > Settings and sets target language to "de"
- **THEN** the Translate plugin reads `settings.targetLanguage = "de"` from its config

### Requirement: Plugin marketplace stub
The system SHALL provide a Plugin Marketplace UI stub showing a placeholder page. This page SHALL display a message "Coming Soon" with a description of the planned marketplace. It SHALL NOT have functional plugin installation yet.

#### Scenario: User opens marketplace
- **WHEN** user clicks "Get Plugins" in the Plugin Manager
- **THEN** a placeholder page appears with "Coming Soon" message
