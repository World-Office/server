import { useEffect, useRef } from "react"

export type LoadState = "idle" | "loading" | "ready" | "error"

interface DocumentLoaderConfig {
  /** Callback to start the loading process (WOPI or fallback) */
  onLoad: () => Promise<void> | void
  /** Current loading state */
  isLoading: boolean
  /** Whether loading errored */
  isError: boolean
  /** Whether the document is ready */
  isReady: boolean
}

/**
 * Generic hook that manages the one-shot document load lifecycle.
 *
 * ```ts
 * const loadState = useDocumentLoader({
 *   onLoad: () => store.loadFromWopi(),
 *   isLoading: store.isLoading,
 *   isError: store.isLoadingError !== null,
 *   isReady: store.isDocReady,
 * })
 * ```
 */
export function useDocumentLoader(config: DocumentLoaderConfig): LoadState {
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    Promise.resolve(config.onLoad()).catch(() => {
      /* onLoad error is handled by the error state in the store */
    })
  }, [config.onLoad])

  if (config.isLoading) return "loading"
  if (config.isError) return "error"
  if (config.isReady) return "ready"
  return "idle"
}
