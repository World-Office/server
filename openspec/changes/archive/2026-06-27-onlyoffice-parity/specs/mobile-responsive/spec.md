## ADDED Requirements

### Requirement: Editor UI SHALL be responsive on mobile viewports

Each web editor (document, spreadsheet, presentation, PDF) SHALL adapt its layout for mobile viewports (320-768px width) using CSS breakpoints and responsive design.

#### Scenario: Document editor on mobile
- **WHEN** the document editor loads on a viewport narrower than 768px
- **THEN** the toolbar SHALL collapse to an icon-only row
- **AND** the document content SHALL fill the available width
- **AND** the sidebar panels SHALL be hidden (togglable via menu)

#### Scenario: Spreadsheet editor on mobile
- **WHEN** the spreadsheet editor loads on a mobile viewport
- **THEN** the formula bar SHALL be hidden by default
- **AND** cells SHALL scale to readable dimensions
- **AND** pan/zoom via touch gestures SHALL be enabled

#### Scenario: Presentation editor on mobile
- **WHEN** the presentation editor loads on a mobile viewport
- **THEN** slides SHALL display in single-slide portrait mode
- **AND** swiping SHALL navigate between slides
- **AND** presenter notes SHALL be accessible via a slide-up panel

#### Scenario: PDF editor on mobile
- **WHEN** the PDF viewer loads on a mobile viewport
- **THEN** pages SHALL fit to screen width
- **AND** pinch-to-zoom SHALL allow reading small text
- **AND** a page navigation overlay SHALL be accessible

### Requirement: Mobile mode SHALL default to read-only

On mobile viewports, the editor SHALL default to a read-only viewing mode. Editing SHALL require explicit activation and be limited to basic annotation.

#### Scenario: Read-only on mobile
- **WHEN** a document opens on a mobile viewport
- **THEN** content SHALL be displayed in read-only mode by default
- **AND** a floating "Edit" button SHALL be visible for users who want to switch

#### Scenario: Switch to edit mode on mobile
- **WHEN** the user taps the floating "Edit" button
- **THEN** the editor SHALL enter a limited edit mode
- **AND** SHALL show a message: "Editing on mobile is limited. Open on desktop for full editing."

### Requirement: Mobile annotation SHALL support highlight and comment

The mobile viewer SHALL support adding highlights and comments to documents without entering full edit mode.

#### Scenario: Highlight text on mobile
- **WHEN** the user long-presses and selects text on a mobile viewport
- **THEN** a context menu SHALL appear with: Highlight, Comment, Copy

#### Scenario: Add comment on mobile
- **WHEN** the user selects text and taps Comment
- **THEN** a comment input SHALL open at the bottom of the screen
- **AND** the comment SHALL be associated with the selected text

#### Scenario: View comments on mobile
- **WHEN** a document contains comments
- **THEN** commented text SHALL be highlighted in the document
- **AND** tapping highlighted text SHALL show the comment in a bottom sheet

### Requirement: Mobile performance SHALL meet responsiveness targets

The mobile viewing experience SHALL meet defined performance targets to ensure smooth scrolling and reasonable load times.

#### Scenario: Document load time
- **WHEN** a 50-page document opens on a mobile device
- **THEN** the first page SHALL render within 3 seconds on a 4G connection

#### Scenario: Scrolling performance
- **WHEN** the user scrolls through a document on mobile
- **THEN** the scroll SHALL maintain 60fps with no visible jank

#### Scenario: Touch gesture responsiveness
- **WHEN** the user pinch-zooms or pans
- **THEN** the gesture SHALL respond within 100ms
- **AND** the content SHALL re-render at the new zoom level within 500ms

### Requirement: Mobile SHALL NOT include touch-based cell/paragraph editing

The mobile experience SHALL explicitly NOT provide touch-based inline editing for complex content (cells, tables, charts, images). These remain desktop-only interactions.

#### Scenario: Table cell tap on mobile
- **WHEN** the user taps a table cell in a document on mobile
- **THEN** the cell SHALL be selected (highlighted) but NOT enter edit mode
- **AND** a toast message SHALL display: "Edit tables on desktop"

#### Scenario: Chart interaction on mobile
- **WHEN** the user taps a chart on mobile
- **THEN** the chart SHALL display a tooltip with data values
- **AND** editing the chart SHALL not be supported on mobile
