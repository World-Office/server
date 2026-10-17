// @vitest-environment jsdom
// Component-level proof of the File-menu wiring: the pane of a clicked entry
// paints, Back closes the menu, the formerly dead entries open a pane and the
// ExportWizard dialog really dismisses.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileMenu } from "../components/LeftMenu/FileMenu/FileMenu";
import { visioStore } from "../stores/VisioStore";
import { makeVisioMode } from "./fixtures";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

// React 19: act() needs this flag outside of react-testing-library
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
	true;

function click(el: Element): void {
	act(() => {
		el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}

function buttonText(el: Element): string {
	return (el.textContent ?? "").trim();
}

describe("visio File menu", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		visioStore.setActiveFileMenuPanel(null);
		visioStore.setFileMenuOpen(true);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		visioStore.setActiveFileMenuPanel(null);
		visioStore.setFileMenuOpen(false);
	});

	function renderMenu(): void {
		act(() => {
			root.render(<FileMenu />);
		});
	}

	/** The File-menu entry button carrying the given caption. */
	function entry(caption: string): HTMLElement {
		const item = Array.from(container.querySelectorAll("button")).find((el) =>
			buttonText(el).includes(caption),
		);
		if (!item) throw new Error(`file-menu entry not rendered: ${caption}`);
		return item;
	}

	/**
	 * A pane paints when its header sits in a wrapper that is really laid out:
	 * the wrapper itself AND every ancestor up to the menu root must be
	 * display !== "none" (a statically hidden container starves the pane even
	 * though its own inline style says "block").
	 */
	function panePainted(header: string): boolean {
		const headerEl = Array.from(
			container.querySelectorAll<HTMLElement>("div"),
		).find((el) => el.textContent === header);
		const pane = headerEl?.parentElement;
		if (!(pane instanceof HTMLElement)) return false;
		if (getComputedStyle(pane).display === "none") return false;

		let node: HTMLElement | null = pane.parentElement;
		while (node && node !== container) {
			if (getComputedStyle(node).display === "none") return false;
			node = node.parentElement;
		}
		return true;
	}

	it("paints the pane of the entry that was clicked", () => {
		renderMenu();
		expect(panePainted("Document Info")).toBe(false);
		click(entry("Document Info..."));
		expect(visioStore.activeFileMenuPanel).toBe("info");
		expect(panePainted("Document Info")).toBe(true);
	});

	it("hides the pane again when the same entry is clicked", () => {
		renderMenu();
		click(entry("Advanced Settings..."));
		expect(panePainted("Advanced Settings")).toBe(true);
		click(entry("Advanced Settings..."));
		expect(visioStore.activeFileMenuPanel).toBeNull();
		expect(panePainted("Advanced Settings")).toBe(false);
	});

	it("closes the File menu on Back", () => {
		renderMenu();
		click(entry("Help..."));
		expect(visioStore.isFileMenuOpen).toBe(true);
		click(entry("Back"));
		expect(visioStore.isFileMenuOpen).toBe(false);
		expect(visioStore.activeFileMenuPanel).toBeNull();
	});

	it("wires the formerly dead Rename entry to a pane", () => {
		renderMenu();
		click(entry("Rename..."));
		expect(visioStore.activeFileMenuPanel).toBe("rename");
		expect(panePainted("Rename")).toBe(true);
	});

	it("wires the formerly panel-less Save Copy entry to a pane", () => {
		renderMenu();
		click(entry("Save Copy as..."));
		expect(visioStore.activeFileMenuPanel).toBe("save-copy");
		expect(panePainted("Save Copy as")).toBe(true);
	});

	it("paints every pane the menu can open", () => {
		renderMenu();
		const panes: Array<[string, string]> = [
			["New", "Create New"],
			["Download as...", "Download as"],
			["Print", "Print Preview"],
			["Document Info...", "Document Info"],
			["Advanced Settings...", "Advanced Settings"],
			["Help...", "Help"],
			["Rename...", "Rename"],
			["Save Copy as...", "Save Copy as"],
		];
		for (const [caption, header] of panes) {
			click(entry(caption));
			expect(panePainted(header), `${caption} → ${header}`).toBe(true);
		}
	});

	it("dismisses the Export Wizard dialog", () => {
		renderMenu();
		click(entry("Export Wizard..."));
		expect(visioStore.activeFileMenuPanel).toBe("export");

		const close = Array.from(
			document.body.querySelectorAll<HTMLButtonElement>("button[aria-label]"),
		).find((el) => el.getAttribute("aria-label")?.includes("close"));
		if (!close) throw new Error("export wizard close button not rendered");
		click(close);

		expect(visioStore.activeFileMenuPanel).toBeNull();
		expect(
			Array.from(document.body.querySelectorAll("button[aria-label]")).some(
				(el) => el.getAttribute("aria-label")?.includes("close"),
			),
		).toBe(false);
	});

	it("leaves the editor for the host's document list on Go to Documents", () => {
		const assign = vi.fn();
		Object.defineProperty(window, "location", {
			value: { ...window.location, assign },
			configurable: true,
			writable: true,
		});
		visioStore.setMode(makeVisioMode("https://host.example/files"));

		renderMenu();
		click(entry("Go to Documents"));
		expect(assign).toHaveBeenCalledTimes(1);
		expect(visioStore.isFileMenuOpen).toBe(false);
		expect(visioStore.activeFileMenuPanel).toBeNull();
	});
});
