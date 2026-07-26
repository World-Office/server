import { colors, radii, shadows, spacing, typography } from "@world-office/design-system"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"

// ── Types ──────────────────────────────────────────────────────────────

export interface ContextMenuItem {
  id: string
  label: string
  icon?: ReactNode
  command?: string
  disabled?: boolean
  separator?: boolean
  checkable?: boolean
  checked?: boolean
  children?: ContextMenuItem[]
}

export interface ContextMenuProps {
  items: ContextMenuItem[]
  x: number
  y: number
  visible: boolean
  onClose: () => void
  onSelect?: (item: ContextMenuItem) => void
  className?: string
}

// ── Helpers ────────────────────────────────────────────────────────────

function clampToViewport(
  left: number,
  top: number,
  width: number,
  height: number,
): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clampedLeft = left + width > vw ? vw - width - 4 : left
  const clampedTop = top + height > vh ? vh - height - 4 : top
  return { left: Math.max(4, clampedLeft), top: Math.max(4, clampedTop) }
}

// ── MenuItem ─────────────────────────────────────────────────────────────

function ContextMenuItemRow({
  item,
  onSelect,
  onHover,
  focused,
}: {
  item: ContextMenuItem
  onSelect?: (item: ContextMenuItem) => void
  onHover?: () => void
  focused: boolean
}) {
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (focused && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" })
    }
  }, [focused])

  if (item.separator) {
    return (
      <li
        style={{ height: 1, backgroundColor: colors.semantic.border, margin: `${spacing[0.5]} 0` }}
      />
    )
  }

  const base: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: spacing[1.5],
    width: "100%",
    padding: `${spacing[1]} ${spacing[2]}`,
    border: "none",
    background: focused ? colors.neutral[100] : "transparent",
    cursor: item.disabled ? "not-allowed" : "pointer",
    opacity: item.disabled ? 0.5 : 1,
    color: colors.semantic.foreground,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.sans,
    textAlign: "left" as const,
    lineHeight: typography.lineHeight.normal,
    outline: "none",
    userSelect: "none",
    transition: "background-color 0.1s",
  }

  return (
    <li ref={ref}>
      <button
        type="button"
        role="menuitem"
        aria-checked={item.checkable ? item.checked : undefined}
        aria-disabled={item.disabled}
        style={base}
        onClick={() => !item.disabled && onSelect?.(item)}
        onMouseEnter={onHover}
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
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                role="img"
                aria-label="Checked"
              >
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
        {item.icon && <span style={{ display: "inline-flex", flexShrink: 0 }}>{item.icon}</span>}
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.children && item.children.length > 0 && (
          <span style={{ fontSize: 10, opacity: 0.5, marginLeft: "auto" }}>▶</span>
        )}
      </button>
    </li>
  )
}

// ── Submenu ─────────────────────────────────────────────────────────────

function ContextSubmenu({
  items,
  onSelect,
  isOpen,
  parentRect,
}: {
  items: ContextMenuItem[]
  onSelect?: (item: ContextMenuItem) => void
  isOpen: boolean
  parentRect: DOMRect
}) {
  const subRef = useRef<HTMLDivElement>(null)

  const vw = window.innerWidth
  const openRight = parentRect.right + 180 < vw

  return (
    <div
      ref={subRef}
      style={{
        position: "fixed",
        top: parentRect.top,
        [openRight ? "left" : "right"]: openRight ? parentRect.right : vw - parentRect.left,
        zIndex: 1001,
        display: isOpen ? "block" : "none",
      }}
    >
      <MenuItems items={items} onSelect={onSelect} />
    </div>
  )
}

// ── MenuItems (recursive) ───────────────────────────────────────────────

function MenuItems({
  items,
  onSelect,
}: {
  items: ContextMenuItem[]
  onSelect?: (item: ContextMenuItem) => void
}) {
  const [focusIdx, setFocusIdx] = useState(-1)
  const [openSubIdx, setOpenSubIdx] = useState(-1)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])
  const ulRef = useRef<HTMLUListElement>(null)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const enabledItems = items
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !item.separator && !item.disabled)

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setFocusIdx((i) => {
            const next = i + 1
            return next >= enabledItems.length ? 0 : next
          })
          setOpenSubIdx(-1)
          break
        case "ArrowUp":
          e.preventDefault()
          setFocusIdx((i) => {
            const next = i - 1
            return next < 0 ? enabledItems.length - 1 : next
          })
          setOpenSubIdx(-1)
          break
        case "ArrowRight": {
          e.preventDefault()
          const { item, idx } = enabledItems[focusIdx] ?? { item: null, idx: -1 }
          if (item?.children && item.children.length > 0) {
            setOpenSubIdx(idx)
          }
          break
        }
        case "ArrowLeft":
          e.preventDefault()
          setOpenSubIdx(-1)
          break
        case "Enter":
          e.preventDefault()
          if (focusIdx >= 0 && enabledItems[focusIdx]) {
            const { item, idx } = enabledItems[focusIdx]
            if (item.children?.length) {
              setOpenSubIdx(idx)
            } else {
              onSelect?.(item)
            }
          }
          break
        case "Escape":
          e.preventDefault()
          break
      }
    },
    [items, focusIdx, onSelect],
  )

  let enabledCounter = 0
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
      {items.map((item, idx) => {
        if (item.separator) {
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: Static menu, order never changes
              key={`sep-${idx}`}
              style={{
                height: 1,
                backgroundColor: colors.semantic.border,
                margin: `${spacing[0.5]} 0`,
              }}
            />
          )
        }

        const thisEnabledIdx = item.disabled ? -1 : enabledCounter++
        const isFocused = focusIdx >= 0 && thisEnabledIdx === focusIdx
        const hasChildren = (item.children?.length ?? 0) > 0
        const isSubOpen = openSubIdx === thisEnabledIdx

        return (
          <li
            key={item.id}
            ref={(el) => {
              itemRefs.current[idx] = el
            }}
            onMouseEnter={() => {
              setFocusIdx(thisEnabledIdx)
              if (hasChildren) setOpenSubIdx(thisEnabledIdx)
            }}
            style={{ position: "relative" }}
          >
            <ContextMenuItemRow
              item={item}
              onSelect={onSelect}
              onHover={() => {
                setFocusIdx(thisEnabledIdx)
                if (hasChildren) setOpenSubIdx(thisEnabledIdx)
              }}
              focused={isFocused}
            />
            {hasChildren && isSubOpen && itemRefs.current[idx] && (
              <ContextSubmenu
                items={item.children ?? []}
                onSelect={onSelect}
                isOpen={isSubOpen}
                parentRect={itemRefs.current[idx]?.getBoundingClientRect()}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ── Main Component ──────────────────────────────────────────────────────

export function ContextMenu({
  items,
  x,
  y,
  visible,
  onClose,
  onSelect,
  className,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Dismiss on scroll
  useEffect(() => {
    if (!visible) return
    const handler = () => onClose()
    window.addEventListener("scroll", handler, true)
    return () => window.removeEventListener("scroll", handler, true)
  }, [visible, onClose])

  // Dismiss on outside click (for items not inside the menu)
  useEffect(() => {
    if (!visible) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Use setTimeout to avoid the right-click event itself closing the menu
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handler)
    }
  }, [visible, onClose])

  // Handle Escape key
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [visible, onClose])

  if (!visible) return null

  const { left, top } = clampToViewport(x, y, 200, 300)

  const containerStyle: CSSProperties = {
    position: "fixed",
    left,
    top,
    zIndex: 1000,
    ...(className ? {} : {}),
  }

  return (
    <div ref={menuRef} className={className} style={containerStyle}>
      <MenuItems items={items} onSelect={onSelect} />
    </div>
  )
}
