import type { RibbonSpec } from "../types"
import { cloudTab } from "./cloud-spec"

/**
 * Spreadsheet editor ribbon spec — mirrors ONLYOFFICE Spreadsheet Editor ribbon 1:1.
 *
 * Tabs: Home, Insert, Layout, Formula, DataTable (contextual), Cloud
 */
export const spreadsheetRibbonSpec: RibbonSpec = {
  tabs: [
    // ── Home ──────────────────────────────────────────────────────────────
    {
      id: "home",
      label: "Home",
      groups: [
        {
          id: "clipboard",
          label: "Clipboard",
          controls: [
            {
              id: "cut",
              type: "button",
              icon: "Scissors",
              label: "Cut",
              command: "cut",
              shortcut: "Ctrl+X",
            },
            {
              id: "copy",
              type: "button",
              icon: "Copy",
              label: "Copy",
              command: "copy",
              shortcut: "Ctrl+C",
            },
            {
              id: "paste",
              type: "button",
              icon: "ClipboardPaste",
              label: "Paste",
              command: "paste",
              shortcut: "Ctrl+V",
            },
            {
              id: "format-painter",
              type: "button",
              icon: "Paintbrush",
              label: "Format Painter",
              command: "formatPainter",
            },
          ],
        },
        {
          id: "font",
          label: "Font",
          controls: [
            {
              id: "bold",
              type: "button",
              icon: "Bold",
              label: "Bold",
              command: "bold",
              toggleable: true,
              shortcut: "Ctrl+B",
              enabled: () => false,
            },
            {
              id: "italic",
              type: "button",
              icon: "Italic",
              label: "Italic",
              command: "italic",
              toggleable: true,
              shortcut: "Ctrl+I",
              enabled: () => false,
            },
            {
              id: "underline",
              type: "button",
              icon: "Underline",
              label: "Underline",
              command: "underline",
              toggleable: true,
              shortcut: "Ctrl+U",
              enabled: () => false,
            },
            {
              id: "strikethrough",
              type: "button",
              icon: "Strikethrough",
              label: "Strike",
              command: "strikethrough",
              toggleable: true,
              enabled: () => false,
            },
            {
              id: "increase-font-size",
              type: "button",
              icon: "Type",
              label: "Increase Size",
              command: "increaseFontSize",
              enabled: () => false,
            },
            {
              id: "decrease-font-size",
              type: "button",
              icon: "Type",
              label: "Decrease Size",
              command: "decreaseFontSize",
              enabled: () => false,
            },
            {
              id: "text-color",
              type: "color-picker",
              label: "Text Color",
              color: () => "#000000",
              onChange: () => {},
              enabled: () => false,
            },
            {
              id: "fill-color",
              type: "color-picker",
              label: "Fill Color",
              color: () => "#FFFFFF",
              onChange: () => {},
              enabled: () => false,
            },
          ],
        },
        {
          id: "alignment",
          label: "Alignment",
          controls: [
            {
              id: "align-left",
              type: "button",
              icon: "AlignLeft",
              label: "Left",
              command: "alignLeft",
              toggleable: true,
            },
            {
              id: "align-center",
              type: "button",
              icon: "AlignCenter",
              label: "Center",
              command: "alignCenter",
              toggleable: true,
            },
            {
              id: "align-right",
              type: "button",
              icon: "AlignRight",
              label: "Right",
              command: "alignRight",
              toggleable: true,
            },
            {
              id: "merge-cells",
              type: "button",
              icon: "Combine",
              label: "Merge & Center",
              command: "mergeCells",
            },
            {
              id: "wrap-text",
              type: "button",
              icon: "WrapText",
              label: "Wrap Text",
              command: "wrapText",
              toggleable: true,
            },
          ],
        },
        {
          id: "number",
          label: "Number",
          controls: [
            {
              id: "currency-format",
              type: "button",
              icon: "DollarSign",
              label: "Currency",
              command: "currencyFormat",
            },
            {
              id: "percent-format",
              type: "button",
              icon: "Percent",
              label: "Percent",
              command: "percentFormat",
            },
            {
              id: "decimal-format",
              type: "button",
              icon: "Sigma",
              label: "Decimal",
              command: "decimalFormat",
            },
          ],
        },
        {
          id: "styles",
          label: "Styles",
          controls: [
            {
              id: "cell-styles",
              type: "button",
              icon: "Palette",
              label: "Cell Styles",
              command: "cellStyles",
            },
            {
              id: "conditional-formatting",
              type: "button",
              icon: "PaintBucket",
              label: "Conditional",
              command: "conditionalFormatting",
            },
          ],
        },
        {
          id: "cells",
          label: "Cells",
          controls: [
            {
              id: "insert-cells",
              type: "button",
              icon: "SquarePlus",
              label: "Insert",
              command: "insertCells",
            },
            {
              id: "delete-cells",
              type: "button",
              icon: "Trash2",
              label: "Delete",
              command: "deleteCells",
            },
            {
              id: "format-cells",
              type: "button",
              icon: "Table",
              label: "Format",
              command: "formatCells",
            },
          ],
        },
        {
          id: "editing",
          label: "Editing",
          controls: [
            {
              id: "find",
              type: "button",
              icon: "Search",
              label: "Find",
              command: "find",
              shortcut: "Ctrl+F",
            },
            {
              id: "replace",
              type: "button",
              icon: "Replace",
              label: "Replace",
              command: "replace",
              shortcut: "Ctrl+H",
            },
            {
              id: "sum",
              type: "button",
              icon: "Sigma",
              label: "Sum",
              command: "sum",
              shortcut: "Alt+=",
            },
            { id: "sort", type: "button", icon: "ArrowUpDown", label: "Sort", command: "sort" },
            { id: "filter", type: "button", icon: "Filter", label: "Filter", command: "filter" },
          ],
        },
      ],
    },

    // ── Insert ────────────────────────────────────────────────────────────
    {
      id: "insert",
      label: "Insert",
      visible: (ctx) => ctx.isEditMode,
      groups: [
        {
          id: "tables",
          label: "Tables",
          controls: [
            {
              id: "pivot-table",
              type: "button",
              icon: "Table2",
              label: "PivotTable",
              command: "pivotTable",
            },
            {
              id: "insert-table",
              type: "button",
              icon: "Grid3x3",
              label: "Table",
              command: "insertTable",
            },
          ],
        },
        {
          id: "charts",
          label: "Charts",
          controls: [
            {
              id: "column-chart",
              type: "button",
              icon: "BarChart3",
              label: "Column",
              command: "insertColumnChart",
            },
            {
              id: "line-chart",
              type: "button",
              icon: "TrendingUp",
              label: "Line",
              command: "insertLineChart",
            },
            {
              id: "pie-chart",
              type: "button",
              icon: "PieChart",
              label: "Pie",
              command: "insertPieChart",
            },
            {
              id: "bar-chart",
              type: "button",
              icon: "BarChartHorizontal",
              label: "Bar",
              command: "insertBarChart",
            },
            {
              id: "area-chart",
              type: "button",
              icon: "AreaChart",
              label: "Area",
              command: "insertAreaChart",
            },
            {
              id: "scatter-chart",
              type: "button",
              icon: "ScatterChart",
              label: "Scatter",
              command: "insertScatterChart",
            },
          ],
        },
        {
          id: "images",
          label: "Images",
          controls: [
            {
              id: "insert-picture",
              type: "button",
              icon: "Image",
              label: "Picture",
              command: "insertPicture",
            },
            {
              id: "online-pictures",
              type: "button",
              icon: "Globe",
              label: "Online",
              command: "onlinePictures",
            },
          ],
        },
        {
          id: "shapes",
          label: "Shapes",
          controls: [
            {
              id: "insert-shape",
              type: "button",
              icon: "Shapes",
              label: "Shape",
              command: "insertShape",
            },
          ],
        },
        {
          id: "links",
          label: "Links",
          controls: [
            {
              id: "insert-link",
              type: "button",
              icon: "Link",
              label: "Link",
              command: "insertLink",
              shortcut: "Ctrl+K",
            },
          ],
        },
        {
          id: "text",
          label: "Text",
          controls: [
            {
              id: "insert-header",
              type: "button",
              icon: "Heading",
              label: "Header",
              command: "insertHeader",
            },
            {
              id: "insert-footer",
              type: "button",
              icon: "Heading",
              label: "Footer",
              command: "insertFooter",
            },
          ],
        },
        {
          id: "sparklines",
          label: "Sparklines",
          controls: [
            {
              id: "line-sparkline",
              type: "button",
              icon: "LineChart",
              label: "Line",
              command: "insertLineSparkline",
            },
            {
              id: "column-sparkline",
              type: "button",
              icon: "BarChart3",
              label: "Column",
              command: "insertColumnSparkline",
            },
            {
              id: "win-loss-sparkline",
              type: "button",
              icon: "TrendingUp",
              label: "Win/Loss",
              command: "insertWinLossSparkline",
            },
          ],
        },
        {
          id: "icons",
          label: "Icons",
          controls: [
            {
              id: "insert-icons",
              type: "button",
              icon: "Smile",
              label: "Icons",
              command: "insertIcons",
            },
          ],
        },
      ],
    },

    // ── Layout ────────────────────────────────────────────────────────────
    {
      id: "layout",
      label: "Layout",
      visible: (ctx) => ctx.isEditMode,
      groups: [
        {
          id: "page-setup",
          label: "Page Setup",
          controls: [
            {
              id: "margins",
              type: "select",
              label: "Margins",
              value: () => "normal",
              onChange: (val: string) =>
                window.dispatchEvent(
                  new CustomEvent("wo-command", { detail: { command: "setMargins", value: val } }),
                ),
              options: [
                { value: "normal", label: "Normal" },
                { value: "wide", label: "Wide" },
                { value: "narrow", label: "Narrow" },
              ],
            },
            {
              id: "orientation",
              type: "select",
              label: "Orientation",
              value: () => "portrait",
              onChange: (val: string) =>
                window.dispatchEvent(
                  new CustomEvent("wo-command", {
                    detail: { command: "setOrientation", value: val },
                  }),
                ),
              options: [
                { value: "portrait", label: "Portrait" },
                { value: "landscape", label: "Landscape" },
              ],
            },
            {
              id: "size",
              type: "select",
              label: "Size",
              value: () => "letter",
              onChange: (val: string) =>
                window.dispatchEvent(
                  new CustomEvent("wo-command", { detail: { command: "setPageSize", value: val } }),
                ),
              options: [
                { value: "letter", label: "Letter" },
                { value: "legal", label: "Legal" },
                { value: "a4", label: "A4" },
              ],
            },
          ],
        },
        {
          id: "sheet-options",
          label: "Sheet Options",
          controls: [
            {
              id: "gridlines",
              type: "checkbox",
              label: "Gridlines",
              checked: () => true,
              onChange: () => {},
            },
            {
              id: "headings",
              type: "checkbox",
              label: "Headings",
              checked: () => true,
              onChange: () => {},
            },
          ],
        },
        {
          id: "arrange",
          label: "Arrange",
          controls: [
            {
              id: "bring-forward",
              type: "button",
              icon: "BringToFront",
              label: "Bring Forward",
              command: "bringForward",
            },
            {
              id: "send-backward",
              type: "button",
              icon: "SendToBack",
              label: "Send Backward",
              command: "sendBackward",
            },
            {
              id: "bring-to-front",
              type: "button",
              icon: "BringToFront",
              label: "Bring to Front",
              command: "bringToFront",
            },
            {
              id: "send-to-back",
              type: "button",
              icon: "SendToBack",
              label: "Send to Back",
              command: "sendToBack",
            },
            {
              id: "align",
              type: "button",
              icon: "AlignStartVertical",
              label: "Align",
              command: "alignObjects",
            },
            { id: "group", type: "button", icon: "Group", label: "Group", command: "groupObjects" },
            {
              id: "ungroup",
              type: "button",
              icon: "Ungroup",
              label: "Ungroup",
              command: "ungroupObjects",
            },
          ],
        },
      ],
    },

    // ── Formula ───────────────────────────────────────────────────────────
    {
      id: "formula",
      label: "Formula",
      groups: [
        {
          id: "function-library",
          label: "Function Library",
          controls: [
            {
              id: "func-sum",
              type: "button",
              icon: "Sigma",
              label: "Sum",
              command: "funcSum",
              shortcut: "Alt+=",
            },
            {
              id: "func-average",
              type: "button",
              icon: "Equal",
              label: "Average",
              command: "funcAverage",
            },
            {
              id: "func-count",
              type: "button",
              icon: "Hash",
              label: "Count",
              command: "funcCount",
            },
            { id: "func-min", type: "button", icon: "Minus", label: "Min", command: "funcMin" },
            { id: "func-max", type: "button", icon: "Plus", label: "Max", command: "funcMax" },
            { id: "func-if", type: "button", icon: "GitBranch", label: "IF", command: "funcIf" },
            {
              id: "func-vlookup",
              type: "button",
              icon: "Search",
              label: "VLOOKUP",
              command: "funcVLookup",
            },
          ],
        },
        {
          id: "defined-names",
          label: "Defined Names",
          controls: [
            {
              id: "name-manager",
              type: "button",
              icon: "FileSpreadsheet",
              label: "Name Manager",
              command: "nameManager",
            },
            {
              id: "create-from-selection",
              type: "button",
              icon: "BadgePlus",
              label: "Create from Selection",
              command: "createFromSelection",
            },
          ],
        },
        {
          id: "formula-auditing",
          label: "Formula Auditing",
          controls: [
            {
              id: "trace-precedents",
              type: "button",
              icon: "ArrowUpCircle",
              label: "Trace Precedents",
              command: "tracePrecedents",
            },
            {
              id: "trace-dependents",
              type: "button",
              icon: "ArrowDownCircle",
              label: "Trace Dependents",
              command: "traceDependents",
            },
          ],
        },
        {
          id: "calculation",
          label: "Calculation",
          controls: [
            {
              id: "calculate-automatic",
              type: "button",
              icon: "Play",
              label: "Automatic",
              command: "calcAutomatic",
              toggleable: true,
            },
            {
              id: "calculate-manual",
              type: "button",
              icon: "Square",
              label: "Manual",
              command: "calcManual",
              toggleable: true,
            },
          ],
        },
      ],
    },

    // ── DataTable (contextual) ────────────────────────────────────────────
    {
      id: "datatable",
      label: "DataTable",
      visible: () => false, // Shown when a table is selected — toggle via context when ready
      groups: [
        {
          id: "table-style-options",
          label: "Style Options",
          controls: [
            {
              id: "header-row",
              type: "checkbox",
              label: "Header Row",
              checked: () => true,
              onChange: () => {},
            },
            {
              id: "total-row",
              type: "checkbox",
              label: "Total Row",
              checked: () => false,
              onChange: () => {},
            },
            {
              id: "first-column",
              type: "checkbox",
              label: "First Column",
              checked: () => false,
              onChange: () => {},
            },
            {
              id: "last-column",
              type: "checkbox",
              label: "Last Column",
              checked: () => false,
              onChange: () => {},
            },
          ],
        },
        {
          id: "table-styles",
          label: "Table Styles",
          controls: [
            {
              id: "table-style-light",
              type: "button",
              icon: "Sun",
              label: "Light",
              command: "tableStyleLight",
            },
            {
              id: "table-style-medium",
              type: "button",
              icon: "Equal",
              label: "Medium",
              command: "tableStyleMedium",
            },
            {
              id: "table-style-dark",
              type: "button",
              icon: "Moon",
              label: "Dark",
              command: "tableStyleDark",
            },
          ],
        },
        {
          id: "banded-rows",
          label: "Banded Rows",
          controls: [
            {
              id: "banded-rows",
              type: "checkbox",
              label: "Banded Rows",
              checked: () => true,
              onChange: () => {},
            },
            {
              id: "banded-columns",
              type: "checkbox",
              label: "Banded Columns",
              checked: () => false,
              onChange: () => {},
            },
          ],
        },
        {
          id: "first-last-columns",
          label: "First/Last Columns",
          controls: [
            {
              id: "first-col-highlight",
              type: "checkbox",
              label: "First Column",
              checked: () => false,
              onChange: () => {},
            },
            {
              id: "last-col-highlight",
              type: "checkbox",
              label: "Last Column",
              checked: () => false,
              onChange: () => {},
            },
          ],
        },
      ],
    },

    // ── Cloud ─────────────────────────────────────────────────────────────
    cloudTab,
  ],
}
