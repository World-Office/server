## ADDED Requirements

### Requirement: System provides ActiveMQ message queue support
The system SHALL provide an ActiveMQ messaging backend for asynchronous task processing.

#### Scenario: ActiveMQ connection is established
- **WHEN** the system starts with ActiveMQ configured as the message queue
- **THEN** the ActiveMQ module SHALL connect to the configured broker URL

#### Scenario: Message sent via ActiveMQ
- **WHEN** a service publishes a message with ActiveMQ configured
- **THEN** the message SHALL be published to the configured ActiveMQ queue or topic

#### Scenario: Message consumed from ActiveMQ
- **WHEN** a consumer listens on an ActiveMQ queue
- **THEN** messages SHALL be consumed and processed asynchronously

### Requirement: System provides RabbitMQ message queue support
The system SHALL provide a RabbitMQ messaging backend for asynchronous task processing.

#### Scenario: RabbitMQ connection is established
- **WHEN** the system starts with RabbitMQ configured as the message queue
- **THEN** the RabbitMQ module SHALL connect to the configured broker URL

#### Scenario: Message sent via RabbitMQ
- **WHEN** a service publishes a message with RabbitMQ configured
- **THEN** the message SHALL be published to the configured exchange and routing key

#### Scenario: Message consumed from RabbitMQ
- **WHEN** a consumer listens on a RabbitMQ queue
- **THEN** messages SHALL be consumed and processed asynchronously

### Requirement: Messaging backends are interchangeable
The messaging backends SHALL implement a common interface so they can be swapped without changing consuming code.

#### Scenario: Backend swap
- **WHEN** the system's messaging backend is changed from NATS to ActiveMQ or RabbitMQ
- **THEN** consuming services SHALL continue to function without code changes
