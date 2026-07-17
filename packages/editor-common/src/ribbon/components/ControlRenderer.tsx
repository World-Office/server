import React from "react"
import { useTranslation } from "react-i18next"
import type {
  RibbonButtonSpec,
  RibbonCheckboxSpec,
  RibbonColorPickerSpec,
  RibbonCommandDispatch,
  RibbonContext,
  RibbonControlSpec,
  RibbonDropdownSpec,
  RibbonSelectSpec,
  RibbonSplitButtonSpec,
} from "../types"

function tl(t: (key: string) => string, ...values: (string | undefined)[]): string {
  const key = values.find((v): v is string => typeof v === "string" && v.length > 0)
  return key ? t(key) : ""
}

interface ControlRendererProps {
  control: RibbonControlSpec
  context: RibbonContext
  dispatch: RibbonCommandDispatch
}

export function ControlRenderer({ control, context, dispatch }: ControlRendererProps) {
  const isVisible = control.visible ? control.visible(context) : true
  if (!isVisible) return null

  const isEnabled = control.enabled ? control.enabled(context) : true

  switch (control.type) {
    case "button":
      return (
        <ButtonControl spec={control} context={context} dispatch={dispatch} enabled={isEnabled} />
      )
    case "select":
      return <SelectControl spec={control} context={context} dispatch={dispatch} enabled={isEnabled} />
    case "dropdown":
      return <DropdownControl spec={control} dispatch={dispatch} enabled={isEnabled} />
    case "split-button":
      return <SplitButtonControl spec={control} dispatch={dispatch} enabled={isEnabled} />
    case "checkbox":
      return <CheckboxControl spec={control} context={context} dispatch={dispatch} enabled={isEnabled} />
    case "color-picker":
      return <ColorPickerControl spec={control} context={context} dispatch={dispatch} enabled={isEnabled} />
    case "separator":
      return (
        <div
          className="de-ribbon-separator"
          style={{
            width: 1,
            height: 32,
            backgroundColor: "var(--wo-de-border-light)",
            margin: "0 4px",
          }}
        />
      )
    case "spacer":
      return <div className="de-ribbon-spacer" style={{ flex: 1 }} />
    default:
      return null
  }
}

function ButtonControl({
  spec,
  context,
  dispatch,
  enabled,
}: {
  spec: RibbonButtonSpec
  context: RibbonContext
  dispatch: RibbonCommandDispatch
  enabled: boolean
}) {
  const { t } = useTranslation()
  const IconComp = getInlineIcon(spec.icon)
  const isToggled = spec.toggleable && spec.toggled ? spec.toggled(context) : false

  return (
    <button
      type="button"
      className={`de-ribbon-btn ${isToggled ? "active" : ""}`}
      disabled={!enabled}
      title={tl(t, spec.tooltip, spec.label)}
      onClick={() => {
        dispatch.onRichTextCommand(spec.command)
        dispatch.onMonacoCommand(spec.command)
        dispatch.onCommand(spec.command)
      }}
    >
      {IconComp && <span className="de-ribbon-btn-icon">{IconComp}</span>}
      {spec.label && <span className="de-ribbon-btn-label">{t(spec.label)}</span>}
    </button>
  )
}

function SelectControl({
  spec,
  context,
  dispatch,
  enabled,
}: {
  spec: RibbonSelectSpec
  context: RibbonContext
  dispatch: RibbonCommandDispatch
  enabled: boolean
}) {
  const { t } = useTranslation()
  const currentValue = spec.value(context)

  return (
    <select
      className="de-ribbon-select"
      value={currentValue}
      disabled={!enabled}
      title={tl(t, spec.tooltip, spec.label)}
      style={spec.width ? { width: spec.width } : undefined}
      onChange={(e) => {
        spec.onChange(e.target.value)
        dispatch.onRichTextCommand(e.target.value)
      }}
    >
      {spec.options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {t(opt.label)}
        </option>
      ))}
    </select>
  )
}

function DropdownControl({
  spec,
  dispatch,
  enabled,
}: {
  spec: RibbonDropdownSpec
  dispatch: RibbonCommandDispatch
  enabled: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const popoverRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div className="de-ribbon-dropdown" style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={buttonRef}
        type="button"
        className="de-ribbon-btn de-ribbon-dropdown-btn"
        disabled={!enabled}
      title={tl(t, spec.tooltip, spec.label)}
        onClick={() => setOpen((o) => !o)}
      >
        {spec.icon ? <span className="de-ribbon-btn-icon">{getInlineIcon(spec.icon)}</span> : null}
        {spec.label ? <span className="de-ribbon-btn-label">{t(spec.label)}</span> : null}
        <span className="de-ribbon-dropdown-arrow">▾</span>
      </button>
      {open && spec.items.length > 0 && (
        <div
          ref={popoverRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 1000,
            background: "#fff",
            border: "1px solid #d0d0d0",
            borderRadius: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            padding: "4px 0",
            marginTop: 2,
            minWidth: 180,
          }}
        >
          {spec.items.map((item, idx) =>
            item.separator ? (
              <div key={`sep-${idx}`} style={{ height: 1, background: "#e0e0e0", margin: "4px 8px" }} />
            ) : (
              <button
                key={item.id}
                type="button"
                className="de-ribbon-dropdown-item"
                disabled={item.disabled}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "6px 12px",
                  border: "none",
                  background: "none",
                  cursor: item.disabled ? "default" : "pointer",
                  textAlign: "left",
                  fontSize: 13,
                }}
                onClick={() => {
                  if (item.command) {
                    dispatch.onRichTextCommand(item.command)
                    dispatch.onCommand(item.command)
                  }
                  setOpen(false)
                }}
              >
                {item.icon ? <span style={{ display: "inline-flex" }}>{getInlineIcon(item.icon)}</span> : null}
                <span>{t(item.label)}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

function SplitButtonControl({
  spec,
  dispatch,
  enabled,
}: {
  spec: RibbonSplitButtonSpec
  dispatch: RibbonCommandDispatch
  enabled: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const popoverRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div className="de-ribbon-split-button" style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className="de-ribbon-btn de-ribbon-split-btn-main"
        disabled={!enabled}
        title={spec.tooltip ? t(spec.tooltip) : ""}
        onClick={() => {
          dispatch.onRichTextCommand(spec.command)
          dispatch.onMonacoCommand(spec.command)
          dispatch.onCommand(spec.command)
        }}
      >
        <span className="de-ribbon-btn-icon">{getInlineIcon(spec.icon)}</span>
      </button>
      <button
        type="button"
        className="de-ribbon-btn de-ribbon-split-btn-arrow"
        disabled={!enabled}
        title={spec.tooltip ? t(spec.tooltip) : ""}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ fontSize: 10, lineHeight: 1 }}>▾</span>
      </button>
      {open && spec.items.length > 0 && (
        <div
          ref={popoverRef}
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            zIndex: 1000,
            background: "#fff",
            border: "1px solid #d0d0d0",
            borderRadius: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            padding: "4px 0",
            marginTop: 2,
            minWidth: 160,
          }}
        >
          {spec.items.map((item, idx) =>
            item.separator ? (
              <div key={`sep-${idx}`} style={{ height: 1, background: "#e0e0e0", margin: "4px 8px" }} />
            ) : (
              <button
                key={item.id}
                type="button"
                className="de-ribbon-dropdown-item"
                disabled={item.disabled}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "6px 12px",
                  border: "none",
                  background: "none",
                  cursor: item.disabled ? "default" : "pointer",
                  textAlign: "left",
                  fontSize: 13,
                }}
                onClick={() => {
                  if (item.command) {
                    dispatch.onRichTextCommand(item.command)
                    dispatch.onCommand(item.command)
                  }
                  setOpen(false)
                }}
              >
                {item.icon ? <span style={{ display: "inline-flex" }}>{getInlineIcon(item.icon)}</span> : null}
                <span>{t(item.label)}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

function CheckboxControl({
  spec,
  context,
  dispatch,
  enabled,
}: {
  spec: RibbonCheckboxSpec
  context: RibbonContext
  dispatch: RibbonCommandDispatch
  enabled: boolean
}) {
  const { t } = useTranslation()
  const isChecked = spec.checked(context)

  return (
    <label className="de-ribbon-checkbox" title={spec.tooltip ? t(spec.tooltip) : ""}>
      <input
        type="checkbox"
        checked={isChecked}
        disabled={!enabled}
        onChange={(e) => {
          spec.onChange(e.target.checked)
          dispatch.onRichTextCommand(spec.id ?? "")
          dispatch.onCommand(spec.id ?? "")
        }}
      />
      <span>{t(spec.label ?? "")}</span>
    </label>
  )
}

function ColorPickerControl({
  spec,
  context,
  dispatch,
  enabled,
}: {
  spec: RibbonColorPickerSpec
  context: RibbonContext
  dispatch: RibbonCommandDispatch
  enabled: boolean
}) {
  const { t } = useTranslation()
  const currentColor = spec.color(context)
  const [open, setOpen] = React.useState(false)
  const popoverRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const defaultPalette = [
    "#000000", "#434343", "#666666", "#999999", "#B7B7B7", "#CCCCCC", "#D9D9D9", "#FFFFFF",
    "#E06666", "#F6B26B", "#FFD966", "#93C47D", "#76A5AF", "#6FA8DC", "#8E7CC3", "#C27BA0",
    "#CC0000", "#E69138", "#F1C232", "#6AA84F", "#45818E", "#3D85C6", "#674EA7", "#A64D79",
    "#990000", "#B45F06", "#BF9000", "#38761D", "#134F5C", "#0B5394", "#351C75", "#741B47",
    "#660000", "#783F04", "#7F6000", "#274E13", "#0C343D", "#073763", "#20124D", "#4C1130",
  ]

  const palette = spec.colors ?? defaultPalette

  return (
    <div className="de-ribbon-colorpicker" title={spec.tooltip ? t(spec.tooltip) : ""} style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        className="de-ribbon-btn"
        disabled={!enabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="de-ribbon-color-swatch"
          style={{
            backgroundColor: currentColor,
            width: 18,
            height: 18,
            borderRadius: 2,
            border: "1px solid #ccc",
            display: "block",
            position: "relative",
          }}
        >
          <span
            style={{
              position: "absolute",
              bottom: -1,
              left: 0,
              width: "100%",
              height: 3,
              backgroundColor: currentColor,
              borderTop: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />
        </span>
        {spec.label && <span className="de-ribbon-btn-label">{t(spec.label)}</span>}
      </button>
      {open && (
        <div
          ref={popoverRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 1000,
            background: "#fff",
            border: "1px solid #d0d0d0",
            borderRadius: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            padding: 8,
            marginTop: 4,
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            gap: 3,
            minWidth: 200,
          }}
        >
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              style={{
                width: 22,
                height: 22,
                borderRadius: 2,
                border: c === currentColor ? "2px solid #333" : "1px solid #d0d0d0",
                backgroundColor: c,
                cursor: "pointer",
                padding: 0,
              }}
              onClick={() => {
                spec.onChange(c)
                const cmd = spec.id.replace(/-([a-z])/g, (_: string, l: string) => l.toUpperCase())
                dispatch.onRichTextCommand(cmd, c)
                setOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function getInlineIcon(name: string): React.ReactNode | null {
  const icons: Record<string, string> = {
    Undo2: "M8 5v6l-5-3 5-3zM16 19a6 6 0 0 0 0-12H8",
    Redo2: "M16 5v6l5-3-5-3zM8 19a6 6 0 0 1 0-12h8",
    Bold: "M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6zM6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z",
    Italic: "M19 4h-9M14 20H5M15 4L9 20",
    Underline: "M6 4v6a6 6 0 0 0 12 0V4M4 20h16",
    Strikethrough: "M6 12h12M16 6a4 4 0 0 0-8 0v4a4 4 0 0 0 8 0V6zM8 18a4 4 0 0 0 8 0",
    Subscript: "M4 18l8-12M4 6l8 12M17 18l4-4-4-4",
    Superscript: "M4 18l8-12M4 6l8 12M17 6l4 4-4 4",
    Scissors:
      "M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM20 4L8 12m0 0l12 8",
    Copy: "M8 4v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7l-3-3H10a2 2 0 0 0-2 2zM16 4v4h4M12 14H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
    ClipboardPaste:
      "M15 2H9a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1M9 2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M15 5h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1",
    Heading1: "M4 12h8M4 18V6M12 18V6M17 18V6l4 4",
    Heading2: "M4 12h8M4 18V6M12 18V6M21 18h-4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h4V8h-6",
    Heading3:
      "M4 12h8M4 18V6M12 18V6M21 10a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2",
    AlignLeft: "M3 6h18M3 12h12M3 18h18M3 24h6",
    AlignCenter: "M3 6h18M6 12h12M3 18h18M9 24h6",
    AlignRight: "M3 6h18M9 12h12M3 18h18M15 24h6",
    AlignJustify: "M3 6h18M3 12h18M3 18h18M3 24h18",
    List: "M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0",
    ListOrdered: "M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1",
    ListChecks: "M8 6h13M8 12h13M8 18h13M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2",
    IndentIncrease: "M3 6h18M3 12h14M3 18h18M7 10l-4 2 4 2",
    IndentDecrease: "M3 6h18M7 12h14M3 18h18M3 10l4 2-4 2",
    TextQuote: "M17 6H3M21 12H8M21 18H8M3 12v6",
    Code2: "M16 18l6-6-6-6M8 6l-6 6 6 6",
    Search: "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-6-6",
    Replace: "M14 4l-4 8h8l-4 8M4 6l2 2m0 0l2-2M6 8V4",
    RemoveFormatting: "M4 7V4h16v3M9 20h6M12 4v16",
    Table2: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
    Palette:
      "M12 2a10 10 0 0 0 0 20c2.5 0 4-1.5 4-3 0-.5-.2-1-.5-1.3-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h1a8 8 0 0 0 8-8c0-4.4-3.6-8-8-8zM6 10a2 2 0 1 1 4 0 2 2 0 0 1-4 0z",
    File: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
    Save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
    Share2: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
    Users:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    ZoomIn: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6",
    ZoomOut: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M8 11h6",
    Image:
      "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM21 15l-5-5L7 15",
    Printer:
      "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14v6h12v-6M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2",
    Globe:
      "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
    Cloud: "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z",
    Lock: "M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4",
    Eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    Settings:
      "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    HelpCircle: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h0",
    Download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    Upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
    ChevronDown: "M6 9l6 6 6-6",
    Plus: "M12 5v14M5 12h14",
    Minus: "M5 12h14",
    X: "M18 6L6 18M6 6l12 12",
    Check: "M20 6L9 17l-5-5",
  }

  const d = icons[name]
  if (!d) return null

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={name}
    >
      <path d={d} />
    </svg>
  )
}
