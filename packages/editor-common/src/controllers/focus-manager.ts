/**
 * FocusManager controller — manages keyboard navigation and focus traps for modals/windows.
 *
 * Registers focusable fields, creates focus traps for accessibility,
 * and manages tab indexes across multiple windows.
 */

import { type ControllerEvents, notificationCenter } from "../core/event-bus"

/** Focusable field registration data */
export interface FocusableField {
  cmp: {
    $el?: { find(selector: string): unknown }
    el?: unknown
    setTabIndex?: (index: number) => void
  }
  selector: string
  el?: unknown
}

/** Window tracking data */
export interface WindowData {
  parent: { cid: string; $window?: { prepend(el: unknown): void; append(el: unknown): void } }
  fields?: FocusableField[]
  hidden?: boolean
  index?: number
  traps?: unknown[]
}

const tabindexCounter = 1
const windows: Record<string, WindowData> = {}
let windowCount = 0

/** Registers focusable fields and assigns tab indexes */
function register(fields: FocusableField | FocusableField[]): FocusableField[] {
  const fieldsArray: FocusableField[] = []
  const inputFields = Array.isArray(fields) ? fields : [fields]

  for (const field of inputFields) {
    if (!field) continue

    const item: FocusableField =
      field.cmp && typeof field.selector === "string"
        ? { ...field }
        : {
            cmp: field.cmp,
            selector: ".form-control",
          }

    // Get element and set tabindex
    const $el = (item.cmp.$el || item.cmp.el) as { find?: (selector: string) => unknown }
    if ($el?.find) {
      item.el = ($el.find as (selector: string) => unknown)(item.selector)
    }

    if (item.cmp.setTabIndex) {
      item.cmp.setTabIndex(tabindexCounter)
    }

    fieldsArray.push(item)
  }

  return fieldsArray
}

/** Adds focus trap elements for a window */
function addTraps(current: WindowData): void {
  if (!current || current.traps || !current.fields || current.fields.length < 1) return

  // Create trap elements
  const trapFirst = document.createElement("span")
  trapFirst.setAttribute("aria-hidden", "true")
  trapFirst.setAttribute("tabindex", tabindexCounter.toString())
  trapFirst.addEventListener("focus", () => {
    if (current.hidden) return
    const fields = current.fields || []
    for (let i = fields.length - 1; i >= 0; i--) {
      const field = fields[i]
      const el = field.el as { focus?: () => void }
      if (el?.focus) {
        setTimeout(() => el.focus?.(), 10)
        break
      }
    }
  })

  const trapLast = document.createElement("span")
  trapLast.setAttribute("aria-hidden", "true")
  trapLast.setAttribute("tabindex", (tabindexCounter + 1).toString())
  trapLast.addEventListener("focus", () => {
    if (current.hidden) return
    const fields = current.fields || []
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]
      const el = field.el as { focus?: () => void }
      if (el?.focus) {
        setTimeout(() => el.focus?.(), 10)
        break
      }
    }
  })

  // Append to window
  if (current.parent.$window) {
    current.parent.$window.prepend(trapFirst)
    current.parent.$window.append(trapLast)
  }

  current.traps = [trapFirst, trapLast]
}

/** Updates tab indexes when windows open/close */
function updateTabIndexes(increment: boolean, winIndex: number): void {
  const step = increment ? 1 : -1
  for (const cid in windows) {
    if (!Object.prototype.hasOwnProperty.call(windows, cid)) continue

    const item = windows[cid]
    if (item?.index && item.index < winIndex && item.traps) {
      const trapLast = item.traps[1] as { attr?: (...args: unknown[]) => unknown }
      const attrValue = trapLast.attr?.("tabindex") || "0"
      const currentTabIndex = Number.parseInt(String(attrValue), 10)
      trapLast.attr?.("tabindex", (currentTabIndex + step).toString())
    }

    if (!increment && item && item.index) {
      // Decrement indexes when a window closes
      if (item.index > winIndex) {
        item.index--
      }
    }
  }
}

/** Inserts fields into a window at specific index */
function insert(
  e: { cid: string },
  fields: FocusableField | FocusableField[],
  index?: number,
): number {
  if (!e?.cid) return 0

  if (windows[e.cid]) {
    const currentFields = windows[e.cid].fields || []
    let insertIndex = index
    if (insertIndex !== undefined && insertIndex < 0) {
      insertIndex += currentFields.length
    }

    if (insertIndex === undefined) {
      windows[e.cid].fields = currentFields.concat(register(fields))
    } else {
      windows[e.cid].fields = currentFields
        .slice(0, insertIndex)
        .concat(register(fields))
        .concat(currentFields.slice(insertIndex))
    }

    addTraps(windows[e.cid])
    return insertIndex || 0
  }

  windows[e.cid] = {
    parent: e as WindowData["parent"],
    fields: register(fields),
    hidden: false,
    index: windowCount++,
  }

  addTraps(windows[e.cid])
  return 0
}

/** Adds fields to a window */
function add(e: { cid: string }, fields: FocusableField | FocusableField[]): number {
  return insert(e, fields)
}

/** Removes fields from a window */
function remove(e: { cid: string }, start?: number, len?: number): void {
  if (!e?.cid || !windows[e.cid] || !windows[e.cid].fields || start === undefined) return

  const removed = windows[e.cid].fields?.splice(start, len || 1)
  if (removed) {
    for (const item of removed) {
      if (item.cmp.setTabIndex) {
        item.cmp.setTabIndex(-1)
      }
    }
  }
}

/** Initializes the FocusManager by setting up event listeners */
export function init(): void {
  notificationCenter.on("modal:show", (e: ControllerEvents["modal:show"]) => {
    if (e?.cid) {
      if (windows[e.cid]) {
        windows[e.cid].hidden = e.hidden || false
      } else {
        windows[e.cid] = {
          parent: e as WindowData["parent"],
          hidden: e.hidden || false,
          index: windowCount++,
        }
        updateTabIndexes(true, windows[e.cid].index ?? 0)
      }
    }
  })

  notificationCenter.on("window:show", (e: ControllerEvents["window:show"]) => {
    if (e?.cid && windows[e.cid] && !windows[e.cid].fields) {
      // Fields would be registered here when component API exists
      addTraps(windows[e.cid])
    }
  })

  notificationCenter.on("modal:close", (e: ControllerEvents["modal:close"]) => {
    if (e?.cid && windows[e.cid]) {
      updateTabIndexes(false, windows[e.cid].index ?? 0)
      delete windows[e.cid]
      windowCount--
    }
  })

  notificationCenter.on("modal:hide", (e: ControllerEvents["modal:hide"]) => {
    if (e?.cid && windows[e.cid]) {
      windows[e.cid].hidden = true
    }
  })
}

/**
 * Registers focusable fields for a window.
 * @param e The window object with a cid
 * @param fields The fields to register (single field or array)
 * @returns The insertion index
 */
export { add as registerFocusable }

/**
 * Inserts focusable fields at a specific index.
 * @param e The window object with a cid
 * @param fields The fields to insert
 * @param index The index to insert at (negative for end of array)
 * @returns The insertion index
 */
export { insert as insertFocusable }

/**
 * Removes focusable fields from a window.
 * @param e The window object with a cid
 * @param start The starting index
 * @param len The number of fields to remove
 */
export { remove as removeFocusable }
