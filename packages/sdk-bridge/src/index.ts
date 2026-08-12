// @world-office/sdk-bridge — TypeScript bridge for World Office SDK canvas API

export { SdkBridge, sdkBridge } from "./bridge"
export { SdkEventEmitter } from "./events"
export { useSdk, useSdkReady, useSdkCallback } from "./hooks"
export { SelectElementType } from "./enums"
export type {
  SdkSelectionObject,
  SdkObjectValue,
  SdkChartProperties,
  SdkParagraphStyle,
  SdkTableTemplate,
  SdkFontInfo,
  SdkCallbackEvent,
  SdkCallbackMap,
  SdkEditorApi,
  CommonEditorApiStatic,
  AscGlobalNamespace,
} from "./types"

// Collaboration client exports
export {
  WIRE_SCHEMA_VERSION,
  textPath,
  tablePath,
  slidePath,
  sheetPath,
  createRange,
  textRange,
  createInsertOpEnvelope,
  createDeleteOpEnvelope,
  createReplaceOpEnvelope,
  createFormatOpEnvelope,
  createMoveOpEnvelope,
  serializeModelOpEnvelope,
  deserializeModelOpEnvelope,
  extractModelOp,
  modelOpToEnvelope,
  isLegacyOperation,
  isModelOpEnvelope,
  legacyToModelOpEnvelope,
} from "./collaboration-client"
export type {
  Path,
  Range,
  FormatAttrs,
  ModelOp,
  ModelOpEnvelope,
  LegacyEditOperation,
} from "./collaboration-client"
