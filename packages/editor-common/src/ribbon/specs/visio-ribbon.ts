import type { RibbonSpec } from "../types"
import { cloudTab } from "./cloud-spec"

/**
 * Visio editor ribbon spec.
 * Currently minimal — View tab only (Monaco-based code editor with flowchart overlay).
 * Future: Home/Design tabs when native Visio rendering is ready.
 */
export const visioRibbonSpec: RibbonSpec = {
  tabs: [
    {
      id: "view",
      label: "View",
      groups: [
        {
          id: "view-zoom",
          label: "Zoom",
          controls: [
            { id: "zoom-level", type: "select", label: "Zoom", options: [{ value: "50", label: "50%" }, { value: "75", label: "75%" }, { value: "100", label: "100%" }, { value: "125", label: "125%" }, { value: "150", label: "150%" }, { value: "200", label: "200%" }], value: () => "", onChange: () => {}, width: 70 },
            { id: "fit-page", type: "button", icon: "Maximize", label: "Fit to Page", command: "fitToPageVisio", toggleable: true },
            { id: "fit-width", type: "button", icon: "Columns2", label: "Fit to Width", command: "fitToWidthVisio", toggleable: true },
          ],
        },
        {
          id: "editor-mode",
          label: "Mode",
          controls: [
            { id: "toggle-editor-mode", type: "button", icon: "Workflow", label: "Toggle Mode", command: "toggleEditorMode" },
          ],
        },
        {
          id: "export",
          label: "Export",
          controls: [
            { id: "export-svg", type: "button", icon: "Download", label: "Export SVG", command: "exportSvg", visible: (ctx) => ctx.isEditMode },
          ],
        },
        {
          id: "grid",
          label: "Grid",
          controls: [
            { id: "snap-to-grid", type: "checkbox", label: "Snap to Grid", checked: () => false, onChange: () => {} },
          ],
        },
        {
          id: "view-theme",
          label: "Theme",
          controls: [
            { id: "interface-theme", type: "button", icon: "Palette", label: "Interface Theme", command: "toggleThemeVisio" },
          ],
        },
        {
          id: "view-code",
          label: "Code Editor",
          controls: [
            { id: "toggle-minimap", type: "button", icon: "Monitor", label: "Toggle Minimap", command: "toggleMinimap" },
            { id: "toggle-word-wrap", type: "button", icon: "WrapText", label: "Toggle Word Wrap", command: "toggleWordWrap" },
          ],
        },
        {
          id: "view-show",
          label: "Show",
          controls: [
            { id: "show-toolbar", type: "checkbox", label: "Always show toolbar", checked: () => true, onChange: () => {} },
            { id: "show-statusbar", type: "checkbox", label: "Status Bar", checked: () => true, onChange: () => {} },
            { id: "show-left-panel", type: "checkbox", label: "Left Panel", checked: () => true, onChange: () => {} },
          ],
        },
      ],
    },
    cloudTab,
  ],
}
