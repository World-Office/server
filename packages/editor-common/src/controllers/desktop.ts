/**
 * Desktop controller — wraps interaction with desktop app environment.
 *
 * Manages native desktop features, title buttons, recent files,
 * and handles desktop-specific events and commands.
 */

import { notificationCenter } from "../core/event-bus"

/** Desktop configuration */
export interface DesktopConfig {
  version: string
  isDesktopApp?: boolean
  isEdit?: boolean
  isOffline?: boolean
  canCreateNew?: boolean
  customization?: {
    goback?: {
      url?: string
    }
  }
}

/** Native desktop API interface */
export interface NativeDesktop {
  features?: {
    singlewindow?: boolean
    title?: boolean
  }
  execCommand: (command: string, params?: string) => void
  getViewportSettings?: () => { widgetType?: string }
  theme?: {
    system?: string
  }
}

/** Recent file entry */
export interface RecentFile {
  fileid?: string | number
  type?: number
  format?: string
  title: string
  url: string
  folder: string
}

/** File format constants */
const FILE_DOCUMENT = 0x0040
const FILE_PRESENTATION = 0x0080
const FILE_SPREADSHEET = 0x0100
const FILE_CROSSPLATFORM = 0x0200

/** Controller state */
const config: DesktopConfig = { version: "" }
let nativeDesktop: NativeDesktop | null = null
const helpUrl: string | null = null
const recents: RecentFile[] = []

/** Initialize the Desktop controller */
export function init(opts: Partial<DesktopConfig>): void {
  Object.assign(config, opts)

  const windowObj = window as unknown
  const desktopObj = windowObj as { desktop?: NativeDesktop; AscDesktopEditor?: NativeDesktop }
  const desktopValue = desktopObj.desktop || desktopObj.AscDesktopEditor

  if (config.isDesktopApp && desktopValue) {
    nativeDesktop = desktopValue

    // Set up native message handler if available
    if ((windowObj as { on_native_message?: unknown }).on_native_message) {
      setupNativeMessageHandler()
    }

    // Set up event listeners
    setupEventListeners()
  }
}

/** Sets up the native message handler for desktop commands */
function setupNativeMessageHandler(): void {
  const windowObj = window as unknown
  const handler = (windowObj as { on_native_message: (cmd: string, param: string) => void })
    .on_native_message

  // Process initial messages
  const cmdObj = (windowObj as { native_message_cmd?: Record<string, unknown> }).native_message_cmd
  if (cmdObj) {
    for (const cmd in cmdObj) {
      if (cmd === "uitheme:changed") continue
      handler(cmd, cmdObj[cmd] as string)
    }
  }
}

/** Sets up event listeners for desktop integration */
function setupEventListeners(): void {
  notificationCenter.on("uitheme:changed", (name: string, caller?: string) => {
    if (caller !== "native" && nativeDesktop) {
      const themeType = name === "theme-system" ? "system" : name
      nativeDesktop.execCommand(
        "uitheme:changed",
        JSON.stringify({ name: themeType, type: themeType }),
      )
    }
  })

  notificationCenter.on("modal:show", () => {
    if (nativeDesktop) {
      nativeDesktop.execCommand("title:button", JSON.stringify({ disabled: { all: true } }))
    }
  })

  notificationCenter.on("modal:close", () => {
    if (nativeDesktop) {
      nativeDesktop.execCommand("title:button", JSON.stringify({ disabled: {} }))
    }
  })

  notificationCenter.on("modal:hide", () => {
    if (nativeDesktop) {
      nativeDesktop.execCommand("title:button", JSON.stringify({ disabled: {} }))
    }
  })
}

/**
 * Processes a desktop command.
 * @param opts The command option
 * @returns Whether the command was processed
 */
export function process(opts: string): boolean {
  if (!config.isDesktopApp || !nativeDesktop) return false

  switch (opts) {
    case "goback": {
      const gobackUrl = config.customization?.goback?.url || "offline"
      nativeDesktop.execCommand("go:folder", gobackUrl)
      return true
    }

    case "preloader:hide":
      nativeDesktop.execCommand("editor:onready", "")
      return true

    case "create:new":
      if (config.canCreateNew) {
        nativeDesktop.execCommand("create:new", "word") // Default to word editor
        return true
      }
      break
  }

  return false
}

/**
 * Requests to close the desktop editor.
 */
export function requestClose(): void {
  if (config.isDesktopApp && nativeDesktop) {
    const url = config.customization?.goback?.url
    nativeDesktop.execCommand("editor:event", JSON.stringify({ action: "file:close", url }))
  }
}

/**
 * Removes recent files from desktop recents.
 */
export function removeRecent(): void {
  if (config.isDesktopApp && nativeDesktop) {
    nativeDesktop.execCommand("recent:forget")
  }
}

/**
 * Checks if running in desktop environment.
 * @returns True if desktop app is active
 */
export function isActive(): boolean {
  return nativeDesktop !== null
}

/**
 * Checks if running in offline mode.
 * @returns True if offline mode
 */
export function isOffline(): boolean {
  return config.isOffline || false
}

/**
 * Checks if a specific feature is available.
 * @param feature The feature name
 * @returns True if feature is available
 */
export function isFeatureAvailable(feature: string): boolean {
  if (!nativeDesktop) return false
  return feature in (nativeDesktop as unknown as Record<string, unknown>)
}

/**
 * Gets the system theme type.
 * @returns "dark", "light", or system default
 */
export function systemThemeType(): "dark" | "light" {
  const nativeDesktopWithTheme = nativeDesktop as unknown as { theme?: { system?: string } }
  if (nativeDesktop && nativeDesktopWithTheme?.theme?.system) {
    return nativeDesktopWithTheme.theme.system === "dark" ? "dark" : "light"
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/**
 * Gets the help URL for the current editor.
 * @returns The help URL or undefined
 */
export function getHelpUrl(): string | undefined {
  return helpUrl || undefined
}

/**
 * Gets recent files list.
 * @returns Array of recent files
 */
export function getRecentFiles(): RecentFile[] {
  return recents
}

/**
 * Opens a recent file.
 * @param model The recent file model
 * @returns Whether the file was opened successfully
 */
export function openRecent(model: { get: (key: string) => unknown }): boolean {
  if (!isActive()) return false

  const title = model.get("title") as string
  const url = model.get("url") as string
  const fileid = model.get("fileid")

  const params = {
    name: title,
    path: url,
    id: fileid ?? -1,
  }

  nativeDesktop?.execCommand("open:recent", JSON.stringify(params))
  return true
}

/** Additional file format constants */
const FILE_CROSSPLATFORM_DJVU = FILE_CROSSPLATFORM + 0x0003
const FILE_CROSSPLATFORM_XPS = FILE_CROSSPLATFORM + 0x0004

/** File format constants */
export const FileFormat = {
  FILE_UNKNOWN: 0x0000,
  FILE_DOCUMENT: FILE_DOCUMENT,
  FILE_DOCUMENT_DOCX: FILE_DOCUMENT + 0x0001,
  FILE_DOCUMENT_DOC: FILE_DOCUMENT + 0x0002,
  FILE_DOCUMENT_ODT: FILE_DOCUMENT + 0x0003,
  FILE_DOCUMENT_RTF: FILE_DOCUMENT + 0x0004,
  FILE_DOCUMENT_TXT: FILE_DOCUMENT + 0x0005,
  FILE_DOCUMENT_HTML: FILE_DOCUMENT + 0x0006,
  FILE_DOCUMENT_MHT: FILE_DOCUMENT + 0x0007,
  FILE_DOCUMENT_EPUB: FILE_DOCUMENT + 0x0008,
  FILE_DOCUMENT_FB2: FILE_DOCUMENT + 0x0009,
  FILE_DOCUMENT_DOCM: FILE_DOCUMENT + 0x000b,
  FILE_DOCUMENT_DOTX: FILE_DOCUMENT + 0x000c,
  FILE_DOCUMENT_DOTM: FILE_DOCUMENT + 0x000d,
  FILE_DOCUMENT_OTT: FILE_DOCUMENT + 0x000f,
  FILE_DOCUMENT_OFORM: FILE_DOCUMENT + 0x0015,
  FILE_DOCUMENT_DOCXF: FILE_DOCUMENT + 0x0016,
  FILE_PRESENTATION: FILE_PRESENTATION,
  FILE_PRESENTATION_PPTX: FILE_PRESENTATION + 0x0001,
  FILE_PRESENTATION_PPT: FILE_PRESENTATION + 0x0002,
  FILE_PRESENTATION_ODP: FILE_PRESENTATION + 0x0003,
  FILE_PRESENTATION_PPSX: FILE_PRESENTATION + 0x0004,
  FILE_PRESENTATION_PPTM: FILE_PRESENTATION + 0x0005,
  FILE_PRESENTATION_PPSM: FILE_PRESENTATION + 0x0006,
  FILE_PRESENTATION_POTX: FILE_PRESENTATION + 0x0007,
  FILE_PRESENTATION_POTM: FILE_PRESENTATION + 0x0008,
  FILE_PRESENTATION_OTP: FILE_PRESENTATION + 0x000a,
  FILE_CROSSPLATFORM: FILE_CROSSPLATFORM,
  FILE_CROSSPLATFORM_PDF: FILE_CROSSPLATFORM + 0x0001,
  FILE_CROSSPLATFORM_PDFA: FILE_CROSSPLATFORM + 0x0009,
  FILE_CROSSPLATFORM_DJVU,
  FILE_CROSSPLATFORM_XPS,
  FILE_SPREADSHEET: FILE_SPREADSHEET,
  FILE_SPREADSHEET_XLSX: FILE_SPREADSHEET + 0x0001,
  FILE_SPREADSHEET_XLS: FILE_SPREADSHEET + 0x0002,
  FILE_SPREADSHEET_ODS: FILE_SPREADSHEET + 0x0003,
  FILE_SPREADSHEET_CSV: FILE_SPREADSHEET + 0x0004,
  FILE_SPREADSHEET_XLSM: FILE_SPREADSHEET + 0x0005,
  FILE_SPREADSHEET_XLTX: FILE_SPREADSHEET + 0x0006,
  FILE_SPREADSHEET_XLTM: FILE_SPREADSHEET + 0x0007,
  FILE_SPREADSHEET_XLSB: FILE_SPREADSHEET + 0x0008,
  FILE_SPREADSHEET_OTS: FILE_SPREADSHEET + 0x000a,
  FILE_SPREADSHEET_NUMBERS: FILE_SPREADSHEET + 0x000d,
}

/**
 * Parses a file format code to extension.
 * @param format The file format code
 * @returns The file extension (e.g., "docx", "xlsx")
 */
export function parseFileFormat(format: number): string {
  switch (format) {
    case FileFormat.FILE_DOCUMENT_DOC:
      return "doc"
    case FileFormat.FILE_DOCUMENT_DOCX:
      return "docx"
    case FileFormat.FILE_DOCUMENT_ODT:
      return "odt"
    case FileFormat.FILE_DOCUMENT_RTF:
      return "rtf"
    case FileFormat.FILE_DOCUMENT_TXT:
      return "txt"
    case FileFormat.FILE_DOCUMENT_HTML:
      return "html"
    case FileFormat.FILE_DOCUMENT_MHT:
      return "mht"
    case FileFormat.FILE_DOCUMENT_EPUB:
      return "epub"
    case FileFormat.FILE_DOCUMENT_FB2:
      return "fb2"
    case FileFormat.FILE_DOCUMENT_DOCM:
      return "docm"
    case FileFormat.FILE_DOCUMENT_DOTX:
      return "dotx"
    case FileFormat.FILE_DOCUMENT_OTT:
      return "ott"
    case FileFormat.FILE_DOCUMENT_OFORM:
      return "oform"
    case FileFormat.FILE_DOCUMENT_DOCXF:
      return "docxf"
    case FileFormat.FILE_PRESENTATION_PPT:
      return "ppt"
    case FileFormat.FILE_PRESENTATION_POTX:
      return "potx"
    case FileFormat.FILE_PRESENTATION_PPTX:
      return "pptx"
    case FileFormat.FILE_PRESENTATION_ODP:
      return "odp"
    case FileFormat.FILE_PRESENTATION_PPSX:
      return "ppsx"
    case FileFormat.FILE_PRESENTATION_OTP:
      return "otp"
    case FileFormat.FILE_PRESENTATION_PPTM:
      return "pptm"
    case FileFormat.FILE_PRESENTATION_PPSM:
      return "ppsm"
    case FileFormat.FILE_PRESENTATION_POTM:
      return "potm"
    case FileFormat.FILE_CROSSPLATFORM_PDFA:
    case FileFormat.FILE_CROSSPLATFORM_PDF:
      return "pdf"
    case FileFormat.FILE_SPREADSHEET_XLS:
      return "xls"
    case FileFormat.FILE_SPREADSHEET_XLTX:
      return "xltx"
    case FileFormat.FILE_SPREADSHEET_XLSX:
      return "xlsx"
    case FileFormat.FILE_SPREADSHEET_XLSB:
      return "xlsb"
    case FileFormat.FILE_SPREADSHEET_ODS:
      return "ods"
    case FileFormat.FILE_SPREADSHEET_CSV:
      return "csv"
    case FileFormat.FILE_SPREADSHEET_OTS:
      return "ots"
    case FileFormat.FILE_SPREADSHEET_XLTM:
      return "xltm"
    case FileFormat.FILE_SPREADSHEET_XLSM:
      return "xlsm"
    case FileFormat.FILE_SPREADSHEET_NUMBERS:
      return "numbers"
  }

  return ""
}

/**
 * Checks if a file format matches the current editor type.
 * @param type The file type code
 * @returns True if format matches editor type
 */
export function matchFileFormat(type: number): boolean {
  const windowObj = window as unknown

  if ((windowObj as { PE?: boolean }).PE) {
    // Presentation editor
    return type > FileFormat.FILE_PRESENTATION && type <= FileFormat.FILE_SPREADSHEET
  }

  if ((windowObj as { DE?: boolean }).DE) {
    // Document editor
    return (
      (type > FileFormat.FILE_DOCUMENT && type <= FileFormat.FILE_PRESENTATION) ||
      type === FileFormat.FILE_CROSSPLATFORM_PDF ||
      type === FileFormat.FILE_CROSSPLATFORM_PDFA ||
      type === FileFormat.FILE_CROSSPLATFORM_DJVU
    )
  }

  if ((windowObj as { SSE?: boolean }).SSE) {
    // Spreadsheet editor
    return type > FileFormat.FILE_SPREADSHEET && type <= FileFormat.FILE_CROSSPLATFORM + 0x0004
  }

  if ((windowObj as { PDFE?: boolean }).PDFE) {
    // PDF editor
    return (
      type === FileFormat.FILE_CROSSPLATFORM_PDFA ||
      type === FileFormat.FILE_CROSSPLATFORM_PDF ||
      type === FileFormat.FILE_CROSSPLATFORM_DJVU ||
      type === FileFormat.FILE_CROSSPLATFORM_XPS
    )
  }

  return false
}
