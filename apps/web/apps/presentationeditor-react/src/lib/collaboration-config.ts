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
