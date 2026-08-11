## ADDED Requirements

### Requirement: Subscript formatting
The editor SHALL support subscript text formatting via TipTap's Subscript extension. Users SHALL be able to toggle subscript on selected text.

#### Scenario: Apply subscript to selected text
- **WHEN** user selects text and clicks the subscript toolbar button
- **THEN** the selected text SHALL render as `<sub>` in the HTML output

#### Scenario: Remove subscript from subscripted text
- **WHEN** user selects subscripted text and clicks the subscript toolbar button
- **THEN** the subscript formatting SHALL be removed

### Requirement: Superscript formatting
The editor SHALL support superscript text formatting via TipTap's Superscript extension. Users SHALL be able to toggle superscript on selected text.

#### Scenario: Apply superscript to selected text
- **WHEN** user selects text and clicks the superscript toolbar button
- **THEN** the selected text SHALL render as `<sup>` in the HTML output

#### Scenario: Remove superscript from superscripted text
- **WHEN** user selects superscripted text and clicks the superscript toolbar button
- **THEN** the superscript formatting SHALL be removed

### Requirement: Text color
The editor SHALL support text color via TipTap's Color extension. Users SHALL be able to choose a color from a color picker and apply it to selected text.

#### Scenario: Apply text color
- **WHEN** user selects text, opens the color picker, and picks a color
- **THEN** the selected text SHALL render with `style="color: <value>"` in the HTML output

#### Scenario: Remove text color
- **WHEN** user selects colored text and chooses "no color" or "default"
- **THEN** the text color SHALL be removed

### Requirement: Text highlight
The editor SHALL support text highlight (background color) via TipTap's Highlight extension. Users SHALL be able to choose a highlight color from a color picker.

#### Scenario: Apply highlight
- **WHEN** user selects text and clicks the highlight button
- **THEN** the selected text SHALL render with `<mark>` tag or `style="background-color: <value>"` in the HTML output

### Requirement: Font family
The editor SHALL support font family selection via TipTap's FontFamily extension. Users SHALL be able to choose from a set of common fonts.

#### Scenario: Change font family
- **WHEN** user selects text and picks "Arial" from the font family dropdown
- **THEN** the selected text SHALL render with `style="font-family: Arial"` in the HTML output

### Requirement: Font size increase/decrease
The editor SHALL support increasing and decreasing the font size of selected text via toolbar buttons.

#### Scenario: Increase font size
- **WHEN** user selects text and clicks the font size increase (A+) button
- **THEN** the font size of the selected text SHALL increase by one standard increment

#### Scenario: Decrease font size
- **WHEN** user selects text and clicks the font size decrease (A-) button
- **THEN** the font size of the selected text SHALL decrease by one standard increment

### Requirement: Clear formatting
The editor SHALL support removing all formatting (marks) from selected text via a "Clear Formatting" toolbar button.

#### Scenario: Clear all formatting
- **WHEN** user selects text with multiple formatting marks (bold, italic, color, font family) and clicks "Clear Formatting"
- **THEN** all formatting SHALL be removed, leaving only the plain text

### Requirement: Backend inline style roundtrip
The wo-html model SHALL preserve inline CSS style properties (color, background-color, font-family, font-size) through HTML parse→serialize cycles.

#### Scenario: Parse and serialize inline style
- **WHEN** an HTML string containing `<span style="color: red">text</span>` is parsed and re-serialized
- **THEN** the output SHALL contain the same `style="color: red"` attribute
