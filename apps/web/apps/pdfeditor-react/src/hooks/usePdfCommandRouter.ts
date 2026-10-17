/**
 * Hook to register the PDF command router.
 * Part of PDF-6: Frontend: 8 right-menu panels → apply_op
 *
 * WIRED-SLIDE-PDF-TOOLBAR: the handler itself lives in lib/pdf-commands.ts —
 * one place covers the ribbon-spec commands AND the right-menu detail
 * commands, and it is what `__tests__/toolbar-command-coverage.test.ts`
 * exercises.
 */

import { registerEditorRouter } from "@world-office/editor-common"
import { useEffect } from "react"
import { createPdfCommandHandler, PDF_COMMANDS } from "../lib/pdf-commands"

/**
 * Register the PDF command router.
 * Should be called once when the PDF editor mounts.
 */
export function usePdfCommandRouter(): void {
  useEffect(() => {
    const unregister = registerEditorRouter(
      "pdf",
      createPdfCommandHandler(),
      [...PDF_COMMANDS],
    )
    return unregister
  }, [])
}
