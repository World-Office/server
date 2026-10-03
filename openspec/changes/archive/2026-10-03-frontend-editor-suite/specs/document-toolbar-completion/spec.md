## ADDED Requirements

### Requirement: Text highlight color
The system SHALL provide a highlight color button on the Home tab that applies background color to selected text via TipTap. The button SHALL show a dropdown of preset highlight colors plus "No Color" to remove highlighting.

#### Scenario: User highlights selected text
- **WHEN** user selects text and clicks highlight color > Yellow
- **THEN** the selected text gets a yellow background highlight

#### Scenario: User removes highlighting
- **WHEN** user selects highlighted text and clicks highlight color > No Color
- **THEN** the highlight is removed

### Requirement: Line spacing control
The system SHALL provide a line spacing dropdown on the Home tab (Paragraph group) with options: 1.0, 1.15, 1.5, 2.0, 2.5, 3.0, and custom spacing (before/after paragraphs in points).

#### Scenario: User changes line spacing
- **WHEN** user selects a paragraph and clicks Line Spacing > 2.0
- **THEN** the paragraph's line-height changes to double-spaced

### Requirement: Multilevel list support
The system SHALL support multilevel (nested) bullet and numbered lists. The toolbar SHALL provide a multilevel list button that increases/decreases list level for the current item.

#### Scenario: User creates nested list
- **WHEN** user is on a bullet list item and clicks Increase Level
- **THEN** the item becomes a sub-item (indented) of the previous item at the parent level

### Requirement: Paragraph borders
The system SHALL provide paragraph border options via the Layout tab or a flyout: top, bottom, left, right, and box borders with configurable width, color, and style (solid, dashed, dotted, double).

#### Scenario: User adds bottom border to paragraph
- **WHEN** user selects a paragraph, opens Paragraph Borders flyout, and sets bottom border to 2pt solid black
- **THEN** a 2pt solid black line appears below the paragraph

### Requirement: Style gallery dropdown
The system SHALL provide a style gallery dropdown on the Home tab (Styles group) showing all available paragraph and character styles (Normal, Heading 1-9, Quote, Caption, etc.). Selecting a style SHALL apply it to the current paragraph/selection.

#### Scenario: User applies Heading 1 from gallery
- **WHEN** user clicks the style gallery dropdown and selects "Heading 1"
- **THEN** the current paragraph gets Heading 1 style (font, size, spacing, color)

#### Scenario: Gallery shows preview of each style
- **WHEN** user opens the style gallery
- **THEN** each style entry renders a live preview showing the style's font and size

### Requirement: Page number insertion
The system SHALL allow inserting page numbers via Insert tab: top of page, bottom of page, page margins, and current position. Page numbers SHALL update automatically.

#### Scenario: User inserts page number at bottom
- **WHEN** user clicks Insert > Page Number > Bottom of Page > Plain Number
- **THEN** a centered page number appears at the bottom of every page

### Requirement: Header and footer editing
The system SHALL allow editing headers and footers by double-clicking the header/footer area or via Insert > Header/Footer. Header/footer content SHALL persist across pages. "Different first page" and "Different odd/even" options SHALL be supported.

#### Scenario: User edits header
- **WHEN** user double-clicks the top margin area
- **THEN** the document body fades, header editing area activates, and user can type/paste content

#### Scenario: Different first page header
- **WHEN** user enables "Different First Page" and sets a different header on page 1
- **THEN** page 1 shows its custom header and all subsequent pages show the regular header

### Requirement: Comments panel
The system SHALL provide a comments panel (right sidebar) for adding, replying to, resolving, and deleting comments. Comments SHALL be anchored to text ranges. The toolbar Comments button SHALL toggle the panel.

#### Scenario: User adds a comment to selected text
- **WHEN** user selects text and clicks Insert > Comment (or right-click > Comment)
- **THEN** a comment card appears in the right panel anchored to the selected text

#### Scenario: User resolves a comment
- **WHEN** user clicks "Resolve" on a comment
- **THEN** the comment is marked as resolved, text highlight changes style, and comment collapses

### Requirement: Track changes (review mode)
The system SHALL support track changes mode that records insertions (colored + underlined), deletions (colored + strikethrough), and formatting changes. Users SHALL accept/reject individual changes or all changes. A Review toolbar tab SHALL control track changes settings.

#### Scenario: User enables track changes and edits
- **WHEN** user enables Track Changes and types new text
- **THEN** the new text appears colored and underlined as an insertion

#### Scenario: User accepts a change
- **WHEN** user clicks Accept on a tracked insertion
- **THEN** the insertion becomes permanent text (normal formatting) and the change record is removed

### Requirement: Footnotes and endnotes
The system SHALL allow inserting footnotes (bottom of page) and endnotes (end of document) via the References tab. Footnote/endnote references SHALL be auto-numbered and clickable.

#### Scenario: User inserts a footnote
- **WHEN** user clicks References > Insert Footnote at cursor position
- **THEN** a superscript number appears at cursor and the footnote pane opens at the bottom of the page

#### Scenario: User clicks footnote reference
- **WHEN** user clicks a footnote reference number in the document body
- **THEN** the view scrolls to the corresponding footnote at the bottom of the page

### Requirement: Table of Contents
The system SHALL generate a Table of Contents from heading styles (H1-H6) via References > Table of Contents. The TOC SHALL be clickable to jump to sections. An "Update Table" button SHALL refresh the TOC after heading changes.

#### Scenario: User inserts TOC
- **WHEN** user clicks References > Table of Contents and selects a style
- **THEN** a TOC is inserted at cursor position listing all headings with page numbers

#### Scenario: User updates TOC after edits
- **WHEN** user adds a new heading and clicks "Update Table"
- **THEN** the TOC refreshes to include the new heading with correct page number

### Requirement: Content controls
The system SHALL support content controls: plain text, rich text, dropdown, date picker, checkbox. These SHALL be insertable via the toolbar and editable in-place.

#### Scenario: User inserts a dropdown content control
- **WHEN** user clicks Insert > Content Controls > Dropdown
- **THEN** a dropdown placeholder appears at cursor. User configures list items and the document consumer selects from the list

### Requirement: Direction controls
The system SHALL provide text direction buttons (Left-to-Right, Right-to-Left) on the Home tab for bidirectional text support.

#### Scenario: User switches to RTL
- **WHEN** user clicks RTL direction button
- **THEN** the paragraph text direction changes to right-to-left
