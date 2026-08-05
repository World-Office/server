// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VisioStore } from "../stores/VisioStore";

// Mock wopi-client to avoid network calls during tests
vi.mock("@world-office/wopi-client", () => ({
	detectWopiParams: vi.fn(() => null),
	loadDocument: vi.fn(),
	putFile: vi.fn(),
}));

// Mock conversion module
vi.mock("../lib/conversion", () => ({
	convertVsdxToWoDiagram: vi.fn(),
	convertWoDiagramToVsdx: vi.fn(),
}));

// Mock FlowchartStore
vi.mock("../stores/FlowchartStore", () => ({
	flowchartStore: {
		toJSON: vi.fn(() => ({ nodes: [], edges: [] })),
		fromJSON: vi.fn(),
		clear: vi.fn(),
		history: [],
		future: [],
	},
}));

describe("VisioStore", () => {
	let store: VisioStore;

	beforeEach(() => {
		store = new VisioStore();
	});

	it("initializes with default state", () => {
		expect(store.mode).toBeNull();
		expect(store.document).toBeNull();
		expect(store.isDocReady).toBe(false);
		expect(store.isSaving).toBe(false);
		expect(store.isModified).toBe(false);
		expect(store.zoomLevel).toBe(100);
		expect(store.fitToPage).toBe(false);
		expect(store.fitToWidth).toBe(false);
		expect(store.toolbarVisible).toBe(true);
		expect(store.statusbarVisible).toBe(true);
		expect(store.leftMenuVisible).toBe(true);
		expect(store.editorMode).toBe("vsdx");
		expect(store.activeTab).toBeNull();
		expect(store.isFileMenuOpen).toBe(false);
		expect(store.activeLeftPanel).toBeNull();
		expect(store.pageTabs).toEqual([]);
		expect(store.currentPageIndex).toBe(0);
		expect(store.pageCount).toBe(0);
		expect(store.activeFileMenuPanel).toBeNull();
		expect(store.format).toBe("native");
	});

	it("toggles editor mode between vsdx and flowchart", () => {
		expect(store.editorMode).toBe("vsdx");
		store.toggleEditorMode();
		expect(store.editorMode).toBe("flowchart");
		store.toggleEditorMode();
		expect(store.editorMode).toBe("vsdx");
	});

	it("sets editor mode explicitly", () => {
		store.setEditorMode("flowchart");
		expect(store.editorMode).toBe("flowchart");
		store.setEditorMode("vsdx");
		expect(store.editorMode).toBe("vsdx");
	});

	it("handles zoom level changes", () => {
		store.setZoomLevel(150);
		expect(store.zoomLevel).toBe(150);
		store.setZoomLevel(50);
		expect(store.zoomLevel).toBe(50);
	});

	it("clamps zoom to valid range", () => {
		store.setZoomLevel(1000);
		expect(store.zoomLevel).toBeLessThanOrEqual(500);
		store.setZoomLevel(-100);
		expect(store.zoomLevel).toBeGreaterThanOrEqual(25);
	});

	it("zoomIn increases zoom level", () => {
		store.setZoomLevel(100);
		store.zoomIn();
		expect(store.zoomLevel).toBeGreaterThan(100);
	});

	it("zoomOut decreases zoom level", () => {
		store.setZoomLevel(100);
		store.zoomOut();
		expect(store.zoomLevel).toBeLessThan(100);
	});

	it("fitToPage disables fitToWidth", () => {
		store.setFitToWidth(true);
		store.setFitToPage(true);
		expect(store.fitToPage).toBe(true);
		expect(store.fitToWidth).toBe(false);
	});

	it("fitToWidth disables fitToPage", () => {
		store.setFitToPage(true);
		store.setFitToWidth(true);
		expect(store.fitToWidth).toBe(true);
		expect(store.fitToPage).toBe(false);
	});

	it("toggles toolbar visibility", () => {
		store.setToolbarVisible(false);
		expect(store.toolbarVisible).toBe(false);
		store.setToolbarVisible(true);
		expect(store.toolbarVisible).toBe(true);
	});

	it("toggles left menu visibility", () => {
		store.setLeftMenuVisible(false);
		expect(store.leftMenuVisible).toBe(false);
		store.setLeftMenuVisible(true);
		expect(store.leftMenuVisible).toBe(true);
	});

	it("sets active left panel and closes file menu", () => {
		store.setActiveLeftPanel("shapes");
		expect(store.activeLeftPanel).toBe("shapes");
		expect(store.isFileMenuOpen).toBe(false);
	});

	it("toggles left panel", () => {
		store.toggleLeftPanel("shapes");
		expect(store.activeLeftPanel).toBe("shapes");
		store.toggleLeftPanel("shapes");
		expect(store.activeLeftPanel).toBeNull();
	});

	it("sets file menu open state", () => {
		store.setFileMenuOpen(true);
		expect(store.isFileMenuOpen).toBe(true);
		store.setFileMenuOpen(false);
		expect(store.isFileMenuOpen).toBe(false);
		expect(store.activeTab).toBeNull();
	});

	it("sets active tab and opens file menu for file tab", () => {
		store.setActiveTab("file");
		expect(store.activeTab).toBe("file");
		expect(store.isFileMenuOpen).toBe(true);
	});

	it("sets page tabs", () => {
		const tabs = [
			{ sheetIndex: 0, label: "Page 1", active: true },
			{ sheetIndex: 1, label: "Page 2", active: false },
		];
		store.setPageTabs(tabs, 0);
		expect(store.pageTabs).toHaveLength(2);
		expect(store.currentPageIndex).toBe(0);
		expect(store.pageCount).toBe(2);
	});

	it("sets current page index and updates tab active states", () => {
		const tabs = [
			{ sheetIndex: 0, label: "Page 1", active: true },
			{ sheetIndex: 1, label: "Page 2", active: false },
		];
		store.setPageTabs(tabs, 0);
		store.setCurrentPageIndex(1);
		expect(store.currentPageIndex).toBe(1);
		expect(store.pageTabs[0].active).toBe(false);
		expect(store.pageTabs[1].active).toBe(true);
	});

	it("sets format", () => {
		store.setFormat("svg");
		expect(store.format).toBe("svg");
		store.setFormat("native");
		expect(store.format).toBe("native");
	});

	it("marks and clears modified state", () => {
		expect(store.isModified).toBe(false);
		store.markModified();
		expect(store.isModified).toBe(true);
		store.clearModified();
		expect(store.isModified).toBe(false);
	});

	it("sets document", () => {
		const doc = {
			title: "Test",
			fileType: "vsdx",
			info: {
				author: "test",
				modified: "1",
				sheetCount: 1,
				width: 1200,
				height: 800,
			},
		};
		store.setDocument(doc);
		expect(store.document?.title).toBe("Test");
		expect(store.document?.fileType).toBe("vsdx");
		expect(store.document?.info?.author).toBe("test");
	});

	it("sets doc ready state", () => {
		store.setDocReady(true);
		expect(store.isDocReady).toBe(true);
		store.setDocReady(false);
		expect(store.isDocReady).toBe(false);
	});

	it("sets active file menu panel", () => {
		store.setActiveFileMenuPanel("saveas");
		expect(store.activeFileMenuPanel).toBe("saveas");
		store.setActiveFileMenuPanel(null);
		expect(store.activeFileMenuPanel).toBeNull();
	});

	it("wopiConnection returns null when no fileId/accessToken", () => {
		expect(store.wopiConnection).toBeNull();
	});

	it("wopiConnection returns connection when fileId and accessToken set", () => {
		store.wopiFileId = "file123";
		store.wopiAccessToken = "token456";
		store.docserverBase = "http://localhost:9200";
		const conn = store.wopiConnection;
		expect(conn).not.toBeNull();
		expect(conn?.wopiFileId).toBe("file123");
		expect(conn?.wopiAccessToken).toBe("token456");
		expect(conn?.docserverBase).toBe("http://localhost:9200");
	});
});
