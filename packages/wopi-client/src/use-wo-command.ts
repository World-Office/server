import { useEffect } from "react"

export interface WoCommandHandlers {
  /** Routes ribbon commands to the active editor (rich text / monaco). */
  onCommand: (command: string, value?: string) => void
  onSave?: () => void | Promise<void>
  onDownload?: () => void | Promise<void>
  onShare?: () => void | Promise<void>
}

/**
 * Listens for `wo-command` CustomEvents dispatched by ribbon specs and
 * toolbar buttons (e.g. Save, Download, Share, fontFamily, textColor).
 *
 * Without a listener these events were silently dropped — toolbar buttons
 * and ribbon dropdowns did nothing.
 */
export function useWoCommandListener(handlers: WoCommandHandlers): void {
  const { onCommand, onSave, onDownload, onShare } = handlers

  useEffect(() => {
    function handleCommand(e: Event): void {
      const detail = (e as CustomEvent<{ command?: string; value?: unknown }>).detail
      if (!detail?.command) return
      switch (detail.command) {
        case "save":
          onSave?.()
          break
        case "download":
          onDownload?.()
          break
        case "share":
          onShare?.()
          break
        default:
          onCommand(detail.command, typeof detail.value === "string" ? detail.value : undefined)
      }
    }
    window.addEventListener("wo-command", handleCommand)
    return () => window.removeEventListener("wo-command", handleCommand)
  }, [onCommand, onSave, onDownload, onShare])
}
