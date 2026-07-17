import { type RefObject, useEffect, useRef } from "react"

interface PinchZoomHandlers {
  onZoomIn?: () => void
  onZoomOut?: () => void
  threshold?: number
}

export function usePinchZoom(
  ref: RefObject<HTMLElement | null>,
  handlers: PinchZoomHandlers,
): void {
  const lastDist = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastDist.current = 0
        return
      }

      const t1 = e.touches[0]
      const t2 = e.touches[1]
      if (!t1 || !t2) return
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)

      if (lastDist.current > 0) {
        const delta = dist - lastDist.current
        const threshold = handlers.threshold ?? 20
        if (delta > threshold) {
          handlers.onZoomIn?.()
          lastDist.current = dist
        } else if (delta < -threshold) {
          handlers.onZoomOut?.()
          lastDist.current = dist
        }
      } else {
        lastDist.current = dist
      }
    }

    const handleTouchEnd = () => {
      lastDist.current = 0
    }

    el.addEventListener("touchmove", handleTouchMove, { passive: true })
    el.addEventListener("touchend", handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener("touchmove", handleTouchMove)
      el.removeEventListener("touchend", handleTouchEnd)
    }
  }, [ref, handlers])
}
