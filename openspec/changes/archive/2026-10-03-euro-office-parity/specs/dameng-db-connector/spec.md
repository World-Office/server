## ADDED Requirements

### Requirement: DocService provides Dameng database connector
The DocService SHALL provide a database connector for Dameng (达梦), China's leading relational database.

#### Scenario: Dameng connection is established
- **WHEN** DocService starts with Dameng configured as the database backend
- **THEN** the connector SHALL establish a connection to the Dameng database using the configured credentials

#### Scenario: Dameng query execution
- **WHEN** a database query targets the Dameng backend
- **THEN** the connector SHALL execute the query and return results

#### Scenario: Dameng connection failure
- **WHEN** the Dameng database is unreachable
- **THEN** the connector SHALL return a database connection error
- **AND** SHALL log the failure with connection details (excluding credentials)

#### Scenario: Dameng connector follows existing DB connector interface
- **WHEN** the Dameng connector is loaded
- **THEN** it SHALL implement the same interface as the existing MSSQL and Oracle connectors
