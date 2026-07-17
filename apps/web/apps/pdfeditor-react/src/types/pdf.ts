import type { EditorAppConfig } from "@world-office/editor-common"

export interface PdfMode extends EditorAppConfig {
  isEdit: boolean
  isPDFEdit: boolean
  isRestrictedEdit: boolean
  isDisconnected: boolean
  canCoAuthoring: boolean
  canChat: boolean
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
  customization: PdfCustomization
}

export interface PdfCustomization {
  feedback?: { url: string }
  goback: { text?: string; url?: string }
  close?: { text?: string }
  leftMenu?: boolean
  statusBar?: boolean
  toolbar?: boolean
  chat?: boolean
}

export interface PdfDocument {
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

export interface BookmarkNode {
  id: string
  label: string
  children?: BookmarkNode[]
}

export type ZoomLevel = 50 | 75 | 100 | 125 | 150 | 175 | 200 | 300 | 400 | 500

export const ZOOM_LEVELS: ZoomLevel[] = [50, 75, 100, 125, 150, 175, 200, 300, 400, 500]

export type PdfTab = "file" | "home" | "comment" | "insert" | "redact" | "forms" | "view"

export type FileMenuAction =
  | "back"
  | "saveas"
  | "save-copy"
  | "save-desktop"
  | "printpreview"
  | "print"
  | "rename"
  | "info"
  | "rights"
  | "help"
  | "opts"
  | "exit"
  | "close-editor"
  | "external-help"
  | "suggest"

export type LeftMenuAction = "search" | "comments" | "chat" | "navigation" | "thumbnails" | "about"

export type RightMenuPanel =
  | "paragraph"
  | "image"
  | "shape"
  | "table"
  | "chart"
  | "textart"
  | "form"
  | "annotations"

export type AnnotationTool =
  | "highlight"
  | "strikeout"
  | "underline"
  | "text-comment"
  | "stamp"
  | "shape-comment"

export type FormFieldType =
  | "text"
  | "combobox"
  | "dropdown"
  | "checkbox"
  | "radiobox"
  | "picture"
  | "email"
  | "phone"
  | "datetime"
  | "zipcode"
  | "credit"

export type Tool = "select" | "hand"
