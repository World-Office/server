import { colors, radii, shadows, spacing, typography } from "@world-office/design-system"
import type React from "react"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"

// ── Types ──────────────────────────────────────────────────────────────

export interface DropdownMenuItem {
  id: string
  label: string
  icon?: ReactNode
  command?: string
  disabled?: boolean
  separator?: boolean
  checkable?: boolean
  checked?: boolean
  children?: DropdownMenuItem[]
}

export interface DropdownMenuProps {
  /** Trigger element or label string */
  trigger: ReactNode | string
  items: DropdownMenuItem[]
  onSelect?: (item: DropdownMenuItem) => void
  align?: "left" | "right"
  className?: string
  style?: CSSProperties
}

// ── Helpers ────────────────────────────────────────────────────────────

function useCloseOnOutside(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, onClose, ref])
}

// ── Subcomponents ──────────────────────────────────────────────────────

function itemStyle(disabled: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: spacing[1.5],
    width: "100%",
    padding: `${spacing[1]} ${spacing[2]}`,
    border: "none",
    background: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    color: colors.semantic.foreground,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.sans,
    textAlign: "left" as const,
    lineHeight: typography.lineHeight.normal,
    outline: "none",
    userSelect: "none",
  }
}

function MenuList({
  items,
  onSelect,
}: { items: DropdownMenuItem[]; onSelect?: (item: DropdownMenuItem) => void }) {
  const [focusIdx, setFocusIdx] = useState(-1)
  const ulRef = useRef<HTMLUListElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const enabledItems = items.filter((i) => !i.separator && !i.disabled)
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setFocusIdx((i) => (i + 1) % enabledItems.length)
        break
      case "ArrowUp":
        e.preventDefault()
        setFocusIdx((i) => (i - 1 + enabledItems.length) % enabledItems.length)
        break
      case "Enter":
        e.preventDefault()
        if (focusIdx >= 0 && enabledItems[focusIdx]) {
          onSelect?.(enabledItems[focusIdx])
        }
        break
      case "Escape":
        e.preventDefault()
        break
    }
  }

  let enabledIdx = 0
  return (
    <ul
      ref={ulRef}
      role="menu"
      style={{
        listStyle: "none",
        margin: 0,
        padding: `${spacing[0.5]} 0`,
        backgroundColor: colors.semantic.background,
        border: `1px solid ${colors.semantic.border}`,
        borderRadius: radii.md,
        boxShadow: shadows.lg,
        minWidth: 180,
        maxHeight: 300,
        overflowY: "auto",
      }}
      onKeyDown={handleKeyDown}
    >
      {items.map((item) => {
        if (item.separator) {
          return (
            <li
              key={`sep-${item.id}`}
              style={{
                height: 1,
                backgroundColor: colors.semantic.border,
                margin: `${spacing[0.5]} 0`,
              }}
            />
          )
        }
        const currentEnabledIdx = item.disabled ? -1 : enabledIdx++
        return (
          <li key={item.id}>
            <button
              type="button"
              role="menuitem"
              aria-checked={item.checkable ? item.checked : undefined}
              aria-disabled={item.disabled}
              data-focus-idx={currentEnabledIdx}
              style={itemStyle(item.disabled ?? false)}
              onClick={() => onSelect?.(item)}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.backgroundColor = colors.neutral[100]
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.backgroundColor = "transparent"
              }}
            >
              {item.checkable && (
                <span
                  style={{
                    width: 16,
                    height: 16,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {item.checked && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" role="img" aria-label="Checked">
                      <title>Checked</title>
                      <path
                        d="M2 5L4 7L8 3"
                        stroke={colors.accent.DEFAULT}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
              )}
              {item.icon && (
                <span style={{ display: "inline-flex", flexShrink: 0 }}>{item.icon}</span>
              )}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.children && item.children.length > 0 && (
                <span style={{ fontSize: 10, opacity: 0.5, marginLeft: "auto" }}>▶</span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ── Component ──────────────────────────────────────────────────────────

export function DropdownMenu({
  trigger,
  items,
  onSelect,
  align = "left",
  className,
  style,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = useCallback(() => setOpen(false), [])
  useCloseOnOutside(containerRef, open, close)

  const handleSelect = useCallback(
    (item: DropdownMenuItem) => {
      onSelect?.(item)
      close()
    },
    [onSelect, close],
  )

  const popoverStyle: CSSProperties = {
    position: "absolute",
    top: "100%",
    [align]: 0,
    zIndex: 1000,
    marginTop: 2,
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", display: "inline-flex", ...style }}
    >
      <button
        type="button"
        id={id}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: spacing[1],
          color: colors.semantic.foreground,
          fontFamily: typography.fontFamily.sans,
          fontSize: typography.fontSize.sm,
        }}
      >
        {typeof trigger === "string" ? <span>{trigger}</span> : trigger}
      </button>
      {open && (
        <div style={popoverStyle}>
          <MenuList items={items} onSelect={handleSelect} />
        </div>
      )}
    </div>
  )
}
