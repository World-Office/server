import {
	detectWopiParams,
	isEditable,
	loadDocument,
	putFile,
} from "@world-office/wopi-client";
import type { WopiConnection, WopiFileInfo } from "@world-office/wopi-client";
import { makeAutoObservable } from "mobx";
import {
	convertWoSpreadsheetToXlsx,
	univerSnapshotToWoSpreadsheet,
} from "../lib/conversion";
import { getUniverSnapshot, onUniverChange } from "../lib/univer-command";
import type {
	CellCommentReply,
	CellCommentThread,
	LeftMenuAction,
	PanelChatMessage,
	RightMenuPanel,
	SheetInfo,
	SpreadsheetDocument,
	SpreadsheetMode,
	SpreadsheetTab,
	StatisticsType,
	ZoomLevel,
} from "../types/spreadsheet";
import { ZOOM_LEVELS } from "../types/spreadsheet";

const STORAGE_PREFIX = "se-";

export class SpreadsheetStore {
	mode: SpreadsheetMode | null = null;
	document: SpreadsheetDocument | null = null;
	isDocReady = false;

	/* Toolbar */
	activeTab: SpreadsheetTab | null = null;
	isFileMenuOpen = false;
	isEditMode = false;

	/* ViewTab / Zoom */
	zoomLevel: ZoomLevel = 100;
	fitToPage = false;
	fitToWidth = false;

	/* UI toggles */
	toolbarVisible = true;
	statusbarVisible = true;
	leftMenuVisible = true;
	rightMenuVisible = false;
	isCompactToolbar = false;
	isCompactStatusbar = true;

	/* Left menu */
	activeLeftPanel: LeftMenuAction | null = null;
	leftMenuMinWidth = 40;
	leftMenuExpandedWidth = 300;
	/* Left menu: cell comments (Comments panel) */
	cellComments: CellCommentThread[] = [];
	/* Left menu: session chat (Chat panel) */
	chatMessages: PanelChatMessage[] = [];
	/** Display name used for local comments and chat messages. */
	chatAuthor = "You";

	/* Right menu */
	activeRightPanel: RightMenuPanel | null = null;
	rightMenuMinWidth = 40;
	rightMenuExpandedWidth = 300;

	/* Sheet navigation */
	activeSheetIndex = 0;
	sheets: SheetInfo[] = [];

	/* Cell reference */
	activeCell = { row: 0, col: 0 };
	selectionRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
	cellInfo: { value?: string; formula?: string; format?: string } = {};
	format: "native" | "svg" = "native";

	/* Statistics */
	statistics = { average: 0, count: 0, min: 0, max: 0, sum: 0 };
	showStatistics = false;
	activeStatistics = new Set<StatisticsType>();

	/* Filtered records */
	filteredCount = 0;

	/* Formula bar */
	formulaInput = "";

	/* File menu */
	activeFileMenuPanel: string | null = null;

	/* Language */
	languageCode = "en-US";

	/* WOPI */
	isModified = false;
	isSaving = false;
	isLoading = false;
	isLoadingError: string | null = null;
	wopiFileInfo: WopiFileInfo | null = null;
	wopiConnection: WopiConnection | null = null;
	lastLoadedContent: Blob | null = null;

	constructor() {
		makeAutoObservable(this);
		onUniverChange(() => {
			this.isModified = true;
		});
	}

	/* ── Actions ── */

	setMode(mode: SpreadsheetMode): void {
		this.mode = mode;
		this.isEditMode = mode.isEdit;
	}

	setDocument(doc: SpreadsheetDocument): void {
		this.document = doc;
	}

	setDocReady(ready: boolean): void {
		this.isDocReady = ready;
	}

	setActiveTab(tab: SpreadsheetTab | null): void {
		this.activeTab = tab;
		if (tab === "file") {
			this.isFileMenuOpen = true;
		}
	}

	setFileMenuOpen(open: boolean): void {
		this.isFileMenuOpen = open;
		if (!open) {
			this.activeTab = null;
		}
	}

	setEditMode(editMode: boolean): void {
		this.isEditMode = editMode;
	}

	setZoomLevel(level: number): void {
		const clamped = Math.max(
			ZOOM_LEVELS[0] as number,
			Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1] as number, level),
		) as ZoomLevel;
		this.zoomLevel = clamped;
		this.fitToPage = false;
		this.fitToWidth = false;
	}

	zoomIn(): void {
		this.setZoomLevel(this.zoomLevel + (this.zoomLevel < 100 ? 25 : 50));
	}

	zoomOut(): void {
		this.setZoomLevel(this.zoomLevel - (this.zoomLevel <= 100 ? 25 : 50));
	}

	setFitToPage(value: boolean): void {
		this.fitToPage = value;
		if (value) this.fitToWidth = false;
	}

	setFitToWidth(value: boolean): void {
		this.fitToWidth = value;
		if (value) this.fitToPage = false;
	}

	setToolbarVisible(visible: boolean): void {
		this.toolbarVisible = visible;
	}

	setStatusbarVisible(visible: boolean): void {
		this.statusbarVisible = visible;
		setStorageItem("hidden-status", visible ? "" : "true");
	}

	setLeftMenuVisible(visible: boolean): void {
		this.leftMenuVisible = visible;
		setStorageItem("hidden-leftmenu", visible ? "" : "true");
	}

	setRightMenuVisible(visible: boolean): void {
		this.rightMenuVisible = visible;
		setStorageItem("hidden-rightmenu", visible ? "" : "true");
	}

	setActiveLeftPanel(action: LeftMenuAction | null): void {
		this.activeLeftPanel = action;
		if (action) {
			this.isFileMenuOpen = false;
			this.activeTab = null;
		}
	}

	toggleLeftPanel(action: LeftMenuAction): void {
		this.setActiveLeftPanel(this.activeLeftPanel === action ? null : action);
	}

	setActiveRightPanel(panel: RightMenuPanel | null): void {
		this.activeRightPanel = panel;
	}

	toggleRightPanel(panel: RightMenuPanel): void {
		this.setActiveRightPanel(this.activeRightPanel === panel ? null : panel);
	}

	/* ── Left-menu panels: comments + chat ── */

	/** Anchor a new comment thread to a cell reference ("Sheet1!B7"). */
	addCellComment(cellRef: string, text: string): CellCommentThread | null {
		const clean = text.trim();
		if (!clean) return null;
		const thread: CellCommentThread = {
			id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			cellRef,
			author: this.chatAuthor,
			text: clean,
			createdAt: Date.now(),
			resolved: false,
			replies: [],
		};
		this.cellComments.push(thread);
		return thread;
	}

	addCellReply(threadId: string, text: string): CellCommentReply | null {
		const clean = text.trim();
		if (!clean) return null;
		const thread = this.cellComments.find((t) => t.id === threadId);
		if (!thread) return null;
		const reply: CellCommentReply = {
			id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			author: this.chatAuthor,
			text: clean,
			createdAt: Date.now(),
		};
		thread.replies.push(reply);
		return reply;
	}

	setCellCommentResolved(threadId: string, resolved: boolean): void {
		const thread = this.cellComments.find((t) => t.id === threadId);
		if (thread) thread.resolved = resolved;
	}

	deleteCellComment(threadId: string): void {
		this.cellComments = this.cellComments.filter((t) => t.id !== threadId);
	}

	setCellComments(threads: CellCommentThread[]): void {
		this.cellComments = threads;
	}

	addChatMessage(text: string): PanelChatMessage | null {
		const clean = text.trim();
		if (!clean) return null;
		const message: PanelChatMessage = {
			id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			author: this.chatAuthor,
			text: clean,
			createdAt: Date.now(),
			self: true,
		};
		this.chatMessages.push(message);
		return message;
	}

	setChatMessages(messages: PanelChatMessage[]): void {
		this.chatMessages = messages;
	}

	clearChatMessages(): void {
		this.chatMessages = [];
	}

	/* Sheet navigation */
	setActiveSheetIndex(index: number): void {
		this.activeSheetIndex = index;
		this.sheets = this.sheets.map((sheet, i) => ({
			...sheet,
			active: i === index,
		}));
	}

	addSheet(name: string): void {
		const newSheet: SheetInfo = {
			index: this.sheets.length,
			name,
			active: false,
		};
		this.sheets.push(newSheet);
	}

	renameSheet(index: number, name: string): void {
		this.sheets = this.sheets.map((sheet, i) =>
			i === index ? { ...sheet, name } : sheet,
		);
	}

	deleteSheet(index: number): void {
		this.sheets = this.sheets.filter((_, i) => i !== index);
		if (this.activeSheetIndex >= this.sheets.length) {
			this.setActiveSheetIndex(Math.max(0, this.sheets.length - 1));
		}
	}

	/* Cell reference */
	setActiveCell(row: number, col: number): void {
		this.activeCell = { row, col };
	}

	setSelectionRange(
		startRow: number,
		startCol: number,
		endRow: number,
		endCol: number,
	): void {
		this.selectionRange = { startRow, startCol, endRow, endCol };
	}

	setCellInfo(info: {
		value?: string;
		formula?: string;
		format?: string;
	}): void {
		this.cellInfo = info;
	}

	setFormat(format: "native" | "svg"): void {
		this.format = format;
	}

	setFormulaInput(value: string): void {
		this.formulaInput = value;
	}

	/* Statistics */
	toggleStatistics(type: StatisticsType): void {
		if (this.activeStatistics.has(type)) {
			this.activeStatistics.delete(type);
		} else {
			this.activeStatistics.add(type);
		}
	}

	setShowStatistics(show: boolean): void {
		this.showStatistics = show;
	}

	updateStatistics(stats: {
		average: number;
		count: number;
		min: number;
		max: number;
		sum: number;
	}): void {
		this.statistics = stats;
	}

	/* Filtered records */
	setFilteredCount(count: number): void {
		this.filteredCount = count;
	}

	/* File menu */
	setActiveFileMenuPanel(panel: string | null): void {
		this.activeFileMenuPanel = panel;
	}

	/**
	 * Rename the open document (File → Rename...). Local in this build: the
	 * WOPI host exposes no rename endpoint, so the new title drives the editor
	 * title, the Document Info pane and every export/download file name.
	 */
	renameDocument(name: string): void {
		const clean = name.trim();
		if (!clean || !this.document) return;
		this.document = { ...this.document, title: clean };
	}

	setLanguageCode(code: string): void {
		this.languageCode = code;
	}

	setCompactToolbar(compact: boolean): void {
		this.isCompactToolbar = compact;
		setStorageItem("compact-toolbar", compact ? "true" : "false");
	}

	setCompactStatusbar(compact: boolean): void {
		this.isCompactStatusbar = compact;
		setStorageItem("compact-statusbar", compact ? "true" : "");
	}

	/* ── WOPI ── */

	async detectAndLoadWopi(): Promise<void> {
		const params = detectWopiParams();
		if (params) {
			this.wopiConnection = params;
			await this.loadFromWopi(params);
		} else {
			this.isLoading = false;
			this.isDocReady = true;
		}
	}

	async loadFromWopi(conn: WopiConnection): Promise<void> {
		this.isLoading = true;
		this.isLoadingError = null;
		try {
			const { info, content } = await loadDocument(conn);
			this.wopiFileInfo = info;
			this.lastLoadedContent = content;
			// WOPI UserCanWrite drives edit mode (was never wired — tabs/controls
			// stayed hidden and docs appeared uneditable).
			this.setEditMode(isEditable(info));
			this.document = {
				title: info.BaseFileName || "Untitled",
				fileType: "xlsx",
			};
			this.isDocReady = true;
		} catch (err) {
			this.isLoadingError =
				err instanceof Error ? err.message : "Failed to load document";
		} finally {
			this.isLoading = false;
		}
	}

	async saveToWopi(): Promise<void> {
		if (!this.wopiConnection || !this.isModified) return;
		if (!this.wopiFileInfo?.UserCanWrite) {
			this.exportAsDownload();
			return;
		}
		if (this.isSaving) return; // guard against Ctrl+S racing the autosave debounce
		this.isSaving = true;
		try {
			const blob = await this.buildDocumentBlob();
			await putFile(this.wopiConnection, blob);
			this.isModified = false;
		} catch {
			this.exportAsDownload();
		} finally {
			this.isSaving = false;
		}
	}

	async buildDocumentBlob(): Promise<Blob> {
		const snapshot = getUniverSnapshot();
		if (snapshot) {
			try {
				// Convert Univer snapshot (IWorkbookData) to WoSpreadsheet JSON
				// before sending to the backend for XLSX conversion
				const woJson = univerSnapshotToWoSpreadsheet(snapshot);
				const xlsxBuffer = await convertWoSpreadsheetToXlsx(woJson);
				return new Blob([xlsxBuffer], {
					type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				});
			} catch (err) {
				console.error("Failed to convert Univer snapshot to XLSX:", err);
			}
		}
		if (this.lastLoadedContent) {
			return this.lastLoadedContent;
		}
		// No content loaded — return empty XLSX (minimal valid XLSX is a ZIP)
		// rather than placeholder text that would corrupt the file
		return new Blob([], {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});
	}

	async exportAsDownload(): Promise<void> {
		const blob = await this.buildDocumentBlob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = this.document?.title || "spreadsheet.xlsx";
		a.click();
		URL.revokeObjectURL(url);
	}
}

function setStorageItem(key: string, value: string): void {
	try {
		localStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
	} catch {
		// Ignore storage errors
	}
}

export const spreadsheetStore = new SpreadsheetStore();
