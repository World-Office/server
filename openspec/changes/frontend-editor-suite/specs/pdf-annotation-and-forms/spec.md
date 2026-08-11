## ADDED Requirements

### Requirement: Comment annotations
The system SHALL allow adding sticky-note comments to PDF pages. Comments SHALL be anchored to a point on the page and displayed in a comments sidebar. Users SHALL reply to, resolve, and delete comments.

#### Scenario: User adds a comment annotation
- **WHEN** user selects the Comment tool and clicks on a PDF page
- **THEN** a comment marker appears at the click point and a comment card opens in the sidebar

#### Scenario: User replies to a comment
- **WHEN** user clicks "Reply" on an existing comment and types text
- **THEN** a threaded reply appears under the parent comment

### Requirement: Highlight and markup annotations
The system SHALL provide highlight (yellow, green, red, blue), underline, and strikethrough text markup tools. Users SHALL select text on the PDF page and apply markup.

#### Scenario: User highlights PDF text
- **WHEN** user selects the Highlight tool (yellow), drags across text on the PDF page
- **THEN** the selected text gets a yellow transparent highlight overlay

### Requirement: Shape and drawing annotations
The system SHALL provide drawing annotation tools: rectangle, ellipse, line, arrow, freehand drawing. Each shape SHALL have configurable color, border width, and fill.

#### Scenario: User draws a rectangle annotation
- **WHEN** user selects the Rectangle tool and drags on the PDF page
- **THEN** a rectangle shape appears with default styling

### Requirement: Form filling
The system SHALL detect and render interactive PDF form fields (text input, checkboxes, radio buttons, dropdowns, signature fields). Users SHALL fill in fields and the form SHALL be saveable.

#### Scenario: User fills a text field
- **WHEN** user clicks on a PDF text form field and types "John Doe"
- **THEN** the text appears in the form field

#### Scenario: User checks a checkbox
- **WHEN** user clicks a PDF checkbox form field
- **THEN** the checkbox becomes checked

#### Scenario: User signs a signature field
- **WHEN** user clicks a signature field and draws a signature (or uploads an image)
- **THEN** the signature appears in the signature field

### Requirement: Redaction tools
The system SHALL provide redaction tools that permanently remove sensitive content from PDFs. Redacted areas SHALL be painted over in black (configurable) and the underlying content SHALL be irreversibly removed.

#### Scenario: User redacts text
- **WHEN** user selects the Redact tool, drags over sensitive text, and clicks "Apply Redactions"
- **THEN** the text is permanently blacked out and cannot be recovered even by extracting PDF text

### Requirement: Page manipulation
The system SHALL allow page-level operations: rotate (90° increments), delete, insert (from file or blank), reorder (drag-and-drop in page thumbnail panel), extract (save selected pages as new PDF).

#### Scenario: User rotates a page
- **WHEN** user selects a page thumbnail and clicks Rotate Clockwise
- **THEN** the page rotates 90° clockwise

#### Scenario: User deletes a page
- **WHEN** user selects a page thumbnail and presses Delete
- **THEN** the page is removed from the document

#### Scenario: User reorders pages
- **WHEN** user drags page thumbnail 5 and drops it between thumbnails 2 and 3
- **THEN** the page order updates accordingly

### Requirement: Annotation toolbar (Comment tab)
The system SHALL provide a Comment tab on the toolbar with annotation tools: Sticky Note, Highlight, Underline, Strikethrough, Rectangle, Ellipse, Line, Arrow, Freehand, Redact.

#### Scenario: User selects annotation tool from toolbar
- **WHEN** user clicks Comment tab and selects Highlight tool
- **THEN** the cursor changes to a text selection cursor and dragging over PDF text applies the highlight
