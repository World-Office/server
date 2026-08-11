## ADDED Requirements

### Requirement: Rich text undo
The editor SHALL support undoing the last rich text editing action via a toolbar button. This uses TipTap's built-in history functionality from StarterKit.

#### Scenario: Undo formatting change
- **WHEN** user applies bold formatting and then clicks the undo toolbar button
- **THEN** the bold formatting SHALL be reverted

#### Scenario: Undo text change
- **WHEN** user types text and then clicks the undo toolbar button
- **THEN** the last typed text SHALL be removed

### Requirement: Rich text redo
The editor SHALL support redoing a previously undone rich text editing action via a toolbar button.

#### Scenario: Redo after undo
- **WHEN** user undoes a formatting change and then clicks the redo toolbar button
- **THEN** the formatting change SHALL be reapplied
