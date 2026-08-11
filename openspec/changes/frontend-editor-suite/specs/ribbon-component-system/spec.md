## ADDED Requirements

### Requirement: ColorPicker component
The system SHALL provide a `ColorPicker` component that renders a grid of preset colors with a "More Colors..." option. It SHALL accept `value`, `onChange`, and `presetColors` props. Clicking a color dispatches `onChange(color)`. It SHALL support recent colors history.

#### Scenario: User picks text color from preset grid
- **WHEN** user clicks a color swatch in the ColorPicker
- **THEN** `onChange("#FF0000")` is called and the picker closes

#### Scenario: User opens custom color dialog
- **WHEN** user clicks "More Colors..."
- **THEN** a native color input dialog opens and `onChange` fires with the selected hex value

### Requirement: DropdownMenu component
The system SHALL provide a `DropdownMenu` component that renders a toggle button and a floating menu panel. It SHALL support nested submenus, checkmark/radio indicators, separators, and keyboard navigation (arrow keys, Enter, Escape).

#### Scenario: User opens dropdown and selects item
- **WHEN** user clicks the toggle button
- **THEN** menu appears below the button with items listed vertically

#### Scenario: User navigates with keyboard
- **WHEN** menu is open and user presses ArrowDown
- **THEN** focus moves to the next menu item. Pressing Enter activates it.

### Requirement: FlyoutPanel component
The system SHALL provide a `FlyoutPanel` component that renders a floating panel anchored to a toolbar button. It SHALL support position hints (below, above, left, right), dismiss on outside click, and optional close button.

#### Scenario: User opens font settings flyout
- **WHEN** user clicks the font size group arrow in the toolbar
- **THEN** a flyout panel appears below showing font size input, increment/decrement buttons, and preview text

#### Scenario: Panel dismisses on outside click
- **WHEN** user clicks outside the flyout panel
- **THEN** the panel closes

### Requirement: ComboBox component
The system SHALL provide a `ComboBox` component combining a text input with a dropdown list. It SHALL support filtering, type-ahead, and selectable items with optional icons.

#### Scenario: User selects font family from combobox
- **WHEN** user types "Ari" into the font combobox
- **THEN** dropdown shows "Arial" filtered from the font list. Selecting it fires `onChange("Arial")`.

### Requirement: SpinBox component
The system SHALL provide a `SpinBox` component for numeric value input with increment/decrement buttons. It SHALL accept `min`, `max`, `step`, `value`, and `onChange` props.

#### Scenario: User increments font size
- **WHEN** user clicks the up arrow on the font size spinbox (current: 12pt, step: 1)
- **THEN** value changes to 13pt and `onChange(13)` fires

#### Scenario: User enters value directly
- **WHEN** user types "24" and presses Enter
- **THEN** value changes to 24 and `onChange(24)` fires

### Requirement: ContextMenu component
The system SHALL provide a `ContextMenu` component that renders on right-click at cursor position. It SHALL support nested items, separators, disabled items, and icons.

#### Scenario: User right-clicks in document
- **WHEN** user right-clicks on selected text
- **THEN** context menu appears with Cut, Copy, Paste, and formatting options

#### Scenario: Context menu dismisses on scroll
- **WHEN** context menu is visible and user scrolls the document
- **THEN** the context menu closes

### Requirement: RibbonSeparator component
The system SHALL provide a `RibbonSeparator` component — a vertical divider between ribbon groups. It SHALL accept optional `label` prop for group labels above the separator.

#### Scenario: Visual separation between clipboard and font groups
- **WHEN** ribbon renders Home tab with Clipboard and Font groups
- **THEN** a vertical line separates the two groups, with "Clipboard" label above the first group

### Requirement: Ribbon spec-driven architecture
All toolbar tabs SHALL be defined declaratively via a spec object (e.g., `wordRibbonSpec`, `sheetRibbonSpec`) passed to a shared `<Ribbon>` component from `@world-office/editor-common`. The Ribbon component SHALL render tabs, groups, buttons, and flyouts from the spec. Each spec entry SHALL define: `id`, `icon`, `label`, `type` (button/dropdown/spinbox/combobox/flyout), `command`, `disabled` predicate, and `active` predicate.

#### Scenario: Document editor renders Home tab from spec
- **WHEN** document editor loads
- **THEN** Ribbon reads `wordRibbonSpec` and renders File, Home, Insert, Layout, Links tabs with all buttons and groups defined declaratively

#### Scenario: Spreadsheet editor uses different spec
- **WHEN** spreadsheet editor loads
- **THEN** Ribbon reads `sheetRibbonSpec` and renders File, Home, Insert, Layout, Formulas, Data tabs
