import type { EditorAppConfig } from "@world-office/editor-common";

export interface SpreadsheetMode extends EditorAppConfig {
	isEdit: boolean;
	canCoAuthoring: boolean;
	canChat: boolean;
	canComments: boolean;
	canDownload: boolean;
	canPrint: boolean;
	canPreviewPrint: boolean;
	canRename: boolean;
	canBack: boolean;
	canHelp: boolean;
	canSuggest: boolean;
	canOpenRecent: boolean;
	canCreateNew: boolean;
	canCloseEditor: boolean;
	enableDownload: boolean;
	isDesktopApp: boolean;
	isOffline: boolean;
	compactview: boolean;
	customization: SpreadsheetCustomization;
}

export interface SpreadsheetCustomization {
	feedback?: { url: string };
	goback: { text?: string; url?: string };
	close?: { text?: string };
	leftMenu?: boolean;
	statusBar?: boolean;
	toolbar?: boolean;
	chat?: boolean;
	comments?: boolean;
}

export interface SpreadsheetDocument {
	title: string;
	fileType: string;
	info?: {
		author?: string;
		created?: string;
		modified?: string;
		sharingSettings?: Array<{ user: string; permissions: string }>;
		sheetCount?: number;
	};
}

export interface SheetInfo {
	index: number;
	name: string;
	color?: string;
	active: boolean;
}

export interface CellInfo {
	row: number;
	col: number;
	value?: string;
	formula?: string;
	format?: string;
}

export type ZoomLevel = 50 | 75 | 100 | 125 | 150 | 175 | 200 | 300 | 400 | 500;

export const ZOOM_LEVELS: ZoomLevel[] = [
	50, 75, 100, 125, 150, 175, 200, 300, 400, 500,
];

export type SpreadsheetTab =
	| "file"
	| "home"
	| "insert"
	| "layout"
	| "formula"
	| "data"
	| "tabledesign";

export type FileMenuAction =
	| "back"
	| "saveas"
	| "save-copy"
	| "save-desktop"
	| "export-pdf"
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
	| "protect"
	| "export";

export type LeftMenuAction =
	| "search"
	| "comments"
	| "chat"
	| "spellcheck"
	| "support"
	| "about";

export type RightMenuPanel =
	| "cellsettings"
	| "shapesettings"
	| "imagesettings"
	| "chartsettings"
	| "textartsettings"
	| "pivottablesettings"
	| "slicersettings"
	| "signaturesettings"
	| "plugins";

export type SaveAsFormat =
	| "XLSX"
	| "ODS"
	| "CSV"
	| "PDF"
	| "XLTX"
	| "OTS"
	| "XLSB"
	| "XLSM"
	| "PDFA"
	| "JPG"
	| "PNG";

export type StatisticsType = "average" | "count" | "min" | "max" | "sum";
