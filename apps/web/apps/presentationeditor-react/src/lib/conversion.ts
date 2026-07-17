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

export async function convertPptxToHtml(data: ArrayBuffer): Promise<string> {
	const base64 = arrayBufferToBase64(data);
	const res = await fetch(CONVERSION_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			source_format: "pptx",
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

export async function convertPptxToWoPresentation(
	data: ArrayBuffer,
): Promise<string> {
	const base64 = arrayBufferToBase64(data);
	const res = await fetch(CONVERSION_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			source_format: "pptx",
			target_format: "wo-presentation",
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
	const rawBytes = base64ToBlob(json.data, "application/json");
	return rawBytes.text();
}

export async function convertWoPresentationToPptx(
	json: string,
): Promise<ArrayBuffer> {
	const encoder = new TextEncoder();
	const bytes = encoder.encode(json);
	const base64 = arrayBufferToBase64(bytes.buffer as ArrayBuffer);
	const res = await fetch(CONVERSION_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			source_format: "wo-presentation",
			target_format: "pptx",
			data: base64,
		}),
	});
	if (!res.ok) {
		throw new Error(
			`Conversion request failed: ${res.status} ${res.statusText}`,
		);
	}
	const responseJson: ConversionResponse = await res.json();
	if (!responseJson.data) {
		throw new Error(
			`Conversion failed: ${responseJson.status} — ${responseJson.error ?? "unknown error"}`,
		);
	}
	return base64ToBlob(
		responseJson.data,
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	).arrayBuffer();
}
