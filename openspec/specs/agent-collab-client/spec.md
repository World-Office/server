# agent-collab-client Specification

## Purpose
AI agents edit documents as first-class, observable, attributable, and revertible
collaboration clients — no privileged or unsafe code path.

## Requirements

### Requirement: Agents act through the collaboration op pipeline
<!-- Agent edits take the same path as human edits. -->

#### Scenario: agent submits edits
- **WHEN** an agent submits document edits
- **THEN** they are applied via `apply_ops` and become part of the document's op log and revision history

### Requirement: Agent edits are attributable
<!-- Needed for review, audit, and the "control is non-negotiable" principle. -->

#### Scenario: an agent edits a document
- **WHEN** an agent edits a document
- **THEN** its ops carry an agent-tagged `client_id` so the changes are distinguishable from human edits

### Requirement: Agent edits are revertible and reviewable
<!-- Transparency is a hard requirement, not a nice-to-have. -->

#### Scenario: a user reviews agent changes
- **WHEN** a user reviews changes made by an agent
- **THEN** they can accept or reject per op and roll back to any prior revision

### Requirement: Agents cannot bypass safety controls
<!-- The hub must stay available regardless of agent input quality. -->

#### Scenario: agent submits malformed or corrupt input
- **WHEN** an agent submits malformed ops or corrupt bytes
- **THEN** the hub rejects the input without crashing and the document remains consistent

#### Scenario: concurrent agent and human edits
- **WHEN** an agent and a human edit the same document concurrently
- **THEN** the store lock serializes writes and the document converges without data loss
