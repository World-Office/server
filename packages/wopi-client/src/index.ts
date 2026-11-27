export type {
  WopiConnection,
  WopiFileInfo,
} from "./wopi-types"

export {
  detectWopiParams,
  type DetectedWopiParams,
} from "./detect-wopi-params"

export { isEditable } from "./wopi-types"

export {
  checkFileInfo,
  getFile,
  putFile,
  loadDocument,
} from "./wopi-client"
