## ADDED Requirements

### Requirement: Font formatting buttons wired to Univer
The system SHALL connect font formatting toolbar buttons (Bold, Italic, Underline, Strikethrough) to the Univer API. Clicking Bold SHALL toggle bold on the active cell selection. The active state of each button SHALL reflect the current cell's formatting.

#### Scenario: User toggles bold on selected cells
- **WHEN** user selects cells A1:A3 and clicks Bold in the toolbar
- **THEN** Univer applies bold formatting to A1:A3 and the Bold button shows active state

#### Scenario: Active state reflects mixed formatting
- **WHEN** user selects cells where some are bold and some are not
- **THEN** Bold button shows indeterminate/mixed state

### Requirement: Font family and size selection
The system SHALL provide a ComboBox for font family and a SpinBox for font size that apply to the active cell selection. Both SHALL display the current cell's font properties.

#### Scenario: User changes font family
- **WHEN** user selects cell B2, opens font ComboBox, and selects "Arial"
- **THEN** B2's font changes to Arial and the ComboBox shows "Arial"

#### Scenario: User enters custom font size
- **WHEN** user types "18" in the size SpinBox and presses Enter
- **THEN** selected cells' font size changes to 18pt

### Requirement: Alignment buttons wired to Univer
The system SHALL connect alignment buttons (AlignLeft, AlignCenter, AlignRight, AlignJustify, Merge & Center, Wrap Text) to the Univer API.

#### Scenario: User merges and centers cells
- **WHEN** user selects A1:C1 and clicks "Merge & Center"
- **THEN** cells merge into one cell with centered text

### Requirement: Number formatting buttons
The system SHALL connect number formatting buttons (Currency, Percent, Decimal) to the Univer API. Selecting a format SHALL apply the corresponding number pattern to selected cells.

#### Scenario: User applies currency format
- **WHEN** user selects cells with numeric values and clicks Currency
- **THEN** values display with currency symbol and 2 decimal places (e.g., "$1,234.56")

### Requirement: Fill color and text color
The system SHALL connect the fill color (PaintBucket) and text color (Palette) buttons to the Univer API via the ColorPicker component. Each SHALL show the current cell's fill/text color.

#### Scenario: User applies fill color to cell
- **WHEN** user selects cell A1, clicks fill color, and picks yellow
- **THEN** A1's background becomes yellow

### Requirement: Cell insert and delete operations
The system SHALL connect Insert Cells and Delete Cells buttons to the Univer API. Insert SHALL shift existing cells down/right. Delete SHALL shift cells up/left.

#### Scenario: User inserts a row
- **WHEN** user selects row 3 and clicks "Insert Cells" with "shift down" option
- **THEN** a new empty row appears at row 3 and existing rows shift down

### Requirement: Auto Sum, Sort, and Filter
The system SHALL connect Auto Sum, Sort, and Filter buttons to the Univer API. Auto Sum SHALL insert SUM formula for the selection. Sort SHALL sort selected range ascending/descending. Filter SHALL toggle column filter dropdowns.

#### Scenario: User auto-sums a column
- **WHEN** user selects A1:A10 and clicks Auto Sum
- **THEN** cell A11 gets formula `=SUM(A1:A10)` and displays the sum

#### Scenario: User filters a column
- **WHEN** user clicks Filter on column B
- **THEN** dropdown appears with unique values; checking/unchecking values filters rows

### Requirement: Formula bar
The system SHALL display a formula bar above the grid showing the active cell's formula (or value if no formula). Editing in the formula bar SHALL update the cell. Pressing Enter SHALL commit and move down.

#### Scenario: User edits formula in formula bar
- **WHEN** user clicks the formula bar, types `=SUM(A1:A10)`, and presses Enter
- **THEN** the active cell shows the formula and the calculated result

#### Scenario: Formula bar shows cell reference
- **WHEN** user navigates to cell C5 which contains `=A1+B1`
- **THEN** formula bar displays `=A1+B1`, not the computed value

### Requirement: Chart insertion
The system SHALL allow inserting charts (bar, line, pie, scatter) from the Insert tab. The chart SHALL visualize data from the selected cell range.

#### Scenario: User inserts a bar chart
- **WHEN** user selects A1:B10 and clicks Insert > Chart > Bar
- **THEN** a bar chart appears on the sheet showing the data from the selected range

### Requirement: Pivot tables
The system SHALL allow creating pivot tables from selected data ranges via Insert > PivotTable. The pivot table editor SHALL support row/column/value field assignment.

#### Scenario: User creates pivot table
- **WHEN** user selects a data range and clicks Insert > PivotTable
- **THEN** a pivot table is created on a new sheet with a field configuration panel

### Requirement: Conditional formatting
The system SHALL connect conditional formatting to the Univer API via a dialog. Users SHALL apply rules: highlight cells (greater than, less than, between), data bars, color scales, icon sets.

#### Scenario: User applies conditional formatting
- **WHEN** user selects A1:A100, clicks Conditional Formatting > Highlight Cells > Greater Than, and enters "50"
- **THEN** all cells with value > 50 get highlighted with the selected format

### Requirement: Data validation
The system SHALL allow setting data validation rules on cells (dropdown list, number range, date range, text length). Invalid input SHALL show an error alert.

#### Scenario: User sets dropdown validation
- **WHEN** user selects B1:B10, clicks Data Validation, chooses "List", and enters "Yes,No,Maybe"
- **THEN** cells B1:B10 show a dropdown with the three options

### Requirement: Sheet tabs
The system SHALL display sheet tabs at the bottom of the grid. Users SHALL add, rename, delete, reorder, and duplicate sheets. Right-click context menu SHALL provide all operations.

#### Scenario: User adds a new sheet
- **WHEN** user clicks the "+" button on the sheet tab bar
- **THEN** a new sheet named "Sheet2" appears and becomes active

#### Scenario: User renames a sheet
- **WHEN** user double-clicks a sheet tab, types "Q4 Report", and presses Enter
- **THEN** the sheet is renamed to "Q4 Report"
