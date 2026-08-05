import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock btoa/atob for Node environment
vi.stubGlobal("btoa", (str: string) =>
	Buffer.from(str, "binary").toString("base64"),
);
vi.stubGlobal("atob", (str: string) =>
	Buffer.from(str, "base64").toString("binary"),
);

describe("conversion", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it("convertVsdxToHtml sends correct request and returns HTML", async () => {
		const { convertVsdxToHtml } = await import("../lib/conversion");

		const htmlBase64 = btoa("<html><body>Test</body></html>");
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				status: "ok",
				data: htmlBase64,
				format: "html",
				duration_ms: 42,
			}),
		});

		const arrayBuffer = new ArrayBuffer(10);
		const result = await convertVsdxToHtml(arrayBuffer);

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const call = mockFetch.mock.calls[0];
		expect(call[0]).toBe("/api/conversion/convert");
		expect(call[1].method).toBe("POST");
		expect(call[1].headers["Content-Type"]).toBe("application/json");

		const body = JSON.parse(call[1].body);
		expect(body.source_format).toBe("vsdx");
		expect(body.target_format).toBe("html");
		expect(body.data).toBeTruthy();

		expect(result).toContain("<html>");
	});

	it("convertVsdxToHtml throws on HTTP error", async () => {
		const { convertVsdxToHtml } = await import("../lib/conversion");

		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
		});

		await expect(convertVsdxToHtml(new ArrayBuffer(0))).rejects.toThrow(
			"Conversion request failed: 500",
		);
	});

	it("convertVsdxToHtml throws when response has no data", async () => {
		const { convertVsdxToHtml } = await import("../lib/conversion");

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				status: "error",
				error: "parse failed",
				duration_ms: 10,
			}),
		});

		await expect(convertVsdxToHtml(new ArrayBuffer(0))).rejects.toThrow(
			"Conversion failed",
		);
	});

	it("convertWoDiagramToVsdx sends correct request and returns ArrayBuffer", async () => {
		const { convertWoDiagramToVsdx } = await import("../lib/conversion");

		const vsdxBase64 = btoa("fake-vsdx-content");
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				status: "ok",
				data: vsdxBase64,
				format: "vsdx",
				duration_ms: 55,
			}),
		});

		const json = JSON.stringify({ flowchart: { nodes: [], edges: [] } });
		const result = await convertWoDiagramToVsdx(json);

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const call = mockFetch.mock.calls[0];
		expect(call[0]).toBe("/api/conversion/convert");
		const body = JSON.parse(call[1].body);
		expect(body.source_format).toBe("wo-diagram");
		expect(body.target_format).toBe("vsdx");

		expect(result).toBeInstanceOf(ArrayBuffer);
	});

	it("convertVsdxToWoDiagram sends correct request and returns JSON string", async () => {
		const { convertVsdxToWoDiagram } = await import("../lib/conversion");

		const jsonBase64 = btoa('{"flowchart":{"nodes":[],"edges":[]}}');
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				status: "ok",
				data: jsonBase64,
				format: "wo-diagram",
				duration_ms: 30,
			}),
		});

		const result = await convertVsdxToWoDiagram(new ArrayBuffer(10));

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const call = mockFetch.mock.calls[0];
		const body = JSON.parse(call[1].body);
		expect(body.source_format).toBe("vsdx");
		expect(body.target_format).toBe("wo-diagram");

		expect(result).toContain("flowchart");
	});

	it("convertWoDiagramToVsdx throws on HTTP error", async () => {
		const { convertWoDiagramToVsdx } = await import("../lib/conversion");

		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 503,
			statusText: "Service Unavailable",
		});

		await expect(convertWoDiagramToVsdx("{}")).rejects.toThrow(
			"Conversion request failed: 503",
		);
	});

	it("convertVsdxToWoDiagram throws on HTTP error", async () => {
		const { convertVsdxToWoDiagram } = await import("../lib/conversion");

		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 404,
			statusText: "Not Found",
		});

		await expect(convertVsdxToWoDiagram(new ArrayBuffer(0))).rejects.toThrow(
			"Conversion request failed: 404",
		);
	});
});
