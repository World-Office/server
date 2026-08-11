## ADDED Requirements

### Requirement: Slide CRUD operations
The system SHALL allow adding, deleting, duplicating, and reordering slides. New slides SHALL be added with a default layout. The slide panel (left sidebar) SHALL display slide thumbnails.

#### Scenario: User adds a new slide
- **WHEN** user clicks "New Slide" button
- **THEN** a new slide is appended after the current slide with the default "Title and Content" layout

#### Scenario: User deletes a slide
- **WHEN** user selects a slide thumbnail and presses Delete (or right-click > Delete)
- **THEN** the slide is removed and the next slide becomes active

#### Scenario: User reorders slides via drag-and-drop
- **WHEN** user drags slide thumbnail 3 and drops it between slides 1 and 2
- **THEN** the slide order updates to 1, 3, 2, 4, ...

#### Scenario: User duplicates a slide
- **WHEN** user right-clicks slide 2 and selects "Duplicate Slide"
- **THEN** an identical copy of slide 2 is inserted after it

### Requirement: Slide layouts
The system SHALL provide slide layout templates: Title Slide, Title and Content, Section Header, Two Content, Comparison, Content with Caption, Blank. Applying a layout SHALL restructure the slide's placeholder zones.

#### Scenario: User applies a layout
- **WHEN** user selects a slide and clicks Layout > "Two Content"
- **THEN** the slide restructures to show two side-by-side content placeholders

### Requirement: Master slide editing
The system SHALL allow editing slide masters (background, fonts, colors, placeholder positioning). Changes to a master SHALL propagate to all slides using that master.

#### Scenario: User changes master background
- **WHEN** user edits the slide master and sets a blue gradient background
- **THEN** all slides using that master show the blue gradient background

### Requirement: Shape and text formatting toolbar
The system SHALL provide a Home tab toolbar for formatting shapes and text on slides: font (family, size, bold, italic, color), alignment, bullet/number lists, shape fill, shape outline, shape effects.

#### Scenario: User formats text in a shape
- **WHEN** user selects text inside a shape and clicks Bold
- **THEN** the selected text becomes bold

#### Scenario: User changes shape fill
- **WHEN** user selects a shape and clicks Shape Fill > Red
- **THEN** the shape's background fill changes to red

### Requirement: Animation pane
The system SHALL provide an Animation tab for adding entrance, emphasis, exit, and motion path animations to shapes. The animation pane SHALL list all animations on the current slide with reorder capability.

#### Scenario: User adds an entrance animation
- **WHEN** user selects a shape, clicks Animation > Add Animation > Fade
- **THEN** the shape is assigned a Fade entrance animation listed in the animation pane

#### Scenario: User reorders animations
- **WHEN** user drags animation item 2 above animation item 1 in the animation pane
- **THEN** the animation order updates so the moved animation plays first

### Requirement: Slide transitions
The system SHALL provide a Transitions tab for applying slide transitions (fade, push, wipe, morph, etc.) with configurable duration and trigger (on click, after delay).

#### Scenario: User applies a transition
- **WHEN** user selects a slide and clicks Transitions > Fade with 1.0s duration
- **THEN** the slide shows a 1-second fade transition when advancing from the previous slide

### Requirement: Speaker notes
The system SHALL provide a speaker notes panel below the slide editing area. Users SHALL type notes per slide. Notes SHALL NOT appear in presentation/slideshow mode.

#### Scenario: User types speaker notes
- **WHEN** user clicks the notes area below the slide and types "Remember to mention Q3 results"
- **THEN** the notes are saved for that slide

#### Scenario: Notes hidden in slideshow
- **WHEN** user starts slideshow mode
- **THEN** speaker notes are not visible on screen

### Requirement: Insert tab for presentations
The system SHALL provide an Insert tab with: New Slide, Text Box, Picture, Shape, Table, Chart, Audio/Video, Link.

#### Scenario: User inserts an image on a slide
- **WHEN** user clicks Insert > Picture and selects a file
- **THEN** the image appears centered on the active slide as a resizable shape

### Requirement: Slideshow mode
The system SHALL provide a slideshow/fullscreen mode that presents slides in order with transitions and animations. Users SHALL advance with click, arrow keys, or spacebar. Escape SHALL exit slideshow.

#### Scenario: User starts slideshow
- **WHEN** user clicks the Slideshow button (or press F5)
- **THEN** the editor enters fullscreen and displays slide 1 with transitions/animations enabled

#### Scenario: User navigates in slideshow
- **WHEN** user presses Right Arrow during slideshow
- **THEN** the next slide appears with its transition effect
