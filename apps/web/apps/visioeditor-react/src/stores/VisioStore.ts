import {
	detectWopiParams as detectWopi,
	loadDocument,
	putFile,
} from "@world-office/wopi-client";
import type { WopiConnection } from "@world-office/wopi-client";
import { makeAutoObservable } from "mobx";
import {
	convertVsdxToWoDiagram,
	convertWoDiagramToVsdx,
} from "../lib/conversion";
import type {
	EditorMode,
	LeftMenuAction,
	PageTab,
	VisioDocument,
	VisioMode,
	ZoomLevel,
} from "../types/visio";
import { ZOOM_LEVELS } from "../types/visio";
import { flowchartStore } from "./FlowchartStore";

const STORAGE_PREFIX = "ve-";

export class VisioStore {
	mode: VisioMode | null = null;
	document: VisioDocument | null = null;
	isDocReady = false;
	isLoading = false;
	isLoadingError: string | null = null;
	isSaving = false;
	isModified = false;

	/* WOPI document connection */
	wopiFileId: string | null = null;
	wopiAccessToken: string | null = null;
	docserverBase = "";

	get wopiConnection(): WopiConnection | null {
		if (!this.wopiFileId || !this.wopiAccessToken) return null;
		return {
			wopiFileId: this.wopiFileId,
			wopiAccessToken: this.wopiAccessToken,
			docserverBase: this.docserverBase,
		};
	}
	format: "native" | "svg" = "native";

	markModified(): void {
		this.isModified = true;
	}

	clearModified(): void {
		this.isModified = false;
	}

	detectWopiParams(): boolean {
		const conn = detectWopi();
		if (!conn) return false;
		this.wopiFileId = conn.wopiFileId;
		this.wopiAccessToken = conn.wopiAccessToken;
		this.docserverBase = conn.docserverBase;
		return true;
	}

	setFormat(format: "native" | "svg"): void {
		this.format = format;
	}

	async loadFromWopi(): Promise<void> {
		this.isLoading = true;
		this.isLoadingError = null;
		try {
			const conn = {
				// biome-ignore lint/style/noNonNullAssertion: guarded by isDocReady check before calling loadFromWopi
				wopiFileId: this.wopiFileId!,
				// biome-ignore lint/style/noNonNullAssertion: guarded by isDocReady check before calling loadFromWopi
				wopiAccessToken: this.wopiAccessToken!,
				docserverBase: this.docserverBase,
			};
			const { info, content } = await loadDocument(conn);

			this.document = {
				title: info.BaseFileName ?? "Untitled",
				fileType: info.BaseFileName?.split(".").pop() ?? "vsdx",
				info: {
					author: info.OwnerId,
					modified: info.Version,
					sheetCount: 1,
					width: 1200,
					height: 800,
				},
			};

			if (this.editorMode === "flowchart") {
				try {
					const text = await content.text();
					// Try parsing as WoDiagram JSON first (VSDX converted by backend)
					const json = JSON.parse(text) as {
						flowchart: Parameters<typeof flowchartStore.fromJSON>[0];
					};
					if (json.flowchart) {
						flowchartStore.fromJSON(json.flowchart);
					}
				} catch {
					// If JSON parse fails, try VSDX binary conversion
					try {
						const buf = await content.arrayBuffer();
						const json = await convertVsdxToWoDiagram(buf);
						const parsed = JSON.parse(json) as {
							flowchart: Parameters<typeof flowchartStore.fromJSON>[0];
						};
						if (parsed.flowchart) {
							flowchartStore.fromJSON(parsed.flowchart);
						}
					} catch {
						flowchartStore.clear();
						flowchartStore.history = [];
						flowchartStore.future = [];
					}
				}
			}

			this.isDocReady = true;
			this.isModified = false;
		} catch (err) {
			this.isLoadingError =
				err instanceof Error ? err.message : "Failed to load document";
		} finally {
			this.isLoading = false;
		}
	}

	async saveToWopi(): Promise<void> {
		if (!this.wopiFileId || !this.wopiAccessToken) {
			this.exportAsDownload();
			return;
		}
		this.isSaving = true;
		try {
			const conn = {
				wopiFileId: this.wopiFileId,
				wopiAccessToken: this.wopiAccessToken,
				docserverBase: this.docserverBase,
			};
			await putFile(conn, await this.buildDocumentBlob());
			this.isModified = false;
		} finally {
			this.isSaving = false;
		}
	}

	async buildDocumentBlob(): Promise<Blob> {
		const payload = { flowchart: flowchartStore.toJSON() };
		const json = JSON.stringify(payload, null, 2);
		// Try VSDX conversion via backend; fall back to JSON if unavailable
		try {
			const vsdxBuffer = await convertWoDiagramToVsdx(json);
			return new Blob([vsdxBuffer], {
				type: "application/vnd.ms-visio.drawing.main+xml",
			});
		} catch (err) {
			console.warn("VSDX conversion failed, saving as JSON:", err);
			return new Blob([json], { type: "application/json" });
		}
	}

	async save(): Promise<void> {
		if (this.editorMode !== "flowchart") return;
		this.markModified();
		try {
			await this.saveToWopi();
		} catch (err) {
			console.error("Save failed:", err);
		}
	}

	async exportAsDownload(): Promise<void> {
		const blob = await this.buildDocumentBlob();
		const baseName = this.document?.title?.replace(/\.[^.]+$/, "");
		const fileName = `${baseName || "diagram"}.${this.diagramExtension(blob)}`;
		this.downloadBlob(blob, fileName);
	}

	/**
	 * File → Save Copy as... — downloads a copy of the current diagram under
	 * the given name. The web build has no server-side "copy" target, so the
	 * browser download IS the copy; the diagram extension is kept.
	 */
	async saveCopyAs(fileName: string): Promise<void> {
		const clean = fileName.trim();
		if (!clean) return;
		const blob = await this.buildDocumentBlob();
		const name = /\.[^.]+$/.test(clean)
			? clean
			: `${clean}.${this.diagramExtension(blob)}`;
		this.downloadBlob(blob, name);
	}

	/**
	 * File → Rename... — retitles the diagram (extension kept). The WOPI host
	 * exposes no rename endpoint, so the change is local to the editor session,
	 * but it drives Document Info and every export / download file name. A
	 * standalone session (no WOPI file loaded) has no document yet — the editor
	 * has been showing "Untitled" all along — so the rename seeds it instead of
	 * silently doing nothing.
	 */
	renameDocument(name: string): void {
		const clean = name.trim();
		if (!clean) return;
		const current = this.document ?? { title: "Untitled", fileType: "vsdx" };
		this.document = { ...current, title: clean };
		this.markModified();
	}

	/**
	 * File → "Go to Documents" — leaves the editor for the host's document list
	 * (customization.goback.url). Embedded sessions ask their host to close the
	 * editor instead (the documented `request_close` postMessage); a standalone
	 * session has no host page to return to, so the click closes the File menu
	 * instead of stranding the user on a dead navigation.
	 */
	goToDocuments(): void {
		const url = this.mode?.customization?.goback?.url;
		this.setActiveFileMenuPanel(null);
		this.setFileMenuOpen(false);
		if (url) {
			window.location.assign(url);
			return;
		}
		if (window.parent !== window) {
			window.parent.postMessage(
				{ source: "worldoffice-editor", type: "request_close" },
				"*",
			);
		}
	}

	/** Extension of the serialized diagram (VSDX when the backend conversion succeeded, native WoDiagram JSON otherwise). */
	private diagramExtension(blob: Blob): string {
		return blob.type.includes("visio") ? "vsdx" : "wo-flowchart";
	}

	/** Shared download path for the export / save-copy surfaces. */
	private downloadBlob(blob: Blob, fileName: string): void {
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	/* Editor mode */
	editorMode: EditorMode = "vsdx";

	setEditorMode(mode: EditorMode): void {
		this.editorMode = mode;
	}

	toggleEditorMode(): void {
		this.editorMode = this.editorMode === "vsdx" ? "flowchart" : "vsdx";
	}

	/* Toolbar */
	activeTab: "file" | "view" | null = null;
	isFileMenuOpen = false;

	/* ViewTab / Zoom */
	zoomLevel: ZoomLevel = 100;
	fitToPage = false;
	fitToWidth = false;

	/* UI toggles */
	toolbarVisible = true;
	statusbarVisible = true;
	leftMenuVisible = true;
	minimapVisible = true;
	wordWrap = true;
	themeMode: "light" | "dark" = "light";
	isCompactToolbar = false;
	isCompactStatusbar = true;

	/* Left menu */
	activeLeftPanel: LeftMenuAction | null = null;
	leftMenuMinWidth = 40;
	leftMenuExpandedWidth = 300;

	/* Page tabs */
	pageTabs: PageTab[] = [];
	currentPageIndex = 0;
	pageCount = 0;

	/* File menu */
	activeFileMenuPanel: string | null = null;

	/* Right menu */
	activeRightPanel: string | null = null;

	/* Search (commented out in original — skip) */

	constructor() {
		makeAutoObservable(this);
	}

	/* ── Actions ── */

	setMode(mode: VisioMode): void {
		this.mode = mode;
	}

	setDocument(doc: VisioDocument): void {
		this.document = doc;
	}

	setDocReady(ready: boolean): void {
		this.isDocReady = ready;
	}

	setActiveTab(tab: "file" | "view" | null): void {
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

	setMinimapVisible(visible: boolean): void {
		this.minimapVisible = visible;
	}

	setWordWrap(wrap: boolean): void {
		this.wordWrap = wrap;
	}

	setThemeMode(mode: "light" | "dark"): void {
		this.themeMode = mode;
	}

	setStatusbarVisible(visible: boolean): void {
		this.statusbarVisible = visible;
		setStorageItem("hidden-status", visible ? "" : "true");
	}

	setLeftMenuVisible(visible: boolean): void {
		this.leftMenuVisible = visible;
		setStorageItem("hidden-leftmenu", visible ? "" : "true");
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

	setActiveRightPanel(panel: string | null): void {
		this.activeRightPanel = panel;
	}

	toggleRightPanel(panel: string): void {
		this.setActiveRightPanel(this.activeRightPanel === panel ? null : panel);
	}

	setPageTabs(tabs: PageTab[], currentIndex: number): void {
		this.pageTabs = tabs;
		this.currentPageIndex = currentIndex;
		this.pageCount = tabs.length;
	}

	setCurrentPageIndex(index: number): void {
		this.currentPageIndex = index;
		const tabs = this.pageTabs.map((tab, i) => ({
			sheetIndex: tab.sheetIndex,
			label: tab.label,
			active: i === index,
		}));
		this.pageTabs = tabs;
	}

	setActiveFileMenuPanel(panel: string | null): void {
		this.activeFileMenuPanel = panel;
	}

	setCompactToolbar(compact: boolean): void {
		this.isCompactToolbar = compact;
		setStorageItem("compact-toolbar", compact ? "true" : "false");
	}

	setCompactStatusbar(compact: boolean): void {
		this.isCompactStatusbar = compact;
		setStorageItem("compact-statusbar", compact ? "true" : "");
	}
}

function setStorageItem(key: string, value: string): void {
	try {
		localStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
	} catch {
		// localStorage may be unavailable in private browsing
	}
}

export const visioStore = new VisioStore();
