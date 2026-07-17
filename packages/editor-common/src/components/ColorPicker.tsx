import { colors, radii, shadows, spacing, typography } from "@world-office/design-system"
import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"

// ── Types ──────────────────────────────────────────────────────────────

export interface ColorPickerProps {
  /** Current selected color (hex string or "transparent") */
  value: string
  /** Called when a color is selected */
  onChange: (color: string) => void
  /** Custom color palette. Defaults to office-standard 32-color grid. */
  presetColors?: string[]
  disabled?: boolean
  className?: string
  style?: CSSProperties
}

// ── Shared state ───────────────────────────────────────────────────────

const DEFAULT_PALETTE = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#B7B7B7",
  "#CCCCCC",
  "#D9D9D9",
  "#FFFFFF",
  "#E06666",
  "#F6B26B",
  "#FFD966",
  "#93C47D",
  "#76A5AF",
  "#6FA8DC",
  "#8E7CC3",
  "#C27BA0",
  "#CC0000",
  "#E69138",
  "#F1C232",
  "#6AA84F",
  "#45818E",
  "#3D85C6",
  "#674EA7",
  "#A64D79",
  "#990000",
  "#B45F06",
  "#BF9000",
  "#38761D",
  "#134F5C",
  "#0B5394",
  "#351C75",
  "#741B47",
  "#660000",
  "#783F04",
  "#7F6000",
  "#274E13",
  "#0C343D",
  "#073763",
  "#20124D",
  "#4C1130",
]

const MAX_RECENT = 8
const recentColors = new Set<string>()

// ── Component ──────────────────────────────────────────────────────────

export function ColorPicker({
  value,
  onChange,
  presetColors,
  disabled = false,
  className,
  style,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const nativeInputRef = useRef<HTMLInputElement>(null)

  // Dismiss on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const palette = presetColors ?? DEFAULT_PALETTE
  const recent = [...recentColors].slice(0, MAX_RECENT)

  const handleSelect = useCallback(
    (color: string) => {
      if (color !== "transparent") {
        recentColors.add(color)
      }
      onChange(color)
      setOpen(false)
    },
    [onChange],
  )

  const handleNativeColor = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const color = e.target.value
      recentColors.add(color)
      onChange(color)
      setOpen(false)
    },
    [onChange],
  )

  const swatchStyle = (c: string): CSSProperties => ({
    width: 22,
    height: 22,
    borderRadius: 2,
    border: c === value ? "2px solid #333" : "1px solid #d0d0d0",
    backgroundColor: c,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: 0,
    flexShrink: 0,
  })

  const panelStyle: CSSProperties = {
    position: "absolute",
    top: "100%",
    left: 0,
    zIndex: 1000,
    backgroundColor: colors.semantic.background,
    border: `1px solid ${colors.semantic.border}`,
    borderRadius: radii.md,
    boxShadow: shadows.lg,
    padding: spacing[2],
    marginTop: spacing[1],
    minWidth: 210,
  }

  const btnStyle: CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: spacing[1],
    border: "none",
    background: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    padding: 0,
    opacity: disabled ? 0.5 : 1,
    ...style,
  }

  const indicatorStyle: CSSProperties = {
    width: 18,
    height: 18,
    borderRadius: 2,
    border: "1px solid #ccc",
    display: "block",
    position: "relative",
    flexShrink: 0,
  }

  return (
    <div ref={containerRef} className={className} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={btnStyle}
      >
        <span style={indicatorStyle}>
          <span
            style={{
              backgroundColor: value === "transparent" ? "#fff" : value,
              width: "100%",
              height: "100%",
              display: "block",
              borderRadius: 1,
              background:
                value === "transparent"
                  ? "repeating-linear-gradient(45deg, #fff, #fff 2px, #ddd 2px, #ddd 4px)"
                  : undefined,
            }}
          />
          <span
            style={{
              position: "absolute",
              bottom: -1,
              left: 0,
              width: "100%",
              height: 3,
              backgroundColor: value === "transparent" ? "#fff" : value,
              borderTop: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />
        </span>
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Recent Colors */}
          {recent.length > 0 && (
            <>
              <div
                style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.neutral[500],
                  marginBottom: spacing[1],
                  fontWeight: typography.fontWeight.medium,
                }}
              >
                Recent
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${MAX_RECENT}, 1fr)`,
                  gap: 3,
                  marginBottom: spacing[2],
                }}
              >
                {recent.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    style={swatchStyle(c)}
                    onClick={() => handleSelect(c)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Preset palette */}
          <div
            style={{
              fontSize: typography.fontSize.xs,
              color: colors.neutral[500],
              marginBottom: spacing[1],
              fontWeight: typography.fontWeight.medium,
            }}
          >
            Theme Colors
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(8, 1fr)",
              gap: 3,
              marginBottom: spacing[2],
            }}
          >
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                style={swatchStyle(c)}
                onClick={() => handleSelect(c)}
              />
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: spacing[1] }}>
            <button
              type="button"
              style={{
                flex: 1,
                padding: `${spacing[1]} ${spacing[2]}`,
                fontSize: typography.fontSize.xs,
                border: `1px solid ${colors.semantic.border}`,
                borderRadius: radii.sm,
                background: "transparent",
                cursor: "pointer",
                textAlign: "center",
                fontFamily: typography.fontFamily.sans,
              }}
              onClick={() => handleSelect("transparent")}
            >
              No Color
            </button>
            <button
              type="button"
              style={{
                flex: 1,
                padding: `${spacing[1]} ${spacing[2]}`,
                fontSize: typography.fontSize.xs,
                border: `1px solid ${colors.semantic.border}`,
                borderRadius: radii.sm,
                background: "transparent",
                cursor: "pointer",
                textAlign: "center",
                fontFamily: typography.fontFamily.sans,
              }}
              onClick={() => nativeInputRef.current?.click()}
            >
              More Colors…
            </button>
          </div>
          <input
            ref={nativeInputRef}
            type="color"
            value={value === "transparent" ? "#000000" : value}
            onChange={handleNativeColor}
            style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
          />
        </div>
      )}
    </div>
  )
}
