// Auto-save hook for embedded mode — debounces document changes and saves
// through the store's guarded saveToWopi. It must NOT call putFile directly:
// a parallel in-flight PUT here raced the store's own save (second PUT got
// 412 from the data layer → 502 to the browser; before the isSaving guard
// the same race truncated files). Every save funnels through the store's
// isSaving guard, which serializes autosave, Ctrl+S and this hook.

import type { WopiConnection } from "@world-office/wopi-client";
import { useCallback, useEffect, useRef } from "react";

export function useEmbeddedAutoSave(
	embedded: boolean,
	wopiConnection: WopiConnection | null,
	isModified: boolean,
	save: () => Promise<void>,
	notifyDocumentSaved: (version: string) => void,
	notifyError: (code: string, message: string) => void,
	debounceMs = 3000,
): { forceSave: () => Promise<void> } {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const doSave = useCallback(async () => {
		if (!embedded || !wopiConnection) return;
		try {
			// saveToWopi early-returns when unmodified; its isSaving guard
			// serializes this against Ctrl+S and the store's own autosave timer.
			await save();
			notifyDocumentSaved(Date.now().toString());
		} catch (err) {
			console.error("Auto-save failed:", err);
			notifyError("AUTOSAVE_FAILED", err instanceof Error ? err.message : "Unknown error");
		}
	}, [embedded, wopiConnection, save, notifyDocumentSaved, notifyError]);

	// Debounce saves on modification
	useEffect(() => {
		if (!embedded || !isModified) return;

		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(doSave, debounceMs);

		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [embedded, isModified, doSave, debounceMs]);

	const forceSave = useCallback(async () => {
		if (timerRef.current) clearTimeout(timerRef.current);
		await doSave();
	}, [doSave]);

	return { forceSave };
}
