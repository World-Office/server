// Auto-save hook for embedded mode — debounces document changes
// and saves via WOPI PutFile

import { useEffect, useRef, useCallback } from "react";
import { putFile } from "@world-office/wopi-client";
import type { WopiConnection } from "@world-office/wopi-client";

export function useEmbeddedAutoSave(
  embedded: boolean,
  wopiConnection: WopiConnection | null,
  isModified: boolean,
  getDocumentBlob: () => Promise<Blob>,
  notifyDocumentSaved: (version: string) => void,
  notifyError: (code: string, message: string) => void,
  debounceMs: number = 3000,
): { forceSave: () => Promise<void> } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const doSave = useCallback(async () => {
    if (!embedded || !wopiConnection || savingRef.current) return;

    savingRef.current = true;
    try {
      const blob = await getDocumentBlob();
      await putFile(wopiConnection, blob);
      notifyDocumentSaved(Date.now().toString());
    } catch (err) {
      console.error("Auto-save failed:", err);
      notifyError(
        "AUTOSAVE_FAILED",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      savingRef.current = false;
    }
  }, [embedded, wopiConnection, getDocumentBlob, notifyDocumentSaved, notifyError]);

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
