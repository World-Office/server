// Core SDK bridge — wraps the global Common.EditorApi singleton
// Provides type-safe access to the legacy SDK canvas API

import { SdkEventEmitter } from "./events"
import type {
  AscGlobalNamespace,
  CommonEditorApiStatic,
  SdkChartProperties,
  SdkEditorApi,
  SdkSelectionObject,
} from "./types"

/**
 * SDK Bridge provides type-safe access to the World Office canvas SDK.
 *
 * The bridge wraps the global `Common.EditorApi` singleton and the `Asc`
 * namespace that the legacy SDK exposes via RequireJS/script tags.
 *
 * Usage:
 * ```ts
 * import { sdkBridge } from "@world-office/sdk-bridge"
 *
 * // Register for selection changes
 * sdkBridge.on("asc_onFocusObject", (objects) => {
 *   console.info("Selection changed:", objects)
 * })
 *
 * // Query current selection
 * const selected = sdkBridge.getSelectedElements()
 * ```
 */
export class SdkBridge {
  private api: SdkEditorApi | null = null
  private ascNamespace: AscGlobalNamespace | null = null
  readonly events = new SdkEventEmitter()
  private _isReady = false

  /**
   * Initialize the bridge with the global SDK API objects.
   * Call this once when the SDK script has loaded.
   */
  initialize(api: SdkEditorApi, asc?: AscGlobalNamespace): void {
    if (this.api) {
      console.warn("[sdk-bridge] Already initialized — ignoring duplicate call")
      return
    }
    this.api = api
    this.ascNamespace = asc ?? null
    this._isReady = true
  }

  /**
   * Initialize from the global window scope.
   * Looks for Common.EditorApi and Asc globals.
   */
  initializeFromGlobals(): boolean {
    const win = window as unknown as {
      Common?: { EditorApi?: CommonEditorApiStatic }
      Asc?: AscGlobalNamespace
    }

    if (!win.Common?.EditorApi) {
      console.error("[sdk-bridge] Common.EditorApi not found on window")
      return false
    }

    this.api = win.Common.EditorApi.get()
    this.ascNamespace = win.Asc ?? null
    this._isReady = true
    return true
  }

  /** Whether the SDK bridge has been initialized */
  get isReady(): boolean {
    return this._isReady
  }

  /** Get the raw SDK API (throws if not initialized) */
  getApi(): SdkEditorApi {
    if (!this.api) throw new Error("[sdk-bridge] SDK not initialized. Call initialize() first.")
    return this.api
  }

  /** Get the Asc namespace constants (throws if not initialized) */
  getAsc(): AscGlobalNamespace {
    if (!this.ascNamespace) throw new Error("[sdk-bridge] Asc namespace not available.")
    return this.ascNamespace
  }

  // --- Event registration ---

  /**
   * Register a callback for an SDK event.
   * Returns an unsubscribe function.
   */
  on = this.events.on.bind(this.events)

  /**
   * Remove all handlers for a specific event.
   */
  off = this.events.off.bind(this.events)

  // --- Selection queries ---

  /** Get currently selected elements */
  getSelectedElements(): SdkSelectionObject[] {
    return this.getApi().getSelectedElements()
  }

  /** Check if copy/cut is available */
  canCopyCut(): boolean {
    return this.getApi().can_CopyCut()
  }

  /** Check if comments can be added */
  canAddComment(): boolean {
    return this.getApi().can_AddQuotedComment() !== false
  }

  // --- Configuration ---

  /** Set paragraph style dropdown dimensions */
  setParagraphStylesSizes(width: number, height: number): void {
    this.getApi().asc_setParagraphStylesSizes(width, height)
  }

  /** Get chart preview data for a chart type */
  getChartPreviews(chartType: number): unknown[] {
    return this.getApi().asc_getChartPreviews(chartType)
  }

  // --- Selection object helpers ---

  /** Check if a selection object has shape properties */
  isShape(obj: SdkSelectionObject): boolean {
    const val = obj.get_ObjectValue()
    return val !== null && val.get_ShapeProperties() !== null
  }

  /** Check if a selection object has chart properties */
  isChart(obj: SdkSelectionObject): boolean {
    const val = obj.get_ObjectValue()
    return val !== null && val.get_ChartProperties() !== null
  }

  /** Check if a selection object is a plain image (not shape, not chart) */
  isImage(obj: SdkSelectionObject): boolean {
    const val = obj.get_ObjectValue()
    if (!val) return false
    return val.get_ShapeProperties() === null && val.get_ChartProperties() === null
  }

  /** Check if a selection object is locked */
  isLocked(obj: SdkSelectionObject): boolean {
    const val = obj.get_ObjectValue()
    return val?.get_Locked() ?? false
  }

  /** Get chart properties from a selection object (if chart) */
  getChartProperties(obj: SdkSelectionObject): SdkChartProperties | null {
    const val = obj.get_ObjectValue()
    return val?.get_ChartProperties() ?? null
  }

  // --- Cleanup ---

  /** Remove all event handlers and disconnect */
  destroy(): void {
    this.events.clear()
    this.api = null
    this.ascNamespace = null
    this._isReady = false
  }
}

/** Singleton SDK bridge instance */
export const sdkBridge = new SdkBridge()
