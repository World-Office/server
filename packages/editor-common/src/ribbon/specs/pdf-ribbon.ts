import type { RibbonContext, RibbonSpec } from "../types"
import { cloudTab } from "./cloud-spec"

/**
 * PDF editor ribbon spec — mirrors ONLYOFFICE PDF Editor ribbon 1:1.
 *
 * Tabs: Home, Comment, Insert, Redact, Forms, View, Cloud
 */
export const pdfRibbonSpec: RibbonSpec = {
  tabs: [
    // ── Home ──────────────────────────────────────────────────────────────
    {
      id: "home",
      label: "Home",
      groups: [
        {
          id: "navigation",
          label: "Navigation",
          controls: [
            { id: "first-page", type: "button", icon: "ChevronsLeft", label: "First", command: "goToFirstPage", tooltip: "Go to first page" },
            { id: "prev-page", type: "button", icon: "ChevronLeft", label: "Previous", command: "goToPrevPage", tooltip: "Go to previous page" },
            { id: "next-page", type: "button", icon: "ChevronRight", label: "Next", command: "goToNextPage", tooltip: "Go to next page" },
            { id: "last-page", type: "button", icon: "ChevronsRight", label: "Last", command: "goToLastPage", tooltip: "Go to last page" },
          ],
        },
        {
          id: "zoom",
          label: "Zoom",
          controls: [
            {
              id: "zoom-level",
              type: "select",
              label: "Zoom",
              tooltip: "Zoom level",
              options: [
                { value: "50", label: "50%" },
                { value: "75", label: "75%" },
                { value: "100", label: "100%" },
                { value: "125", label: "125%" },
                { value: "150", label: "150%" },
                { value: "200", label: "200%" },
              ],
              value: () => "100",
              onChange: (val: string) =>
                window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: "setZoom", value: val } })),
            },
            {
              id: "fit-page",
              type: "button",
              icon: "Maximize",
              label: "Fit to Page",
              command: "toggleFitToPage",
              toggleable: true,
              tooltip: "Fit the page to the viewport",
            },
            {
              id: "fit-width",
              type: "button",
              icon: "Columns2",
              label: "Fit to Width",
              command: "toggleFitToWidth",
              toggleable: true,
              tooltip: "Fit to the width of the viewport",
            },
          ],
        },
        {
          id: "edit-mode",
          label: "Edit Mode",
          controls: [
            {
              id: "toggle-edit-mode",
              type: "button",
              icon: "Edit3",
              label: "Edit Mode",
              command: "toggleEditMode",
              toggleable: true,
              toggled: (ctx: RibbonContext) => ctx.isEditMode,
              tooltip: "Toggle edit mode",
            },
          ],
        },
        {
          id: "tools",
          label: "Tools",
          controls: [
            { id: "select-tool", type: "button", icon: "MousePointer", label: "Select", command: "toggleSelect", toggleable: true, tooltip: "Select tool" },
            { id: "hand-tool", type: "button", icon: "Hand", label: "Hand", command: "toggleHand", toggleable: true, tooltip: "Hand tool for panning" },
          ],
        },
        {
          id: "clipboard",
          label: "Clipboard",
          controls: [
            { id: "cut", type: "button", icon: "Scissors", label: "Cut", command: "cut", shortcut: "Ctrl+X" },
            { id: "copy", type: "button", icon: "Copy", label: "Copy", command: "copy", shortcut: "Ctrl+C" },
            { id: "paste", type: "button", icon: "ClipboardPaste", label: "Paste", command: "paste", shortcut: "Ctrl+V" },
          ],
        },
        {
          id: "editing",
          label: "Editing",
          controls: [
            { id: "find", type: "button", icon: "Search", label: "Find", command: "find", shortcut: "Ctrl+F" },
            { id: "replace", type: "button", icon: "Replace", label: "Replace", command: "replace", shortcut: "Ctrl+H" },
            { id: "select-all", type: "button", icon: "CheckSquare", label: "Select All", command: "selectAll", shortcut: "Ctrl+A" },
          ],
        },
      ],
    },
    {
      id: "comment",
      label: "Comment",
      groups: [
        {
          id: "annotations",
          label: "Annotations",
          controls: [
            { id: "text-comment", type: "button", icon: "MessageSquare", label: "Text Comment", command: "annotationTextComment", toggleable: true },
            { id: "stamp", type: "button", icon: "BadgeCheck", label: "Stamp", command: "annotationStamp", toggleable: true },
            { id: "shape-comment", type: "button", icon: "Shapes", label: "Shape Comment", command: "annotationShapeComment", toggleable: true },
          ],
        },
        {
          id: "markup",
          label: "Markup",
          controls: [
            { id: "highlight", type: "button", icon: "Highlighter", label: "Highlight", command: "annotationHighlight", toggleable: true },
          ],
        },
        {
          id: "text-markup",
          label: "Text",
          controls: [
            { id: "strikeout", type: "button", icon: "Strikethrough", label: "Strikeout", command: "annotationStrikeout", toggleable: true },
            { id: "underline-annotation", type: "button", icon: "Underline", label: "Underline", command: "annotationUnderline", toggleable: true },
          ],
        },
      ],
    },
    {
      id: "insert",
      label: "Insert",
      visible: (ctx) => ctx.isEditMode,
      groups: [
        {
          id: "insert-objects",
          label: "Insert",
          controls: [
            { id: "insert-table", type: "button", icon: "Table2", label: "Table", command: "insertTable" },
            { id: "insert-image", type: "button", icon: "Image", label: "Image", command: "insertImage" },
            { id: "insert-shape", type: "button", icon: "Shapes", label: "Shape", command: "insertShape" },
          ],
        },
        {
          id: "insert-text",
          label: "Text",
          controls: [
            { id: "insert-text", type: "button", icon: "Type", label: "Text", command: "insertText" },
            { id: "insert-equation", type: "button", icon: "Sigma", label: "Equation", command: "insertEquation" },
          ],
        },
        {
          id: "insert-illustrations",
          label: "Illustrations",
          controls: [
            { id: "insert-chart", type: "button", icon: "BarChart3", label: "Chart", command: "insertChart" },
            { id: "insert-smartart", type: "button", icon: "GitGraph", label: "SmartArt", command: "insertSmartArt" },
          ],
        },
        {
          id: "insert-special",
          label: "Special",
          controls: [
            { id: "insert-textart", type: "button", icon: "Paintbrush", label: "TextArt", command: "insertTextArt" },
            { id: "insert-symbol", type: "button", icon: "Omega", label: "Symbol", command: "insertSymbol" },
            { id: "insert-hyperlink", type: "button", icon: "Link", label: "Hyperlink", command: "insertHyperlink" },
          ],
        },
      ],
    },
    {
      id: "redact",
      label: "Redact",
      visible: (ctx) => ctx.isEditMode,
      groups: [
        {
          id: "redact-mark",
          label: "Mark",
          controls: [
            { id: "mark-redaction", type: "button", icon: "EyeOff", label: "Mark for Redaction", command: "markRedaction" },
          ],
        },
        {
          id: "redact-pages",
          label: "Pages",
          controls: [
            { id: "redact-pages-btn", type: "button", icon: "FileX", label: "Redact Pages", command: "redactPages" },
          ],
        },
        {
          id: "redact-apply",
          label: "Apply",
          controls: [
            { id: "apply-redactions", type: "button", icon: "CheckCircle", label: "Apply Redactions", command: "applyRedactions", toggleable: true, tooltip: "Apply all marked redactions" },
          ],
        },
        {
          id: "redact-search",
          label: "Search",
          controls: [
            { id: "find-redact", type: "button", icon: "Search", label: "Find to Redact", command: "findRedact" },
          ],
        },
      ],
    },
    {
      id: "forms",
      label: "Forms",
      visible: (ctx) => ctx.isEditMode,
      groups: [
        {
          id: "form-fields",
          label: "Form Fields",
          controls: [
            { id: "form-text", type: "button", icon: "Type", label: "Text Field", command: "addFormField", tooltip: "Text Field", enabled: () => false },
            { id: "form-combobox", type: "button", icon: "List", label: "Combo", command: "addFormField", tooltip: "Combo Box", enabled: () => false },
            { id: "form-dropdown", type: "button", icon: "ChevronDown", label: "Dropdown", command: "addFormField", tooltip: "Dropdown", enabled: () => false },
            { id: "form-checkbox", type: "button", icon: "CheckSquare", label: "Checkbox", command: "addFormField", tooltip: "Checkbox", enabled: () => false },
            { id: "form-radio", type: "button", icon: "Circle", label: "Radio", command: "addFormField", tooltip: "Radio Button", enabled: () => false },
            { id: "form-picture", type: "button", icon: "Image", label: "Image", command: "addFormField", tooltip: "Image Field", enabled: () => false },
            { id: "form-email", type: "button", icon: "Mail", label: "Email", command: "addFormField", tooltip: "Email Field", enabled: () => false },
            { id: "form-phone", type: "button", icon: "Phone", label: "Phone", command: "addFormField", tooltip: "Phone Field", enabled: () => false },
            { id: "form-datetime", type: "button", icon: "Calendar", label: "DateTime", command: "addFormField", tooltip: "Date/Time Field", enabled: () => false },
            { id: "form-zipcode", type: "button", icon: "MapPin", label: "ZipCode", command: "addFormField", tooltip: "Zip Code", enabled: () => false },
            { id: "form-credit", type: "button", icon: "CreditCard", label: "Credit Card", command: "addFormField", tooltip: "Credit Card", enabled: () => false },
          ],
        },
      ],
    },
    {
      id: "view",
      label: "View",
      groups: [
        {
          id: "view-zoom",
          label: "Zoom",
          controls: [
            {
              id: "view-zoom-level",
              type: "select",
              label: "Zoom",
              tooltip: "Zoom level",
              options: [
                { value: "50", label: "50%" },
                { value: "75", label: "75%" },
                { value: "100", label: "100%" },
                { value: "125", label: "125%" },
                { value: "150", label: "150%" },
                { value: "200", label: "200%" },
              ],
              value: () => "100",
              onChange: (val: string) =>
                window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: "setZoom", value: val } })),
              width: 70,
            },
            { id: "view-fit-page", type: "button", icon: "Maximize", label: "Fit to Page", command: "toggleFitToPage", toggleable: true },
            { id: "view-fit-width", type: "button", icon: "Columns2", label: "Fit to Width", command: "toggleFitToWidth", toggleable: true },
          ],
        },
        {
          id: "view-theme",
          label: "Theme",
          controls: [
            { id: "interface-theme", type: "button", icon: "Palette", label: "Interface Theme", command: "toggleTheme", tooltip: "Switch between light and dark theme" },
          ],
        },
        {
          id: "view-show-hide",
          label: "Show/Hide",
          controls: [
            { id: "show-toolbar", type: "checkbox", label: "Always show toolbar", checked: () => true, onChange: (checked: boolean) =>
              window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: "toggleCompactToolbar", value: String(!checked) } })) },
            { id: "show-statusbar", type: "checkbox", label: "Status Bar", checked: () => true, onChange: (checked: boolean) =>
              window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: "toggleStatusbar", value: String(checked) } })) },
            { id: "show-left-panel", type: "checkbox", label: "Left Panel", checked: () => true, onChange: (checked: boolean) =>
              window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: "toggleLeftPanel", value: String(checked) } })) },
            { id: "show-right-panel", type: "checkbox", label: "Right Panel", checked: () => false, onChange: (checked: boolean) =>
              window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: "toggleRightPanel", value: String(checked) } })) },
          ],
        },
        {
          id: "view-code",
          label: "Code Editor",
          controls: [
            { id: "toggle-word-wrap", type: "button", icon: "WrapText", label: "Toggle Word Wrap", command: "toggleWordWrap", shortcut: "Alt+Z" },
            { id: "toggle-minimap", type: "button", icon: "Map", label: "Toggle Minimap", command: "toggleMinimap" },
          ],
        },
      ],
    },
    cloudTab,
  ],
}
