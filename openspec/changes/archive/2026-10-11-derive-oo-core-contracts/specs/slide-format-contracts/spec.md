# slide-format-contracts

## ADDED Requirements

### Requirement: PPTX part inventory round-trip (F-300)

The system SHALL preserve the OO PPTX part set: presentation.xml, slides,
slideLayouts, slideMasters, notesMaster, notesSlides, handoutMaster, theme
parts, presProps, viewProps, tableStyles, comments, commentAuthors, app.
Uneditable parts SHALL round-trip byte-faithfully.

#### Scenario: unknown part survives
- **WHEN** a deck containing a part WO cannot parse (e.g. a custom `ppt/tables/…`) is re-saved
- **THEN** the output package still contains that part byte-faithfully

### Requirement: Inheritance chain without flattening (F-301)

A slide's relationship to its layout, and the layout's to its master
(OO `PPTXFormat/Slide.cpp:292`, FileContainer rels), SHALL be preserved by
re-save. Property resolution walks slide → layout → master; re-saving SHALL
NOT copy inherited properties onto the slide part.

#### Scenario: re-save keeps the chain lean
- **WHEN** a slide inherits its title-font from the layout and is re-saved
- **THEN** the slide XML still contains no title-font override

### Requirement: sldIdLst defines slide order (F-302)

Reordering slides SHALL rewrite only `p:presentation/p:sldIdLst` (plus rels);
slide part names and their internal content SHALL NOT change.

#### Scenario: move slide 3 to position 1
- **WHEN** the user reorders and saves
- **THEN** sldIdLst order changes; slide files are byte-identical

### Requirement: Notes and theme preservation (F-303/F-304)

NotesSlides SHALL stay attached to their slides; per-master theme parts SHALL
round-trip untouched.

#### Scenario: notes stay attached
- **WHEN** a slide with a notesSlide is re-saved
- **THEN** the slide's rels still point at the same notesSlide part

### Requirement: Legacy PPT read and ODP write (F-305/F-306)

`.ppt` (OO `MsBinaryFile/PptFile`) SHALL read into the slide IR;
ODP export SHALL use the per-family ODF conversion context (OO
`OdfFile/Writer/Converter/PptxConverter` → `odp_conversion_context`).

#### Scenario: ppt deck loads with slide count
- **WHEN** a 3-slide `.ppt` fixture is opened
- **THEN** the slide IR contains 3 slides in order
