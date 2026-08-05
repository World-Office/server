/**
 * Typed event emitter — replacement for Backbone.Events / NotificationCenter.
 *
 * Usage:
 *   const bus = createEventBus<{ "document:open": string; "edit:undo": undefined }>()
 *   bus.on("document:open", (id) => console.info(id))
 *   bus.emit("document:open", "doc-123")
 */

// biome-ignore lint/suspicious/noExplicitAny: EventBus uses `any` by design for generic event handling
type Handler = (...args: any[]) => void

export class EventBus<
  // biome-ignore lint/suspicious/noExplicitAny: generic event map requires `any`
  TEvents extends Record<string, any> = Record<string, any[]>,
> {
  private listeners = new Map<keyof TEvents, Set<Handler>>()

  // biome-ignore lint/suspicious/noExplicitAny: handler args are event-specific
  on<K extends keyof TEvents>(event: K, handler: (...args: any[]) => void): this {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler)
    return this
  }

  off<K extends keyof TEvents>(event?: K, handler?: Handler): this {
    if (event === undefined) {
      this.listeners.clear()
      return this
    }
    if (handler === undefined) {
      this.listeners.delete(event)
      return this
    }
    this.listeners.get(event)?.delete(handler)
    return this
  }

  once<K extends keyof TEvents>(event: K, handler: Handler): this {
    const wrapper: Handler = (...args) => {
      this.off(event, wrapper)
      handler(...args)
    }
    return this.on(event, wrapper)
  }

  // biome-ignore lint/suspicious/noExplicitAny: emit args are event-specific
  emit<K extends keyof TEvents>(event: K, ...args: any[]): boolean {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return false
    for (const fn of set) {
      fn(...args)
    }
    return true
  }

  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.listeners.get(event)?.size ?? 0
  }
}

export function createEventBus<
  // biome-ignore lint/suspicious/noExplicitAny: generic event map requires `any`
  TEvents extends Record<string, any> = Record<string, any[]>,
>(): EventBus<TEvents> {
  return new EventBus<TEvents>()
}

/**
 * Common editor events used across all editor types.
 */
export interface EditorEvents {
  "document:open": string
  "document:save": string
  "document:close": undefined
  "selection:change": undefined
  "edit:undo": undefined
  "edit:redo": undefined
  "ui:theme-change": "light" | "dark" | "system"
  "collaboration:user-join": string
  "collaboration:user-leave": string
}

/** Controller-specific events for UI components */
export interface ControllerEvents {
  "app:scaling": { ratio: number }
  "document:ready": undefined
  "tabstyle:changed": "fill" | "line"
  "tabbackground:changed": "header" | "toolbar" | "tab"
  "uitheme:changed": [themeId: string, caller?: string]
  "uitheme:countchanged": undefined
  "contenttheme:dark": boolean
  "fonts:select": unknown
  "fonts:change": unknown
  "fonts:load": unknown
  sethistorydata: unknown
  "mentions:setusers": { type: string; users: unknown[] }
  "hints:show": { visible: boolean; level?: number }
  "hints:clear": undefined
  "quickaccess:changed": unknown
  "desktop:window": { compositetitle?: boolean }
  "update:recents": unknown[]
  "modal:show": { cid: string; hidden?: boolean }
  "modal:close": { cid: string; last?: boolean }
  "modal:hide": { cid: string; last?: boolean }
  "window:show": { cid: string }
}

/**
 * Combined events type for the full application.
 */
export interface AppEvents extends EditorEvents, ControllerEvents {}

/** Global notification center singleton — replacement for Common.NotificationCenter. */
export const notificationCenter = createEventBus<AppEvents>()
