export const CONVERSION_API_URL: string =
	(typeof window !== "undefined" &&
		((window as unknown as Record<string, unknown>)
			.__CONVERSION_API_URL as string)) ||
	import.meta.env?.VITE_CONVERSION_API_URL ||
	"http://localhost:8003";

function base64Encode(str: string): string {
	const bytes = new TextEncoder().encode(str);
	const bin = Array.from(bytes, (b) => String.fromCodePoint(b)).join("");
	return btoa(bin);
}

function base64Decode(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.style.display = "none";
	document.body.append(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

export async function exportToPPTX(): Promise<void> {
	const { presentationStore } = await import("../stores/PresentationStore");
	const json = presentationStore.toJSON();

	try {
		const b64 = base64Encode(json);
		const res = await fetch(`${CONVERSION_API_URL}/convert`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				input_format: "wo-presentation",
				output_format: "pptx",
				data: b64,
			}),
		});

		if (!res.ok) {
			const errBody = await res.json().catch(() => null);
			throw new Error(errBody?.error || `Server responded with ${res.status}`);
		}

		const result = await res.json();
		const outputB64: string | undefined = result?.job?.output_data;
		if (!outputB64) throw new Error("No output data in conversion response");

		const bytes = base64Decode(outputB64);
		const blob = new Blob([bytes as unknown as BlobPart], {
			type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		});
		downloadBlob(blob, "presentation.pptx");
	} catch (err) {
		console.error("PPTX export failed:", err);
		const fallback = confirm(
			"PPTX conversion is not available. Download as JSON instead?",
		);
		if (fallback) {
			const fallbackBlob = new Blob([json], { type: "application/json" });
			downloadBlob(fallbackBlob, "presentation.json");
		}
	}
}
