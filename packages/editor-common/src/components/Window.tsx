import { colors, radii, shadows, spacing, typography } from "@world-office/design-system"
import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

// ── Types ──────────────────────────────────────────────────────────────

export type WindowButtonDef =
  | "ok"
  | "cancel"
  | "yes"
  | "no"
  | "close"
  | { value: string; caption: string; primary?: boolean; cls?: string }

export interface WindowProps {
  title?: string
  closable?: boolean
  modal?: boolean
  width?: number | "auto"
  height?: number | "auto"
  minWidth?: number
  minHeight?: number
  buttons?: WindowButtonDef[]
  primary?: string
  children?: ReactNode
  className?: string
  style?: CSSProperties
  visible?: boolean
  onClose?: () => void
  onButton?: (value: string) => void
}

// ── Button Labels ─────────────────────────────────────────────────────

const BUTTON_LABELS: Record<string, string> = {
  ok: "OK",
  cancel: "Cancel",
  yes: "Yes",
  no: "No",
  close: "Close",
}

// ── Alert Presets ──────────────────────────────────────────────────────

export interface AlertOptions {
  msg: string
  title?: string
  iconCls?: string
  buttons?: WindowButtonDef[]
  primary?: string
  callback?: (button: string) => void
}

export function AlertWindow({
  msg,
  title,
  iconCls,
  buttons = ["ok"],
  primary = "ok",
  callback,
}: AlertOptions) {
  return (
    <Window
      title={title || ""}
      modal
      buttons={buttons}
      primary={primary}
      onButton={(value) => callback?.(value)}
    >
      <div
        style={{
          display: "flex",
          gap: spacing[2],
          alignItems: "flex-start",
          padding: spacing[2],
        }}
      >
        {iconCls && (
          <span className={iconCls} style={{ fontStyle: "normal", flexShrink: 0 }}>
            &nbsp;
          </span>
        )}
        <span
          style={{
            fontSize: typography.fontSize.sm,
            color: colors.semantic.foreground,
            lineHeight: typography.lineHeight.relaxed,
          }}
        >
          {msg}
        </span>
      </div>
    </Window>
  )
}

export function alert(_options: AlertOptions): void {
  // Note: This is a synchronous API stub. In React, alerts should be
  // rendered via state. Use <AlertWindow /> directly in your component.
  console.warn("Common.UI.alert() — use <AlertWindow /> component instead")
}

export function error(options: Omit<AlertOptions, "iconCls">) {
  alert({ ...options, title: options.title || "Error", iconCls: "error" })
}

export function info(options: Omit<AlertOptions, "iconCls">) {
  alert({ ...options, title: options.title || "Information", iconCls: "info" })
}

export function warning(options: Omit<AlertOptions, "iconCls">) {
  alert({ ...options, title: options.title || "Warning", iconCls: "warn" })
}

export function confirm(options: Omit<AlertOptions, "iconCls">) {
  alert({
    ...options,
    title: options.title || "Confirmation",
    iconCls: "confirm",
    buttons: options.buttons || ["ok", "cancel"],
  })
}

// ── Window Component ──────────────────────────────────────────────────

export function Window({
  title,
  closable = true,
  modal = true,
  width = "auto",
  height = "auto",
  minWidth = 200,
  minHeight = 100,
  buttons = [],
  primary,
  children,
  className,
  style,
  visible = true,
  onClose,
  onButton,
}: WindowProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({
    w: typeof width === "number" ? width : 400,
    h: typeof height === "number" ? height : 0,
  })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const windowRef = useRef<HTMLDialogElement>(null)

  // Center on mount
  useEffect(() => {
    if (!visible) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = typeof width === "number" ? width : Math.min(400, vw - 40)
    const h = typeof height === "number" ? height : 0
    setSize({ w, h })
    setPos({
      x: Math.floor((vw - w) / 2),
      y: Math.floor((vh - h) / 2),
    })
  }, [visible, width, height])

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains("close")) return
      setIsDragging(true)
      dragOffset.current = {
        x: e.clientX - pos.x,
        y: e.clientY - pos.y,
      }
    },
    [pos],
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const maxX = window.innerWidth - size.w
      const maxY = window.innerHeight - size.h
      setPos({
        x: Math.max(0, Math.min(e.clientX - dragOffset.current.x, maxX)),
        y: Math.max(0, Math.min(e.clientY - dragOffset.current.y, maxY)),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, size])

  // ESC key
  useEffect(() => {
    if (!visible || !closable) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose?.()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [visible, closable, onClose])

  if (!visible) return null

  // Parse buttons
  const parsedButtons = buttons.map((btn) => {
    if (typeof btn === "string") {
      return {
        value: btn,
        caption: BUTTON_LABELS[btn] || btn,
        primary: primary === btn,
      }
    }
    return { primary: false, ...btn }
  })

  // Mask style
  const maskStyle: CSSProperties = modal
    ? {
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        zIndex: 9998,
      }
    : { display: "none" }

  // Window style
  const windowStyle: CSSProperties = {
    position: "fixed",
    left: pos.x,
    top: pos.y,
    width: size.w,
    height: height !== "auto" ? size.h : "auto",
    minWidth,
    minHeight,
    backgroundColor: colors.semantic.background,
    borderRadius: radii.lg,
    boxShadow: shadows.xl,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    fontFamily: typography.fontFamily.sans,
    overflow: "hidden",
    opacity: visible ? 1 : 0,
    transition: "opacity 0.2s",
    ...style,
  }

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${spacing[1.5]} ${spacing[2]}`,
    borderBottom: `1px solid ${colors.semantic.border}`,
    cursor: isDragging ? "grabbing" : "grab",
    userSelect: "none",
    flexShrink: 0,
  }

  const titleStyle: CSSProperties = {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.semantic.foreground,
    margin: 0,
  }

  const closeBtnStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    border: "none",
    backgroundColor: "transparent",
    color: colors.neutral[500],
    cursor: "pointer",
    borderRadius: radii.sm,
    fontSize: 18,
    lineHeight: 1,
  }

  const bodyStyle: CSSProperties = {
    flex: 1,
    padding: spacing[2],
    overflow: "auto",
  }

  const footerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: spacing[1.5],
    padding: `${spacing[1.5]} ${spacing[2]}`,
    borderTop: `1px solid ${colors.semantic.border}`,
    flexShrink: 0,
  }

  const btnStyle = (isPrimary: boolean): CSSProperties => ({
    padding: `${spacing[0.5]} ${spacing[3]}`,
    border: "none",
    borderRadius: radii.sm,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    cursor: "pointer",
    fontFamily: typography.fontFamily.sans,
    backgroundColor: isPrimary ? colors.accent.DEFAULT : colors.neutral[100],
    color: isPrimary ? colors.accent.foreground : colors.semantic.foreground,
    lineHeight: typography.lineHeight.normal,
    transition: "background-color 0.15s",
  })

  const content = (
    <>
      {modal && (
        <div
          style={maskStyle}
          onClick={closable ? onClose : undefined}
          onKeyDown={closable ? (e) => e.key === "Enter" && onClose?.() : undefined}
          role="presentation"
        />
      )}
      <dialog
        ref={windowRef}
        className={className}
        style={{ ...windowStyle, position: "fixed" }}
        aria-modal={modal}
        aria-label={title}
        open
      >
        <div style={headerStyle} onMouseDown={handleDragStart}>
          <span style={titleStyle}>{title}</span>
          {closable && (
            <button
              type="button"
              className="close"
              style={closeBtnStyle}
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
        <div style={bodyStyle}>{children}</div>
        {parsedButtons.length > 0 && (
          <div style={footerStyle}>
            {parsedButtons.map((btn) => (
              <button
                key={btn.value}
                type="button"
                style={btnStyle(!!btn.primary)}
                onClick={() => onButton?.(btn.value)}
              >
                {btn.caption}
              </button>
            ))}
          </div>
        )}
      </dialog>
    </>
  )

  return createPortal(content, document.body)
}
