export const COAUTHORING_WS_URL: string =
	(typeof window !== "undefined" &&
		((window as unknown as Record<string, unknown>)
			.__COAUTHORING_WS_URL as string)) ||
	import.meta.env?.VITE_COAUTHORING_WS_URL ||
	"ws://localhost:8004/ws/{session_id}";

export const COAUTHORING_API_URL: string =
	(typeof window !== "undefined" &&
		((window as unknown as Record<string, unknown>)
			.__COAUTHORING_API_URL as string)) ||
	import.meta.env?.VITE_COAUTHORING_API_URL ||
	"http://localhost:8004";

export const SESSION_SERVICE_URL: string =
	(typeof window !== "undefined" &&
		((window as unknown as Record<string, unknown>)
			.__SESSION_SERVICE_URL as string)) ||
	import.meta.env?.VITE_SESSION_SERVICE_URL ||
	"http://localhost:8001";

/**
 * Returns true when a real coauthoring service has been configured.
 * Prevents the editor from spamming ws://localhost:8004 connection
 * attempts on deployments without a coauthoring service.
 */
export function isCollaborationConfigured(): boolean {
	if (typeof window !== "undefined") {
		const w = window as unknown as Record<string, unknown>;
		if (w.__COAUTHORING_WS_URL || w.__COAUTHORING_API_URL) return true;
	}
	const ws = import.meta.env?.VITE_COAUTHORING_WS_URL;
	const api = import.meta.env?.VITE_COAUTHORING_API_URL;
	const isPlaceholder = (u: string | undefined) =>
		!u || u.includes("localhost:8004");
	return !(isPlaceholder(ws) && isPlaceholder(api));
}
