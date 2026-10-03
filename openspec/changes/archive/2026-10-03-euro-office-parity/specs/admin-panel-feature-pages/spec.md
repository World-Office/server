## ADDED Requirements

### Requirement: Admin Panel provides WOPI Settings page
The admin panel SHALL provide a page for configuring WOPI integration settings, including JWT secret rotation, WOPI source URL, and collaboration app address.

#### Scenario: User views WOPI Settings
- **WHEN** an authenticated admin navigates to WOPI Settings
- **THEN** the page SHALL display current WOPI configuration values

#### Scenario: User updates WOPI configuration
- **WHEN** an admin submits changes to WOPI settings
- **THEN** the backend SHALL validate and save the configuration

### Requirement: Admin Panel provides Security Settings page
The admin panel SHALL provide a page for configuring security options including password policy, TLS settings, rate limiting, and brute force protection.

#### Scenario: User views Security Settings
- **WHEN** an authenticated admin navigates to Security Settings
- **THEN** the page SHALL display current security configuration

#### Scenario: User updates security policy
- **WHEN** an admin modifies security settings
- **THEN** the backend SHALL apply the changes to the running configuration

### Requirement: Admin Panel provides Access Rules page
The admin panel SHALL provide a page for configuring IP-based access control rules (allow/deny lists).

#### Scenario: User configures access rules
- **WHEN** an admin adds, edits, or removes an access rule
- **THEN** the backend SHALL update the access control list

### Requirement: Admin Panel provides File Limits page
The admin panel SHALL provide a page for configuring file size limits and allowed file types.

#### Scenario: User configures file limits
- **WHEN** an admin modifies file upload size limits or allowed extensions
- **THEN** the backend SHALL enforce the new limits on subsequent uploads

### Requirement: Admin Panel provides Logger Config page
The admin panel SHALL provide a page for configuring logging levels, log retention, and log output destinations.

#### Scenario: User configures logging
- **WHEN** an admin changes logging settings
- **THEN** the backend SHALL update the log configuration without restart

### Requirement: Admin Panel provides Expiration page
The admin panel SHALL provide a page for configuring session and token expiration durations.

#### Scenario: User configures expiration
- **WHEN** an admin updates session timeout or JWT expiration values
- **THEN** the backend SHALL enforce the new durations

### Requirement: Admin Panel provides Health Check page
The admin panel SHALL provide a page displaying the health status of backend services.

#### Scenario: User views health status
- **WHEN** an authenticated admin navigates to the Health Check page
- **THEN** the page SHALL display the status of all backend services (DocService, FileConverter, storage, database)

### Requirement: Admin Panel provides Request Filtering page
The admin panel SHALL provide a page for configuring request filtering rules (URL allow/deny, method restrictions).

#### Scenario: User configures request filtering
- **WHEN** an admin adds or modifies request filtering rules
- **THEN** the backend SHALL apply the rules to incoming requests

### Requirement: Admin Panel provides Notification Config page
The admin panel SHALL provide a page for configuring system notifications including email templates and notification channels.

#### Scenario: User configures notifications
- **WHEN** an admin modifies notification settings
- **THEN** the backend SHALL update the notification service configuration
