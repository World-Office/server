## ADDED Requirements

### Requirement: Blockquote support
The editor SHALL support blockquote formatting via TipTap's StarterKit extension (already registered). Users SHALL be able to toggle blockquote on the current paragraph.

#### Scenario: Toggle blockquote
- **WHEN** user places cursor in a paragraph and clicks the blockquote toolbar button
- **THEN** the paragraph SHALL be wrapped in a `<blockquote>` HTML element

#### Scenario: Remove blockquote
- **WHEN** user places cursor in a blockquote paragraph and clicks the blockquote toolbar button
- **THEN** the blockquote formatting SHALL be removed, returning the paragraph to normal

### Requirement: Code block support
The editor SHALL support code block formatting via TipTap's StarterKit extension (already registered). Users SHALL be able to toggle code block on the current paragraph.

#### Scenario: Toggle code block
- **WHEN** user places cursor in a paragraph and clicks the code block toolbar button
- **THEN** the paragraph SHALL be rendered as a `<pre><code>` code block

### Requirement: Justified text alignment
The editor SHALL support justified text alignment via the existing TextAlign extension. Users SHALL be able to justify text in addition to left/center/right.

#### Scenario: Justify paragraph text
- **WHEN** user selects a paragraph and clicks the justify alignment toolbar button
- **THEN** the paragraph SHALL have `text-align: justify` applied

### Requirement: Task list (checklist)
The editor SHALL support task list items via TipTap's TaskList and TaskItem extensions. Users SHALL be able to insert and toggle checklist items.

#### Scenario: Create task list item
- **WHEN** user clicks the task list toolbar button
- **THEN** a new list item with a checkbox SHALL be inserted

#### Scenario: Toggle task checkbox
- **WHEN** user clicks on a task item checkbox
- **THEN** the checkbox SHALL toggle between checked and unchecked states

### Requirement: Decrease/Increase indent toolbar buttons
The editor SHALL wire the existing decrease/increase indent toolbar buttons to modify paragraph indentation.

#### Scenario: Increase indent
- **WHEN** user clicks the increase indent button on a paragraph
- **THEN** the paragraph SHALL be indented (via `padding-left` or `margin-left`)

#### Scenario: Decrease indent
- **WHEN** user clicks the decrease indent button on an indented paragraph
- **THEN** the paragraph indent SHALL be reduced
