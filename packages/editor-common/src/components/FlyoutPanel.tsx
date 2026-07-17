import { colors, radii, shadows, spacing } from "@world-office/design-system"
import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"

// ── Types ──────────────────────────────────────────────────────────────

export type FlyoutPosition = "below" | "above" | "left" | "right"

type TriggerRenderFn = (args: { isOpen: boolean; toggle: () => void }) => ReactNode

export interface FlyoutPanelProps {
  /** Element that triggers the flyout (e.g. a toolbar button) */
  trigger: ReactNode | TriggerRenderFn
  /** Content rendered inside the flyout panel */
  children: ReactNode
  /** Where the panel appears relative to the trigger (default: below) */
  position?: FlyoutPosition
  /** Controlled visibility */
  visible?: boolean
  /** Called when visibility changes */
  onVisibleChange?: (visible: boolean) => void
  /** Show arrow indicator on trigger */
  arrow?: boolean
  className?: string
  style?: CSSProperties
}

// ── Component ──────────────────────────────────────────────────────────

export function FlyoutPanel({
  trigger,
  children,
  position = "below",
  visible: controlledVisible,
  onVisibleChange,
  className,
  style,
}: FlyoutPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledVisible !== undefined ? controlledVisible : internalOpen
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledVisible === undefined) {
        setInternalOpen(next)
      }
      onVisibleChange?.(next)
    },
    [controlledVisible, onVisibleChange],
  )

  // Dismiss on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [isOpen, setOpen])

  // Calculate panel position based on trigger
  const getPanelStyle = (): CSSProperties => {
    const base: CSSProperties = {
      position: "absolute",
      zIndex: 1000,
      backgroundColor: colors.semantic.background,
      border: `1px solid ${colors.semantic.border}`,
      borderRadius: radii.md,
      boxShadow: shadows.lg,
      padding: spacing[3],
    }

    if (!triggerRef.current) return base

    const triggerRect = triggerRef.current.getBoundingClientRect()

    switch (position) {
      case "below":
        return { ...base, top: triggerRect.bottom + 4, left: triggerRect.left }
      case "above":
        return { ...base, bottom: window.innerHeight - triggerRect.top + 4, left: triggerRect.left }
      case "left":
        return { ...base, top: triggerRect.top, right: window.innerWidth - triggerRect.left + 4 }
      case "right":
        return { ...base, top: triggerRect.top, left: triggerRect.right + 4 }
      default:
        return base
    }
  }

  return (
    <div className={className} style={{ position: "relative", display: "inline-flex", ...style }}>
      <div ref={triggerRef}>
        {typeof trigger === "function" ? (
          (trigger as TriggerRenderFn)({ isOpen, toggle: () => setOpen(!isOpen) })
        ) : (
          <button
            type="button"
            onClick={() => setOpen(!isOpen)}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              padding: 0,
              display: "contents",
            }}
          >
            {trigger}
          </button>
        )}
      </div>
      {isOpen && (
        <div ref={panelRef} style={getPanelStyle()}>
          {children}
        </div>
      )}
    </div>
  )
}
