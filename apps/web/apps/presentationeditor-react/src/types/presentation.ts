import type { EditorAppConfig } from "@world-office/editor-common";

export interface PresentationMode extends EditorAppConfig {
	isEdit: boolean;
	canCoAuthoring: boolean;
	canChat: boolean;
	canComments: boolean;
	canViewComments: boolean;
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
	customization: PresentationCustomization;
}

export interface PresentationCustomization {
	feedback?: { url: string };
	goback: { text?: string; url?: string };
	close?: { text?: string };
	leftMenu?: boolean;
	statusBar?: boolean;
	toolbar?: boolean;
	chat?: boolean;
	comments?: boolean;
}

export interface PresentationDocument {
	title: string;
	fileType: string;
	info?: {
		author?: string;
		created?: string;
		modified?: string;
		sharingSettings?: Array<{ user: string; permissions: string }>;
		pageCount?: number;
	};
}

export interface SlideInfo {
	index: number;
	label: string;
	layout?: SlideLayout;
}

export type SlideLayout =
	| "blank"
	| "title"
	| "content"
	| "comparison"
	| "sectionHeader"
	| "twoContent"
	| "captionOnly"
	| "verticalText"
	| "verticalTitleAndText"
	| "verticalTitleAndTextOverContent";

export type ZoomLevel = 50 | 75 | 100 | 125 | 150 | 175 | 200 | 300 | 400 | 500;

export const ZOOM_LEVELS: ZoomLevel[] = [
	50, 75, 100, 125, 150, 175, 200, 300, 400, 500,
];

export type PresentationTab =
	| "file"
	| "home"
	| "insert"
	| "design"
	| "transitions"
	| "animation";

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
	| "open-recent";

export type LeftMenuAction =
	| "search"
	| "slides"
	| "comments"
	| "chat"
	| "support"
	| "about";

export type RightMenuPanel =
	| "paragraph"
	| "table"
	| "image"
	| "slide"
	| "chart"
	| "shape"
	| "textart"
	| "animation"
	| "animation";

export type TransitionEffect =
	| "none"
	| "fade"
	| "push"
	| "wipe"
	| "split"
	| "reveal"
	| "checker"
	| "zoom"
	| "morp"
	| "circle"
	| "uncover"
	| "cover"
	| "flash"
	| "random"
	| "shred"
	| "wedge"
	| "wheel"
	| "flythrough"
	| "excite"
	| "dissolve"
	| "newsflash"
	| "bars"
	| "contract"
	| "rotate"
	| "blast"
	| "center"
	| "shape"
	| "zoomIn"
	| "zoomOut"
	| "coverIn"
	| "coverUp"
	| "coverLeft"
	| "coverRight"
	| "pullIn"
	| "pullUp"
	| "pullLeft"
	| "pullRight";

export type AnimationEffect =
	| "none"
	| "appear"
	| "fade"
	| "flyIn"
	| "floatIn"
	| "split"
	| "wipe"
	| "shape"
	| "wheel"
	| "bars"
	| "zoom"
	| "rotate"
	| "floatOut"
	| "growAndTurn"
	| "swivel"
	| "bounce"
	| "path"
	| "pathReverse"
	| "zoom"
	| "compress"
	| "colorTyping"
	| "emphasis"
	| "emphasisDark"
	| "emphasisFlash"
	| "lineColor"
	| "fontColor"
	| "growWithColor"
	| "shrinkAndTurn"
	| "shrink"
	| "swing"
	| "teeter"
	| "spin"
	| "growAndShrink";

export type StartAnimation =
	| "onClick"
	| "withPrevious"
	| "afterPrevious"
	| "onStart";

export type SaveAsFormat =
	| "PPTX"
	| "PPSX"
	| "PDF"
	| "ODP"
	| "POTX"
	| "PPTM"
	| "PDFA"
	| "OTP"
	| "JPG"
	| "PNG";

export type SlideSize = "screen4x3" | "widescreen" | "standard" | "custom";

export type ThemeType = "builtin" | "custom";

export interface Theme {
	name: string;
	colorScheme: ColorScheme;
	fontScheme: FontScheme;
	formatScheme?: string;
}

export interface ThemePreset extends Theme {
	description: string;
}

export interface ColorScheme {
	name: string;
	colors: ThemeColor[];
}

export interface ThemeColor {
	name: string;
	color: string;
}

export interface FontScheme {
	name: string;
	majorFont: ThemeFont;
	minorFont: ThemeFont;
}

export interface ThemeFont {
	latin?: string;
	eastAsian?: string;
	complexScript?: string;
}

export type AdvanceMode = "click" | "after";

export type AnimationCategory =
	| "none"
	| "entrance"
	| "emphasis"
	| "exit"
	| "motion";

export interface AnimationData {
	id: string;
	effect: AnimationEffect;
	category: AnimationCategory;
	target: string;
	start: StartAnimation;
	duration: number;
	delay: number;
}

export type ShapeType =
	| "rect"
	| "roundedRect"
	| "ellipse"
	| "triangle"
	| "diamond"
	| "line"
	| "arrow"
	| "connector"
	| "textbox"
	| "image";

export type ConnectorType = "straight" | "bent" | "curved";

export interface GradientStop {
	position: number;
	color: string;
}

export type GradientKind = "linear" | "radial";

export interface GradientFill {
	kind: GradientKind;
	stops: GradientStop[];
	angle: number;
}

export interface ShadowEffect {
	dx: number;
	dy: number;
	blurRadius: number;
	color: string;
	opacity: number;
}

export interface ConnectorData {
	connectorType: ConnectorType;
	hasStartArrow: boolean;
	hasEndArrow: boolean;
	startX: number;
	startY: number;
	endX: number;
	endY: number;
}

export interface ImageData {
	src: string;
	alt?: string;
}

export interface GroupData {
	shapeIds: string[];
}

export interface ShapeData {
	id: string;
	type: ShapeType;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	zIndex: number;
	fillColor?: string;
	strokeColor?: string;
	strokeWidth?: number;
	text?: string;
	fontSize?: number;
	fontColor?: string;
	chart?: ChartData;
	table?: TableData;
	connector?: ConnectorData;
	gradientFill?: GradientFill;
	shadow?: ShadowEffect;
	imageData?: ImageData;
	groupId?: string;
}

export type ChartType = "bar" | "column" | "line" | "pie" | "doughnut";

export interface ChartSeries {
	name: string;
	values: number[];
	color?: string;
}

export interface ChartData {
	type: ChartType;
	title?: string;
	labels: string[];
	series: ChartSeries[];
}

export interface TableData {
	rows: number;
	columns: number;
	headerRow: boolean;
	cells: TableRow[];
	columnWidths?: number[];
}

export interface TableRow {
	cells: TableCell[];
}

export interface TableCell {
	text: string;
	colSpan?: number;
	rowSpan?: number;
}

export type TextDirection = "ltr" | "rtl";
