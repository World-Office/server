import type { RibbonSpec } from "../types"
import { cloudTab } from "./cloud-spec"

/**
 * Word editor ribbon spec — mirrors ONLYOFFICE Document Editor ribbon 1:1.
 *
 * Tabs: File, Home, Insert, Layout, References, View
 * (Forms and Header/Footer are contextual tabs).
 */
export const wordRibbonSpec: RibbonSpec = {
  tabs: [
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
              id: "undo",
              type: "button",
              icon: "Undo2",
              label: "Undo",
              command: "undo",
              shortcut: "Ctrl+Z",
            },
            {
              id: "redo",
              type: "button",
              icon: "Redo2",
              label: "Redo",
              command: "redo",
              shortcut: "Ctrl+Y",
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
            },
            {
              id: "italic",
              type: "button",
              icon: "Italic",
              label: "Italic",
              command: "italic",
              toggleable: true,
              shortcut: "Ctrl+I",
            },
            {
              id: "underline",
              type: "button",
              icon: "Underline",
              label: "Underline",
              command: "underline",
              toggleable: true,
              shortcut: "Ctrl+U",
            },
            {
              id: "strikethrough",
              type: "button",
              icon: "Strikethrough",
              label: "Strike",
              command: "strike",
              toggleable: true,
            },
            {
              id: "subscript",
              type: "button",
              icon: "Subscript",
              label: "Sub",
              command: "subscript",
              toggleable: true,
            },
            {
              id: "superscript",
              type: "button",
              icon: "Superscript",
              label: "Super",
              command: "superscript",
              toggleable: true,
            },
            {
              id: "font-family",
              type: "select",
              label: "Font",
              options: [
                { value: "", label: "Font" },
                { value: "Aptos", label: "Aptos" },
                { value: "Calibri", label: "Calibri" },
                { value: "Arial", label: "Arial" },
                { value: "Times New Roman", label: "Times New Roman" },
                { value: "Courier New", label: "Courier New" },
                { value: "Georgia", label: "Georgia" },
                { value: "Verdana", label: "Verdana" },
              ],
              value: () => "",
              onChange: (val: string) =>
                window.dispatchEvent(
                  new CustomEvent("wo-command", { detail: { command: "fontFamily", value: val } }),
                ),
            },
            {
              id: "font-size",
              type: "select",
              label: "",
              options: [
                { value: "", label: "Size" },
                { value: "8pt", label: "8" },
                { value: "9pt", label: "9" },
                { value: "10pt", label: "10" },
                { value: "11pt", label: "11" },
                { value: "12pt", label: "12" },
                { value: "14pt", label: "14" },
                { value: "16pt", label: "16" },
                { value: "18pt", label: "18" },
                { value: "20pt", label: "20" },
                { value: "24pt", label: "24" },
                { value: "28pt", label: "28" },
                { value: "36pt", label: "36" },
                { value: "48pt", label: "48" },
                { value: "72pt", label: "72" },
              ],
              value: () => "",
              onChange: (val: string) =>
                window.dispatchEvent(
                  new CustomEvent("wo-command", { detail: { command: "fontSize", value: val } }),
                ),
              width: 60,
            },
            {
              id: "text-color",
              type: "color-picker",
              label: "Color",
              color: () => "#000000",
              onChange: (c: string) =>
                window.dispatchEvent(
                  new CustomEvent("wo-command", { detail: { command: "textColor", value: c } }),
                ),
            },
            {
              id: "highlight-color",
              type: "color-picker",
              label: "Highlight",
              color: () => "#ffff00",
              onChange: (c: string) =>
                window.dispatchEvent(
                  new CustomEvent("wo-command", { detail: { command: "highlight", value: c } }),
                ),
            },
            {
              id: "clear-formatting",
              type: "button",
              icon: "RemoveFormatting",
              label: "Clear",
              command: "clearFormatting",
            },
          ],
        },
        {
          id: "paragraph",
          label: "Paragraph",
          controls: [
            {
              id: "bullet-list",
              type: "button",
              icon: "List",
              label: "Bullets",
              command: "bulletList",
              toggleable: true,
            },
            {
              id: "ordered-list",
              type: "button",
              icon: "ListOrdered",
              label: "Numbering",
              command: "orderedList",
              toggleable: true,
            },
            {
              id: "task-list",
              type: "button",
              icon: "ListChecks",
              label: "Tasks",
              command: "taskList",
              toggleable: true,
            },
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
              id: "align-justify",
              type: "button",
              icon: "AlignJustify",
              label: "Justify",
              command: "alignJustify",
              toggleable: true,
            },
            {
              id: "outdent",
              type: "button",
              icon: "IndentDecrease",
              label: "Outdent",
              command: "outdent",
            },
            {
              id: "indent",
              type: "button",
              icon: "IndentIncrease",
              label: "Indent",
              command: "indent",
            },
            {
              id: "line-spacing",
              type: "select",
              label: "Line Spacing",
              options: [
                { value: "1", label: "1.0" },
                { value: "1.15", label: "1.15" },
                { value: "1.5", label: "1.5" },
                { value: "2", label: "2.0" },
                { value: "2.5", label: "2.5" },
                { value: "3", label: "3.0" },
              ],
              value: () => "1.15",
              onChange: (val: string) =>
                window.dispatchEvent(
                  new CustomEvent("wo-command", { detail: { command: "lineSpacing", value: val } }),
                ),
              width: 80,
            },
            {
              id: "text-direction-ltr",
              type: "button",
              icon: "AlignLeft",
              label: "LTR",
              command: "setTextDirection",
              value: "ltr",
            },
            {
              id: "text-direction-rtl",
              type: "button",
              icon: "AlignRight",
              label: "RTL",
              command: "setTextDirection",
              value: "rtl",
            },
          ],
        },
        {
          id: "styles",
          label: "Styles",
          controls: [
            { id: "heading1", type: "button", icon: "Heading1", label: "H1", command: "heading1" },
            { id: "heading2", type: "button", icon: "Heading2", label: "H2", command: "heading2" },
            { id: "heading3", type: "button", icon: "Heading3", label: "H3", command: "heading3" },
            {
              id: "blockquote",
              type: "button",
              icon: "TextQuote",
              label: "Quote",
              command: "blockquote",
            },
            {
              id: "code-block",
              type: "button",
              icon: "Code2",
              label: "Code",
              command: "codeBlock",
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
          id: "pages",
          label: "Pages",
          controls: [
            {
              id: "page-break",
              type: "button",
              icon: "Minus",
              label: "Break",
              command: "pageBreak",
            },
          ],
        },
        {
          id: "table",
          label: "Table",
          controls: [
            {
              id: "insert-table",
              type: "button",
              icon: "Table2",
              label: "Table",
              command: "insertTable",
            },
          ],
        },
        {
          id: "media",
          label: "Media",
          controls: [
            { id: "insert-image", type: "button", icon: "Image", label: "Image", command: "image" },
          ],
        },
        {
          id: "links",
          label: "Links",
          controls: [
            {
              id: "insert-link",
              type: "button",
              icon: "Globe",
              label: "Link",
              command: "link",
              shortcut: "Ctrl+K",
            },
          ],
        },
        {
          id: "text",
          label: "Text",
          controls: [
            {
              id: "horizontal-rule",
              type: "button",
              icon: "Minus",
              label: "HR",
              command: "horizontalRule",
            },
          ],
        },
      ],
    },

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
              id: "page-orientation",
              type: "button",
              icon: "File",
              label: "Orientation",
              command: "pageOrientation",
            },
            { id: "page-size", type: "button", icon: "File", label: "Size", command: "pageSize" },
            {
              id: "page-margins",
              type: "button",
              icon: "File",
              label: "Margins",
              command: "pageMargins",
            },
            {
              id: "columns",
              type: "button",
              icon: "AlignJustify",
              label: "Columns",
              command: "columns",
            },
          ],
        },
        {
          id: "header-footer",
          label: "Header/Footer",
          controls: [
            {
              id: "edit-header",
              type: "button",
              icon: "AlignJustify",
              label: "Header",
              command: "editHeader",
            },
            {
              id: "edit-footer",
              type: "button",
              icon: "AlignJustify",
              label: "Footer",
              command: "editFooter",
            },
          ],
        },
      ],
    },

    {
      id: "references",
      label: "References",
      groups: [
        {
          id: "toc",
          label: "Table of Contents",
          controls: [
            {
              id: "insert-toc",
              type: "button",
              icon: "List",
              label: "TOC",
              command: "insertToc",
            },
            {
              id: "update-toc",
              type: "button",
              icon: "Replace",
              label: "Update",
              command: "updateToc",
            },
          ],
        },
        {
          id: "footnotes",
          label: "Footnotes",
          controls: [
            {
              id: "insert-footnote",
              type: "button",
              icon: "Plus",
              label: "Footnote",
              command: "insertFootnote",
            },
            {
              id: "insert-endnote",
              type: "button",
              icon: "Plus",
              label: "Endnote",
              command: "insertEndnote",
            },
          ],
        },
        {
          id: "comments",
          label: "Comments",
          controls: [
            {
              id: "add-comment",
              type: "button",
              icon: "TextQuote",
              label: "Comment",
              command: "addComment",
            },
            {
              id: "toggle-comment",
              type: "button",
              icon: "X",
              label: "Remove",
              command: "toggleComment",
            },
          ],
        },
      ],
    },

    {
      id: "review",
      label: "Review",
      groups: [
        {
          id: "tracking",
          label: "Tracking",
          controls: [
            {
              id: "track-changes",
              type: "button",
              icon: "Eye",
              label: "Track Changes",
              command: "toggleTrackChanges",
            },
          ],
        },
        {
          id: "changes",
          label: "Changes",
          controls: [
            {
              id: "accept-change",
              type: "button",
              icon: "Check",
              label: "Accept",
              command: "acceptChange",
            },
            {
              id: "reject-change",
              type: "button",
              icon: "X",
              label: "Reject",
              command: "rejectChange",
            },
            {
              id: "accept-all",
              type: "button",
              icon: "CheckCheck",
              label: "Accept All",
              command: "acceptAllChanges",
            },
            {
              id: "reject-all",
              type: "button",
              icon: "XCircle",
              label: "Reject All",
              command: "rejectAllChanges",
            },
            {
              id: "next-change",
              type: "button",
              icon: "ChevronRight",
              label: "Next",
              command: "nextChange",
            },
          ],
        },
      ],
    },
    {
      id: "view",
      label: "View",
      groups: [
        {
          id: "zoom",
          label: "Zoom",
          controls: [
            { id: "zoom-in", type: "button", icon: "ZoomIn", label: "Zoom In", command: "zoomIn" },
            {
              id: "zoom-out",
              type: "button",
              icon: "ZoomOut",
              label: "Zoom Out",
              command: "zoomOut",
            },
          ],
        },
        {
          id: "show",
          label: "Show",
          controls: [
            {
              id: "spellcheck",
              type: "checkbox",
              label: "Spell Check",
              checked: () => true,
              onChange: () => {},
            },
          ],
        },
      ],
    },

    cloudTab,
  ],
}
