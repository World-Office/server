const CONVERSION_ENDPOINT = "/api/conversion/convert";

interface ConversionResponse {
	status: string;
	data?: string;
	format?: string;
	error?: string;
	duration_ms: number;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function base64ToBlob(b64: string, mimeType: string): Blob {
	const byteChars = atob(b64);
	const bytes = new Uint8Array(byteChars.length);
	for (let i = 0; i < byteChars.length; i++) {
		bytes[i] = byteChars.charCodeAt(i);
	}
	return new Blob([bytes], { type: mimeType });
}

export async function convertVsdxToHtml(data: ArrayBuffer): Promise<string> {
	const base64 = arrayBufferToBase64(data);
	const res = await fetch(CONVERSION_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			source_format: "vsdx",
			target_format: "html",
			data: base64,
		}),
	});
	if (!res.ok) {
		throw new Error(
			`Conversion request failed: ${res.status} ${res.statusText}`,
		);
	}
	const json: ConversionResponse = await res.json();
	if (!json.data) {
		throw new Error(
			`Conversion failed: ${json.status} — ${json.error ?? "unknown error"}`,
		);
	}
	const htmlBytes = base64ToBlob(json.data, "text/html; charset=utf-8");
	return htmlBytes.text();
}

/**
 * Convert a WoDiagram JSON to VSDX bytes via the backend conversion service.
 * Falls back to returning the JSON if the conversion service is unavailable.
 */
export async function convertWoDiagramToVsdx(
	json: string,
): Promise<ArrayBuffer> {
	const res = await fetch(CONVERSION_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			source_format: "wo-diagram",
			target_format: "vsdx",
			data: btoa(json),
		}),
	});
	if (!res.ok) {
		throw new Error(
			`Conversion request failed: ${res.status} ${res.statusText}`,
		);
	}
	const json2: ConversionResponse = await res.json();
	if (!json2.data) {
		throw new Error(
			`Conversion failed: ${json2.status} — ${json2.error ?? "unknown error"}`,
		);
	}
	return base64ToBlob(
		json2.data,
		"application/vnd.ms-visio.drawing.main+xml",
	).arrayBuffer();
}

/**
 * Convert VSDX bytes to WoDiagram JSON via the backend conversion service.
 */
export async function convertVsdxToWoDiagram(
	data: ArrayBuffer,
): Promise<string> {
	const base64 = arrayBufferToBase64(data);
	const res = await fetch(CONVERSION_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			source_format: "vsdx",
			target_format: "wo-diagram",
			data: base64,
		}),
	});
	if (!res.ok) {
		throw new Error(
			`Conversion request failed: ${res.status} ${res.statusText}`,
		);
	}
	const json: ConversionResponse = await res.json();
	if (!json.data) {
		throw new Error(
			`Conversion failed: ${json.status} — ${json.error ?? "unknown error"}`,
		);
	}
	return base64ToBlob(json.data, "application/json").text();
}
