// React hook for SDK bridge integration

import { useCallback, useEffect, useRef, useState } from "react"
import { sdkBridge } from "./bridge"
import type { SdkCallbackEvent, SdkCallbackMap } from "./types"

/**
 * Returns whether the SDK bridge is ready.
 * Re-renders when the bridge initializes.
 */
export function useSdkReady(): boolean {
  const [ready, setReady] = useState(sdkBridge.isReady)

  useEffect(() => {
    if (sdkBridge.isReady) {
      setReady(true)
      return
    }

    // Poll for readiness (SDK loads async)
    const interval = setInterval(() => {
      if (sdkBridge.isReady) {
        setReady(true)
        clearInterval(interval)
      }
    }, 100)

    return () => clearInterval(interval)
  }, [])

  return ready
}

/**
 * Subscribe to an SDK callback event with automatic cleanup.
 *
 * @param event - SDK event name
 * @param handler - Callback handler (auto-unsubscribed on unmount)
 *
 * @example
 * ```tsx
 * function SelectionInfo() {
 *   useSdkCallback("asc_onFocusObject", (objects) => {
 *     console.info("Selection:", objects)
 *   })
 *   return <div>...</div>
 * }
 * ```
 */
export function useSdkCallback<E extends SdkCallbackEvent>(
  event: E,
  handler: SdkCallbackMap[E],
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const unsubscribe = sdkBridge.on(event, ((...args: unknown[]) => {
      ;(handlerRef.current as (...a: unknown[]) => void)(...args)
    }) as SdkCallbackMap[E])

    return unsubscribe
  }, [event])
}

/**
 * Hook that provides the SDK bridge instance, initializing from globals if needed.
 *
 * @example
 * ```tsx
 * function EditorPanel() {
 *   const api = useSdk()
 *   if (!api) return <div>Loading SDK...</div>
 *   return <div>SDK ready</div>
 * }
 * ```
 */
export function useSdk() {
  const initialized = useRef(false)
  const [ready, setReady] = useState(sdkBridge.isReady)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    if (!sdkBridge.isReady) {
      sdkBridge.initializeFromGlobals()
    }

    if (sdkBridge.isReady) {
      setReady(true)
    } else {
      const interval = setInterval(() => {
        if (sdkBridge.isReady) {
          setReady(true)
          clearInterval(interval)
        }
      }, 100)
      return () => clearInterval(interval)
    }
  }, [])

  const getSelectedElements = useCallback(() => sdkBridge.getSelectedElements(), [])
  const canCopyCut = useCallback(() => sdkBridge.canCopyCut(), [])
  const canAddComment = useCallback(() => sdkBridge.canAddComment(), [])

  return ready
    ? {
        ready: true as const,
        api: sdkBridge,
        getSelectedElements,
        canCopyCut,
        canAddComment,
      }
    : {
        ready: false as const,
        api: null,
        getSelectedElements: () => [],
        canCopyCut: () => false,
        canAddComment: () => false,
      }
}
