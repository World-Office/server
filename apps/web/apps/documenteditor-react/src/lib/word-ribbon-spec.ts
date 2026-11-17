/**
 * Modified word ribbon spec for the document editor.
 * This file extends and modifies the base wordRibbonSpec from editor-common.
 */

import type { RibbonControlSpec, RibbonSpec } from "@world-office/editor-common"
import { wordRibbonSpec as baseWordRibbonSpec } from "@world-office/editor-common"

/**
 * Deep clone a RibbonSpec or any object
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj
  if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as any
  const cloned = {} as T
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone((obj as any)[key])
    }
  }
  return cloned
}

/**
 * Find and modify a control in the ribbon spec
 * @param spec The ribbon spec to search
 * @param tabId The tab ID to find
 * @param groupId The group ID to find
 * @param controlId The control ID to find
 * @param modifier Function to modify the control
 */
function modifyControl(
  spec: RibbonSpec,
  tabId: string,
  groupId: string,
  controlId: string,
  modifier: (control: RibbonControlSpec) => RibbonControlSpec,
): RibbonSpec {
  const modifiedSpec = deepClone(spec)
  
  for (const tab of modifiedSpec.tabs) {
    if (tab.id !== tabId) continue
    
    for (const group of tab.groups) {
      if (group.id !== groupId) continue
      
      for (let i = 0; i < group.controls.length; i++) {
        const control = group.controls[i]
        if (control.id === controlId) {
          group.controls[i] = modifier(control)
          return modifiedSpec
        }
      }
    }
  }
  
  return modifiedSpec
}

/**
 * Add a control to a group in the ribbon spec
 * @param spec The ribbon spec to modify
 * @param tabId The tab ID to find
 * @param groupId The group ID to find
 * @param control The control to add
 * @param position Optional position to insert at (default: end)
 */
function addControlToGroup(
  spec: RibbonSpec,
  tabId: string,
  groupId: string,
  control: RibbonControlSpec,
  position?: number,
): RibbonSpec {
  const modifiedSpec = deepClone(spec)
  
  for (const tab of modifiedSpec.tabs) {
    if (tab.id !== tabId) continue
    
    for (const group of tab.groups) {
      if (group.id !== groupId) continue
      
      if (position !== undefined) {
        group.controls.splice(position, 0, control)
      } else {
        group.controls.push(control)
      }
      return modifiedSpec
    }
  }
  
  return modifiedSpec
}

/**
 * Add a new group to a tab in the ribbon spec
 * @param spec The ribbon spec to modify
 * @param tabId The tab ID to find
 * @param group The group to add
 */
function addGroupToTab(
  spec: RibbonSpec,
  tabId: string,
  group: { id: string; label: string; controls: RibbonControlSpec[] },
): RibbonSpec {
  const modifiedSpec = deepClone(spec)
  
  for (const tab of modifiedSpec.tabs) {
    if (tab.id !== tabId) continue
    
    tab.groups.push(group)
    return modifiedSpec
  }
  
  return modifiedSpec
}

// Start with the base spec
let modifiedSpec: RibbonSpec = deepClone(baseWordRibbonSpec)

// Fix #1: Home tab - Font size label
// Change the font-size select label from empty string to "Font size"
modifiedSpec = modifyControl(
  modifiedSpec,
  "home",
  "font",
  "font-size",
  (control) => ({
    ...control,
    label: "Font size",
  }),
)

// Fix #2: References tab - Add Link button (PF-GAP-5)
// Add a Link button to the References tab, in a new "Links" group
modifiedSpec = addGroupToTab(modifiedSpec, "references", {
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
})

// Fix #3: Collaboration tab - Add Co-editing Mode button
// Add a Co-editing Mode button to the Collaboration tab, in the "tracking" group
modifiedSpec = addControlToGroup(
  modifiedSpec,
  "collaboration",
  "tracking",
  {
    id: "co-editing-mode",
    type: "button",
    icon: "Users",
    label: "Co-editing Mode",
    command: "toggleCoEditingMode",
  },
  1, // Insert after Track Changes (position 1)
)

// Fix #4: View tab - Add Multiple Pages button
// Add a Multiple Pages button to the View tab's zoom group (PF-GAP-6)
modifiedSpec = addControlToGroup(
  modifiedSpec,
  "view",
  "zoom",
  {
    id: "multiple-pages",
    type: "button",
    icon: "Layout",
    label: "Multiple pages",
    command: "toggleMultiplePages",
  },
  0, // Insert at the beginning of the zoom group
)

// Fix #5: View tab - Add Multiple Pages checkbox to Show group
// Add a Multiple Pages checkbox to the View tab's Show group (PF-GAP-11)
// This achieves parity with ONLYOFFICE's View > Show group which includes
// Headings, Multiple Pages, and Dark Document checkboxes
modifiedSpec = addControlToGroup(
  modifiedSpec,
  "view",
  "show",
  {
    id: "multiple-pages-checkbox",
    type: "checkbox",
    label: "Multiple pages",
    checked: (ctx) => ctx.multiplePages ?? false,
    onChange: () => {},
    command: "toggleMultiplePages",
  },
  4, // Insert after Headings (position 4: after spellcheck, ruler, gridlines, navigation)
)

// Fix #6: Insert tab - Add Header & Footer group (PF-3)
// Add Header & Footer group to the Insert tab with Header, Footer, Page Number, Date & Time, Field, and Comment
modifiedSpec = addGroupToTab(modifiedSpec, "insert", {
  id: "header-footer",
  label: "Header & Footer",
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
    {
      id: "insert-page-number",
      type: "button",
      icon: "Hash",
      label: "Page Number",
      command: "insertPageNumber",
    },
    {
      id: "insert-date-time",
      type: "button",
      icon: "CalendarDays",
      label: "Date & Time",
      command: "insertDateTime",
    },
    {
      id: "insert-field",
      type: "button",
      icon: "Braces",
      label: "Field",
      command: "insertField",
    },
    {
      id: "add-comment",
      type: "button",
      icon: "TextQuote",
      label: "Comment",
      command: "addComment",
    },
  ],
})

export const wordRibbonSpec = modifiedSpec
