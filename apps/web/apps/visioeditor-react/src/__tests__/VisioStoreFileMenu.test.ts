// @vitest-environment jsdom
// File-menu store surface (rename / save copy / go to documents) — the
// download path clicks an anchor, so it needs a DOM.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeVisioMode } from "./fixtures";
import { VisioStore } from "../stores/VisioStore";

// Mock wopi-client to avoid network calls during tests
vi.mock("@world-office/wopi-client", () => ({
	detectWopiParams: vi.fn(() => null),
	loadDocument: vi.fn(),
	putFile: vi.fn(),
}));

// Mock conversion module — buildDocumentBlob falls back to the JSON blob
vi.mock("../lib/conversion", () => ({
	convertVsdxToWoDiagram: vi.fn(),
	convertWoDiagramToVsdx: vi.fn(() => Promise.reject(new Error("offline"))),
}));

vi.mock("../stores/FlowchartStore", () => ({
	flowchartStore: {
		toJSON: vi.fn(() => ({ nodes: [], edges: [] })),
		fromJSON: vi.fn(),
		clear: vi.fn(),
		history: [],
		future: [],
	},
}));

function mockDownloads(): string[] {
	const downloads: string[] = [];
	URL.createObjectURL = () => "blob:mock";
	URL.revokeObjectURL = () => {};
	HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
		downloads.push(this.download);
	};
	return downloads;
}

describe("VisioStore file-menu actions", () => {
	let store: VisioStore;

	beforeEach(() => {
		store = new VisioStore();
	});

	it("retitles the document on rename", () => {
		store.setDocument({ title: "old.vsdx", fileType: "vsdx" });
		store.renameDocument("renamed.vsdx");
		expect(store.document?.title).toBe("renamed.vsdx");
		expect(store.isModified).toBe(true);
	});

	it("seeds an untitled document when renaming a standalone session", () => {
		// the bare /diagram/ page loads no WOPI file — the rename must not be a no-op
		store.renameDocument("  session.vsdx  ");
		expect(store.document?.title).toBe("session.vsdx");
		expect(store.document?.fileType).toBe("vsdx");
	});

	it("ignores an empty rename", () => {
		store.setDocument({ title: "keep.vsdx", fileType: "vsdx" });
		store.renameDocument("   ");
		expect(store.document?.title).toBe("keep.vsdx");
	});

	it("downloads a copy under the given name, keeping the diagram extension", async () => {
		const downloads = mockDownloads();
		await store.saveCopyAs("my copy");
		expect(downloads).toEqual(["my copy.wo-flowchart"]);
		await store.saveCopyAs("named.vsdx");
		expect(downloads).toEqual(["my copy.wo-flowchart", "named.vsdx"]);
	});

	it("ignores an empty save-copy name", async () => {
		const downloads = mockDownloads();
		await store.saveCopyAs("   ");
		expect(downloads).toEqual([]);
	});

	it("closes the File menu when no go-back url is configured", () => {
		store.setActiveTab("file");
		store.setActiveFileMenuPanel("info");
		store.goToDocuments();
		expect(store.isFileMenuOpen).toBe(false);
		expect(store.activeFileMenuPanel).toBeNull();
	});

	it("asks the embedding host to close the editor when there is no go-back url", () => {
		const postMessage = vi.fn();
		Object.defineProperty(window, "parent", {
			value: { postMessage },
			configurable: true,
			writable: true,
		});

		store.setActiveTab("file");
		store.setActiveFileMenuPanel("info");
		store.goToDocuments();

		expect(postMessage).toHaveBeenCalledWith(
			{ source: "worldoffice-editor", type: "request_close" },
			"*",
		);
		expect(store.isFileMenuOpen).toBe(false);
		expect(store.activeFileMenuPanel).toBeNull();
	});

	it("returns to the host's document list when a go-back url is configured", () => {
		const assign = vi.fn();
		Object.defineProperty(window, "location", {
			value: { ...window.location, assign },
			configurable: true,
			writable: true,
		});

		store.setMode(makeVisioMode("https://host.example/files"));
		store.setActiveTab("file");
		store.goToDocuments();

		expect(assign).toHaveBeenCalledWith("https://host.example/files");
		expect(store.isFileMenuOpen).toBe(false);
	});
});
