import type { EditorAppConfig } from "@world-office/editor-common"

export interface VisioMode extends EditorAppConfig {
  isEdit: boolean
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
  canBrandingExt: boolean
  enableDownload: boolean
  isDesktopApp: boolean
  isOffline: boolean
  compactview: boolean
  customization: VisioCustomization
  recent?: Array<{ title: string; url: string }>
  templates?: Array<{ name: string; url: string; thumbnail: string }>
}

export interface VisioCustomization {
  feedback?: { url: string }
  goback: { text?: string; url?: string }
  close?: { text?: string }
  leftMenu?: boolean
  statusBar?: boolean
  toolbar?: boolean
  chat?: boolean
}

export interface VisioDocument {
  title: string
  fileType: string
  info?: {
    author?: string
    created?: string
    modified?: string
    sharingSettings?: Array<{ user: string; permissions: string }>
    sheetCount?: number
    width?: number
    height?: number
  }
}

export type ZoomLevel = 50 | 75 | 100 | 125 | 150 | 175 | 200 | 300 | 400 | 500

export const ZOOM_LEVELS: ZoomLevel[] = [50, 75, 100, 125, 150, 175, 200, 300, 400, 500]

export interface PageTab {
  sheetIndex: number
  label: string
  active: boolean
}

export type FileMenuAction =
  | "back"
  | "saveas"
  | "save-copy"
  | "save-desktop"
  | "printpreview"
  | "print"
  | "rename"
  | "recent"
  | "new"
  | "info"
  | "rights"
  | "help"
  | "opts"
  | "exit"
  | "close-editor"
  | "external-help"
  | "suggest"

export type EditorMode = "vsdx" | "flowchart"

export type LeftMenuAction = "thumbs" | "chat" | "support" | "about" | "shapes"

export type FlowchartShapeType =
  | "start-end"
  | "terminator"
  | "process"
  | "decision"
  | "condition"
  | "input-output"
  | "data"
  | "document"
  | "subprocess"
  | "connector"
  | "manual-input"
  | "display"
  | "predefined-process"
  | "stored-data"
  | "delay"
  | "preparation"
  | "loop-limit"

export interface FlowchartNode {
  id: string
  shapeType: FlowchartShapeType
  label: string
  x: number
  y: number
  width: number
  height: number
  fillColor: string
  strokeColor: string
  strokeWidth?: number
  fontSize: number
  fontWeight?: "normal" | "bold"
}

export type ArrowheadType = "none" | "arrow" | "triangle" | "hollow-triangle" | "diamond"

export interface FlowchartEdge {
  id: string
  sourceId: string
  targetId: string
  label: string
  strokeColor?: string
  strokeWidth?: number
  strokeStyle?: "solid" | "dashed" | "dotted"
  sourceAnchor?: "top" | "right" | "bottom" | "left"
  targetAnchor?: "top" | "right" | "bottom" | "left"
  arrowheadType?: ArrowheadType
}

export interface FlowchartDocument {
  nodes: FlowchartNode[]
  edges: FlowchartEdge[]
  viewBox?: { x: number; y: number; width: number; height: number }
}
