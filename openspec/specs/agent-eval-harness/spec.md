# agent-eval-harness Specification

## Purpose
Agent-generated edits are continuously evaluated against document-integrity invariants using
the existing property/fuzz/mutation suites, with mutation score as a merge gate.

## Requirements

### Requirement: Agent outputs are covered by the evaluation suites
<!-- Agent edits are just another untrusted input class. -->

#### Scenario: agent-generated edits are produced
- **WHEN** agent-generated document edits are produced
- **THEN** they are added as inputs to the property, fuzz, and mutation test suites

### Requirement: Mutation score is a merge gate
<!-- Keeps the safety guarantees honest as the agent surface evolves. -->

#### Scenario: a change touches the agent tool surface or collab path
- **WHEN** a change modifies the agent tool surface or the collaboration path
- **THEN** the mutation score must remain at the established threshold (100%) before merge

### Requirement: Agent edits preserve document integrity
<!-- The invariants proven for human edits must also hold for agent edits. -->

#### Scenario: an agent performs a long multi-step edit loop
- **WHEN** an agent issues many sequential ops on a document
- **THEN** the resulting document text matches the sequence of applied valid ops and no content is lost
