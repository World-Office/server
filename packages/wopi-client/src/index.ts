export type {
  WopiConnection,
  WopiFileInfo,
} from "./wopi-types"

export {
  detectWopiParams,
  type DetectedWopiParams,
} from "./detect-wopi-params"

export {
  checkFileInfo,
  getFile,
  putFile,
  loadDocument,
} from "./wopi-client"

export {
  useDocumentLoader,
  type LoadState,
} from "./use-document-loader"

export {
  useWoCommandListener,
  type WoCommandHandlers,
} from "./use-wo-command"
