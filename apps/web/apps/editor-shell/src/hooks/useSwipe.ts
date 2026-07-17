import { type RefObject, useEffect, useRef } from "react"

interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
}

export function useSwipe(
  ref: RefObject<HTMLElement | null>,
  handlers: SwipeHandlers,
  threshold = 40,
): void {
  const startX = useRef(0)
  const startY = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      startX.current = touch.clientX
      startY.current = touch.clientY
    }

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0]
      if (!touch) return
      const dx = startX.current - touch.clientX
      const dy = startY.current - touch.clientY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      // Prioritize the axis with larger movement
      if (absDx > absDy && absDx > threshold) {
        if (dx > 0) handlers.onSwipeLeft?.()
        else handlers.onSwipeRight?.()
      } else if (absDy > absDx && absDy > threshold) {
        if (dy > 0) handlers.onSwipeUp?.()
        else handlers.onSwipeDown?.()
      }
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true })
    el.addEventListener("touchend", handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener("touchstart", handleTouchStart)
      el.removeEventListener("touchend", handleTouchEnd)
    }
  }, [ref, handlers, threshold])
}
