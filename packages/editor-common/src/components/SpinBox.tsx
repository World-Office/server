import { colors, radii, spacing, typography } from "@world-office/design-system"
import { useCallback, useRef, useState } from "react"
import type { CSSProperties } from "react"

// ── Types ──────────────────────────────────────────────────────────────

export interface SpinBoxProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  style?: CSSProperties
  /** Input width in characters (affects the visual width) */
  size?: number
}

// ── Helpers ──────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ── Component ──────────────────────────────────────────────────────────

export function SpinBox({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  disabled = false,
  className,
  style,
  size = 3,
}: SpinBoxProps) {
  const [inputValue, setInputValue] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync controlled value to input text
  const prevValueRef = useRef(value)
  if (value !== prevValueRef.current) {
    setInputValue(String(value))
    prevValueRef.current = value
  }

  const commit = useCallback(
    (raw: string) => {
      const parsed = Number.parseInt(raw, 10)
      if (!Number.isNaN(parsed)) {
        const clamped = clamp(parsed, min, max)
        onChange(clamped)
        setInputValue(String(clamped))
      } else {
        // Revert to current value
        setInputValue(String(value))
      }
    },
    [value, min, max, onChange],
  )

  const increment = useCallback(() => {
    const next = clamp(value + step, min, max)
    onChange(next)
    setInputValue(String(next))
  }, [value, step, min, max, onChange])

  const decrement = useCallback(() => {
    const next = clamp(value - step, min, max)
    onChange(next)
    setInputValue(String(next))
  }, [value, step, min, max, onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      commit(inputValue)
      inputRef.current?.blur()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      increment()
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      decrement()
    } else if (e.key === "Escape") {
      e.preventDefault()
      setInputValue(String(value))
    }
  }

  const containerStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "stretch",
    border: `1px solid ${colors.semantic.border}`,
    borderRadius: radii.sm,
    backgroundColor: disabled ? colors.neutral[100] : colors.semantic.background,
    overflow: "hidden",
    ...style,
  }

  const inputStyle: CSSProperties = {
    width: `${size + 0.5}ch`,
    padding: `${spacing[0.5]} ${spacing[1]}`,
    border: "none",
    outline: "none",
    background: "transparent",
    color: colors.semantic.foreground,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.sans,
    textAlign: "center" as const,
    lineHeight: typography.lineHeight.normal,
    flexShrink: 0,
    // Hide spinners
    MozAppearance: "textfield",
    appearance: "textfield",
  }

  const btnStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    padding: 0,
    border: "none",
    borderLeft: `1px solid ${colors.semantic.border}`,
    background: "transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    color: colors.semantic.foreground,
    fontSize: 8,
    lineHeight: 1,
    flexShrink: 0,
    userSelect: "none",
  }

  return (
    <div className={className} style={containerStyle}>
      <input
        ref={inputRef}
        type="number"
        value={inputValue}
        disabled={disabled}
        style={inputStyle}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={() => commit(inputValue)}
        onKeyDown={handleKeyDown}
        aria-label="Spin box"
      />
      <div style={{ display: "flex", flexDirection: "column", borderLeft: `1px solid ${colors.semantic.border}` }}>
        <button type="button" disabled={disabled} style={{ ...btnStyle, borderBottom: `1px solid ${colors.semantic.border}`, borderRadius: 0 }} onClick={increment} aria-label="Increase">
          ▲
        </button>
        <button type="button" disabled={disabled} style={{ ...btnStyle, borderRadius: 0 }} onClick={decrement} aria-label="Decrease">
          ▼
        </button>
      </div>
    </div>
  )
}
