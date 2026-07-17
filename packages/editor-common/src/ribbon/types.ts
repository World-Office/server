/**
 * Declarative ribbon spec types — define the entire toolbar UI as data.
 *
 * Each editor (word, spreadsheet, presentation, PDF, Visio) provides its own
 * RibbonSpec. The Ribbon renderer reads the spec and produces the DOM that
 * matches the ONLYOFFICE ribbon layout 1:1.
 */

// ── Editor context (injected at render time) ──────────────────────────────

export interface RibbonContext {
  /** Whether the current document can be edited */
  isEditMode: boolean
  /** Document has unsaved changes */
  isModified: boolean
  /** Document is currently being saved */
  isSaving: boolean
  /** User has write permission */
  canEdit: boolean
  /** Name of the currently active tab */
  activeTab: string
  // Cloud / WOPI
  /** Whether this document was opened via WOPI */
  isWopi: boolean
  /** Collaboration connection state */
  connectionStatus: "disconnected" | "connecting" | "connected" | "reconnecting"
  /** Number of connected collaborators */
  userCount: number
  /** Current file name */
  fileName: string
}

// ── Command dispatch ────────────────────────────────────────────────────

export interface RibbonCommandDispatch {
  /** Rich-text commands (TipTap) */
  onRichTextCommand: (command: string, value?: string) => void
  /** Code-editor commands (Monaco) */
  onMonacoCommand: (command: string) => void
  /** Generic command for editor-agnostic actions */
  onCommand: (command: string, value?: string) => void
  /** Cloud/WOPI save */
  onSave?: () => Promise<void>
  /** Open share dialog */
  onShare?: () => void
}

// ── Control specs ───────────────────────────────────────────────────────

export type RibbonControlType =
  | "button"
  | "select"
  | "dropdown"
  | "split-button"
  | "checkbox"
  | "color-picker"
  | "separator"
  | "spacer"

export interface RibbonControlBase {
  id: string
  type: RibbonControlType
  /** Short label shown below the control (ONLYOFFICE convention) */
  label?: string
  /** Tooltip on hover */
  tooltip?: string
  /** Runtime visibility (default: visible) */
  visible?: (ctx: RibbonContext) => boolean
  /** Runtime enabled state (default: enabled) */
  enabled?: (ctx: RibbonContext) => boolean
}

export interface RibbonButtonSpec extends RibbonControlBase {
  type: "button"
  /** Lucide icon name (e.g. "Bold", "Undo2") */
  icon: string
  /** Command to execute on click */
  command: string
  /** Optional value passed alongside command (e.g. "ltr"/"rtl" for textDirection) */
  value?: string
  /** If true, button acts as a toggle */
  toggleable?: boolean
  /** Current toggle state (only used when toggleable) */
  toggled?: (ctx: RibbonContext) => boolean
  /** Keyboard shortcut hint (e.g. "Ctrl+B") */
  shortcut?: string
}

export interface RibbonSelectSpec extends RibbonControlBase {
  type: "select"
  options: { value: string; label: string; icon?: string }[]
  /** Current value */
  value: (ctx: RibbonContext) => string
  /** Called when user selects a new option */
  onChange: (value: string) => void
  /** CSS width for the select element */
  width?: number
}

export interface RibbonDropdownItem {
  id: string
  label: string
  icon?: string
  command?: string
  separator?: boolean
  disabled?: boolean
  children?: RibbonDropdownItem[]
}

export interface RibbonDropdownSpec extends RibbonControlBase {
  type: "dropdown"
  /** Icon shown on the dropdown button */
  icon?: string
  /** Label shown on the dropdown button (fallback if no icon) */
  label?: string
  items: RibbonDropdownItem[]
}

export interface RibbonSplitButtonSpec extends RibbonControlBase {
  type: "split-button"
  icon: string
  command: string
  items: RibbonDropdownItem[]
}

export interface RibbonCheckboxSpec extends RibbonControlBase {
  type: "checkbox"
  checked: (ctx: RibbonContext) => boolean
  onChange: (checked: boolean) => void
}

export interface RibbonColorPickerSpec extends RibbonControlBase {
  type: "color-picker"
  color: (ctx: RibbonContext) => string
  onChange: (color: string) => void
  /** Predefined color palette */
  colors?: string[]
}

export interface RibbonSeparatorSpec extends RibbonControlBase {
  type: "separator"
}

export interface RibbonSpacerSpec extends RibbonControlBase {
  type: "spacer"
}

export type RibbonControlSpec =
  | RibbonButtonSpec
  | RibbonSelectSpec
  | RibbonDropdownSpec
  | RibbonSplitButtonSpec
  | RibbonCheckboxSpec
  | RibbonColorPickerSpec
  | RibbonSeparatorSpec
  | RibbonSpacerSpec

// ── Group / Tab / Spec ──────────────────────────────────────────────────

export interface RibbonGroupSpec {
  id: string
  label: string
  controls: RibbonControlSpec[]
  visible?: (ctx: RibbonContext) => boolean
}

export interface RibbonTabSpec {
  id: string
  label: string
  groups: RibbonGroupSpec[]
  visible?: (ctx: RibbonContext) => boolean
}

export interface RibbonSpec {
  tabs: RibbonTabSpec[]
  /** Context-sensitive tabs shown only under certain conditions (e.g. table selected) */
  contextualTabs?: Record<string, RibbonTabSpec[]>
}
