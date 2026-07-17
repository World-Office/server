import type { EditorAppConfig } from "@world-office/editor-common"

export interface DocumentMode extends EditorAppConfig {
  isEdit: boolean
  canCoAuthoring: boolean
  canChat: boolean
  canComments: boolean
  canDownload: boolean
  canPrint: boolean
  canPreviewPrint: boolean
  canRename: boolean
  canBack: boolean
  canHelp: boolean
  canSuggest: boolean
  canOpenRecent: boolean
  canCreateNew: boolean
  canCloseEditor: boolean
  enableDownload: boolean
  isDesktopApp: boolean
  isOffline: boolean
  compactview: boolean
  customization: DocumentCustomization
}

export interface DocumentCustomization {
  feedback?: { url: string }
  goback: { text?: string; url?: string }
  close?: { text?: string }
  leftMenu?: boolean
  statusBar?: boolean
  toolbar?: boolean
  chat?: boolean
  comments?: boolean
}

export interface DocumentDocument {
  title: string
  fileType: string
  info?: {
    author?: string
    created?: string
    modified?: string
    sharingSettings?: Array<{ user: string; permissions: string }>
    pageCount?: number
  }
}

export interface PageInfo {
  index: number
  label: string
}

export type ZoomLevel = 50 | 75 | 100 | 125 | 150 | 175 | 200 | 300 | 400 | 500

export const ZOOM_LEVELS: ZoomLevel[] = [50, 75, 100, 125, 150, 175, 200, 300, 400, 500]

export type DocumentTab =
  | "file"
  | "home"
  | "insert"
  | "layout"
  | "references"
  | "view"
  | "forms"
  | "headerfooter"

export type FileMenuAction =
  | "back"
  | "saveas"
  | "save-copy"
  | "save-desktop"
  | "print"
  | "printpreview"
  | "rename"
  | "info"
  | "rights"
  | "history"
  | "help"
  | "opts"
  | "exit"
  | "close-editor"
  | "external-help"
  | "suggest"
  | "create-new"
  | "open-recent"
  | "browse"
  | "share"
  | "protect"

export type LeftMenuAction =
  | "search"
  | "comments"
  | "contentlinks"
  | "chat"
  | "navigation"
  | "thumbnails"
  | "support"
  | "about"

export type RightMenuPanel =
  | "ai-assistant"
  | "comments"
  | "paragraph"
  | "table"
  | "image"
  | "shape"
  | "chart"
  | "textart"
  | "mailmerge"
  | "signature"
  | "form"
  | "plugins"

export type SaveAsFormat =
  | "DOCX"
  | "PDF"
  | "ODT"
  | "DOTX"
  | "DOCM"
  | "PDFA"
  | "OTT"
  | "MD"
  | "RTF"
  | "TXT"
  | "FB2"
  | "EPUB"
  | "HTML"
  | "JPG"
  | "PNG"
