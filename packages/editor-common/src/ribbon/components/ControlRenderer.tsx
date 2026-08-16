import {
	Button,
	Checkbox,
	Divider,
	Menu,
	MenuDivider,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
	Select,
	Tooltip,
	mergeClasses,
	makeStyles,
	tokens,
} from "@fluentui/react-components"
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
			return (
				<SelectControl spec={control} context={context} dispatch={dispatch} enabled={isEnabled} />
			)
		case "dropdown":
			return <DropdownControl spec={control} dispatch={dispatch} enabled={isEnabled} />
		case "split-button":
			return <SplitButtonControl spec={control} dispatch={dispatch} enabled={isEnabled} />
		case "checkbox":
			return (
				<CheckboxControl spec={control} context={context} dispatch={dispatch} enabled={isEnabled} />
			)
		case "color-picker":
			return (
				<ColorPickerControl
					spec={control}
					context={context}
					dispatch={dispatch}
					enabled={isEnabled}
				/>
			)
		case "separator":
			return <Divider vertical style={{ height: 28, margin: "0 4px" }} />
		case "spacer":
			return <div style={{ flex: 1 }} />
		default:
			return null
	}
}

const useStyles = makeStyles({
	btn: {
		minWidth: "0px",
		height: "32px",
		gap: "4px",
		paddingLeft: "6px",
		paddingRight: "6px",
	},
	btnLabel: {
		fontSize: tokens.fontSizeBase200,
		lineHeight: 1,
	},
	btnActive: {
		background: tokens.colorSubtleBackgroundSelected,
	},
	select: {
		height: "30px",
		minWidth: "80px",
	},
	checkbox: {
		display: "flex",
		alignItems: "center",
	},
	dropdownMenu: {
		minWidth: "200px",
	},
	swatchGrid: {
		display: "grid",
		gridTemplateColumns: "repeat(8, 1fr)",
		gap: "4px",
		padding: "8px",
		width: "220px",
	},
	swatch: {
		width: "22px",
		height: "22px",
		borderRadius: "3px",
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		cursor: "pointer",
		padding: 0,
		":hover": {
			outline: `2px solid ${tokens.colorBrandStroke2}`,
			outlineOffset: "1px",
		},
	},
	swatchSelected: {
		border: `2px solid ${tokens.colorBrandStroke1}`,
	},
})

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
	const styles = useStyles()
	const IconComp = getInlineIcon(spec.icon)
	const isToggled = spec.toggleable && spec.toggled ? spec.toggled(context) : false
	const title = tl(t, spec.tooltip, spec.label)

	const button = (
		<Button
			appearance={isToggled ? "secondary" : "subtle"}
			size="small"
			icon={IconComp ? <span className="de-ribbon-btn-icon">{IconComp}</span> : undefined}
			disabled={!enabled}
			className={mergeClasses(styles.btn, isToggled ? styles.btnActive : undefined)}
			onClick={() => {
				dispatch.onRichTextCommand(spec.command, spec.value)
				dispatch.onMonacoCommand(spec.command)
				dispatch.onCommand(spec.command, spec.value)
			}}
		>
			{spec.label ? <span className={styles.btnLabel}>{t(spec.label)}</span> : null}
		</Button>
	)

	return title ? (
		<Tooltip content={title} relationship="label" positioning="above">
			{button}
		</Tooltip>
	) : (
		button
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
	const styles = useStyles()
	const currentValue = spec.value(context)

	return (
		<Select
			className={styles.select}
			value={currentValue}
			disabled={!enabled}
			aria-label={tl(t, spec.tooltip, spec.label)}
			size="small"
			style={spec.width ? { width: spec.width } : undefined}
			onChange={(e) => {
				spec.onChange(e.target.value)
				dispatch.onCommand(spec.id, e.target.value)
			}}
		>
			{spec.options.map((opt) => (
				<option key={opt.value} value={opt.value}>
					{t(opt.label)}
				</option>
			))}
		</Select>
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
	const styles = useStyles()
	const IconComp = spec.icon ? getInlineIcon(spec.icon) : null

	return (
		<Menu positioning="below-start">
			<MenuTrigger disableButtonEnhancement>
				<Button
					size="small"
					appearance="subtle"
					className={styles.btn}
					disabled={!enabled}
					title={tl(t, spec.tooltip, spec.label)}
				>
					{IconComp ? <span className="de-ribbon-btn-icon">{IconComp}</span> : null}
					{spec.label ? <span className={styles.btnLabel}>{t(spec.label)}</span> : null}
					<span style={{ fontSize: 8, lineHeight: 1 }}>▾</span>
				</Button>
			</MenuTrigger>
			<MenuPopover>
				<MenuList className={styles.dropdownMenu}>
					{spec.items.map((item, idx) =>
						item.separator ? (
							<MenuDivider
								// biome-ignore lint/suspicious/noArrayIndexKey: Static menu, order never changes
								key={`sep-${idx}`}
							/>
						) : (
							<MenuItem
								key={item.id}
								disabled={item.disabled}
								icon={item.icon ? <span>{getInlineIcon(item.icon)}</span> : undefined}
								onClick={() => {
									if (item.command) {
										window.dispatchEvent(
											new CustomEvent("wo-command", { detail: { command: item.command } }),
										)
										dispatch.onCommand(item.command)
									}
								}}
							>
								{t(item.label)}
							</MenuItem>
						),
					)}
				</MenuList>
			</MenuPopover>
		</Menu>
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
	const styles = useStyles()

	return (
		<Menu positioning="below-end">
			<MenuTrigger disableButtonEnhancement>
				<Button
					size="small"
					appearance="subtle"
					className={styles.btn}
					disabled={!enabled}
					title={spec.tooltip ? t(spec.tooltip) : ""}
					icon={<span className="de-ribbon-btn-icon">{getInlineIcon(spec.icon)}</span>}
					onClick={() => {
						dispatch.onRichTextCommand(spec.command)
						dispatch.onMonacoCommand(spec.command)
						dispatch.onCommand(spec.command)
					}}
				>
					<span style={{ fontSize: 8, lineHeight: 1 }}>▾</span>
				</Button>
			</MenuTrigger>
			<MenuPopover>
				<MenuList className={styles.dropdownMenu}>
					{spec.items.map((item, idx) =>
						item.separator ? (
							<MenuDivider
								// biome-ignore lint/suspicious/noArrayIndexKey: Static menu, order never changes
								key={`sep-${idx}`}
							/>
						) : (
							<MenuItem
								key={item.id}
								disabled={item.disabled}
								icon={item.icon ? <span>{getInlineIcon(item.icon)}</span> : undefined}
								onClick={() => {
									if (item.command) {
										window.dispatchEvent(
											new CustomEvent("wo-command", { detail: { command: item.command } }),
										)
										dispatch.onCommand(item.command)
									}
								}}
							>
								{t(item.label)}
							</MenuItem>
						),
					)}
				</MenuList>
			</MenuPopover>
		</Menu>
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
	const styles = useStyles()
	const isChecked = spec.checked(context)

	return (
		<Checkbox
			className={styles.checkbox}
			checked={isChecked}
			disabled={!enabled}
			label={t(spec.label ?? "")}
			title={spec.tooltip ? t(spec.tooltip) : ""}
			onChange={(e) => {
				const checked = e.target.checked
				spec.onChange(checked)
				if (spec.command) {
					dispatch.onCommand(spec.command, checked ? "true" : "false")
				} else {
					dispatch.onCommand(spec.id ?? "")
				}
			}}
		/>
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
	const styles = useStyles()
	const currentColor = spec.color(context)

	const defaultPalette = [
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

	const palette = spec.colors ?? defaultPalette

	return (
		<Menu positioning="below-start">
			<MenuTrigger disableButtonEnhancement>
				<Button
					size="small"
					appearance="subtle"
					className={styles.btn}
					disabled={!enabled}
					title={spec.tooltip ? t(spec.tooltip) : ""}
					icon={
						<span
							className="de-ribbon-color-swatch"
							style={{
								backgroundColor: currentColor,
								width: 18,
								height: 18,
								borderRadius: 2,
								border: "1px solid #ccc",
								display: "block",
							}}
						/>
					}
				>
					{spec.label && <span className={styles.btnLabel}>{t(spec.label)}</span>}
				</Button>
			</MenuTrigger>
			<MenuPopover>
				<div className={styles.swatchGrid} role="menu">
					{palette.map((c) => (
						<button
							key={c}
							type="button"
							title={c}
							role="menuitem"
							className={mergeClasses(
								styles.swatch,
								c === currentColor ? styles.swatchSelected : undefined,
							)}
							style={{ backgroundColor: c }}
							onClick={() => {
								spec.onChange(c)
								const cmd = spec.id.replace(/-([a-z])/g, (_: string, l: string) =>
									l.toUpperCase(),
								)
								dispatch.onRichTextCommand(cmd, c)
							}}
						/>
					))}
				</div>
			</MenuPopover>
		</Menu>
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
		AlignLeft: "M3 6h18M3 12h12M3 18h18",
		AlignCenter: "M3 6h18M6 12h12M3 18h18",
		AlignRight: "M3 6h18M9 12h12M3 18h18",
		AlignJustify: "M3 6h18M3 12h18M3 18h18",
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
		AlignCenterVertical: "M3 12h18M7 8h10v8H7zM2 2h4v4H2zM18 2h4v4h-4zM2 18h4v4H2zM18 18h4v4h-4z",
		AlignEndVertical: "M3 22h18v-4H3zM8 6h8v12H8zM2 2h4v4H2zM18 2h4v4h-4z",
		AlignStartVertical: "M3 2h18v4H3zM8 10h8v8H8zM3 22h18v-4H3z",
		AreaChart: "M3 3v18h18M3 18l7-7 4 3 7-7",
		ArrowDownCircle:
			"M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10zM8 12l4 4 4-4M12 8v8",
		ArrowLeftRight: "M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4",
		ArrowRight: "M5 12h14M12 5l7 7-7 7",
		ArrowRightToLine: "M3 5v14M13 5l7 7-7 7M8 12h12",
		ArrowUpCircle:
			"M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10zM16 12l-4-4-4 4M12 16V8",
		ArrowUpDown: "M3 8l4-4 4 4M7 4v16M17 20l4-4-4-4M17 20V4",
		BadgeCheck:
			"M3.85 8.62a4 4 0 014.78-4.77 4 4 0 016.74 0 4 4 0 014.78 4.78 4 4 0 010 6.74 4 4 0 01-4.77 4.78 4 4 0 01-6.75 0 4 4 0 01-4.78-4.77 4 4 0 010-6.76zM9 12l2 2 4-4",
		BadgePlus:
			"M3.85 8.62a4 4 0 014.78-4.77 4 4 0 016.74 0 4 4 0 014.78 4.78 4 4 0 010 6.74 4 4 0 01-4.77 4.78 4 4 0 01-6.75 0 4 4 0 01-4.78-4.77 4 4 0 010-6.76zM12 8v8M8 12h8",
		BarChart3: "M3 3v18h18M7 16V8M12 16v-6M17 16V3",
		BarChartHorizontal: "M3 3v18h18M7 5h10v3H7zM7 11h14v3H7zM7 17h6v3H7z",
		BringToFront: "M5 3h14v14H5zM9 11h10v10H9zM7 7h10m0 0v10",
		Calendar: "M3 4h18v18H3zM3 10h18M8 2v4M16 2v4",
		CheckCheck: "M2 12l3 3 7-7M14 12l3 3 5-5M6 17l3 3 5-5",
		CheckCircle: "M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10zM9 12l2 2 4-4",
		CheckSquare: "M3 3h18v18H3zM9 12l2 2 4-4",
		ChevronLeft: "M15 6l-6 6 6 6",
		ChevronRight: "M9 6l6 6-6 6",
		ChevronsLeft: "M11 6l-5 5 5 5M18 6l-5 5 5 5",
		ChevronsRight: "M13 6l5 5-5 5M6 6l5 5-5 5",
		ChevronUp: "M6 15l6-6 6 6",
		Clock: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2",
		Columns2: "M3 3h18v18H3zM12 3v18",
		Combine: "M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4M3 12h18",
		CreditCard: "M3 10h18M3 6h18M3 18h18M3 14h18",
		DistributeHorizontal: "M3 3h4v18H3zM17 3h4v18h-4zM7 12h10",
		DistributeVertical: "M3 3h18v4H3zM3 17h18v4H3zM12 7v10",
		DollarSign: "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
		Edit3: "M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z",
		Equal: "M5 9h14M5 15h14",
		EyeOff:
			"M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24M1 1l22 22",
		FileSpreadsheet:
			"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 16h8M8 12h8M8 20h8",
		FileText:
			"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
		FileX: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 15l6-6M15 15l-6-6",
		Filter: "M4 3h16l-7 9v7l-2 2v-9L4 3z",
		GitBranch:
			"M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9",
		GitGraph:
			"M5 3v12M5 21a3 3 0 100-6 3 3 0 000 6zM19 3v6M19 15a3 3 0 100-6 3 3 0 000 6zM5 15a5 5 0 005-5v-2M14 8a3 3 0 100-6 3 3 0 000 6z",
		Grid3x3: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
		Group: "M3 7V5a2 2 0 012-2h2M3 17v2a2 2 0 002 2h2M17 3h2a2 2 0 012 2v2M17 21h2a2 2 0 002-2v-2",
		Hand: "M12 3v13M9 8V5a2 2 0 014 0v3M6 11V7a2 2 0 014 0v6M18 11V9a2 2 0 00-4 0v4M9 16l-3-2M15 16l3-2M6 21h12",
		Hash: "M4 9h16M4 15h16M10 3L8 21M16 3l-2 18",
		Highlighter: "M9 11l3 3L22 4l-3-3-10 10zM21 18v3H3l4-4",
		Images: "M18 22H4a2 2 0 01-2-2V6M22 18V4a2 2 0 00-2-2H8M8 18h14M14 10l3 3 4-4",
		Layers: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
		Link: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
		LineChart: "M3 3v18h18M3 18l5-5 4 3 9-9",
		LogIn: "M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3",
		LogOut: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
		Mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6",
		Map: "M1 6l7-4 8 4 7-4v16l-7 4-8-4-7 4V6zM8 2v16M16 6v16",
		MapPin: "M12 22s8-4 8-10a8 8 0 00-16 0c0 6 8 10 8 10zM12 8a4 4 0 100 8 4 4 0 000-8z",
		Maximize:
			"M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3",
		MessageSquare: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
		Minimize:
			"M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3",
		Monitor: "M2 3h20v14H2zM8 21h8M12 17v4",
		Moon: "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z",
		MousePointer: "M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3zM13 13l6 6",
		Music: "M9 18V5l12-2v13M6 21a3 3 0 100-6 3 3 0 000 6zM18 19a3 3 0 100-6 3 3 0 000 6z",
		Omega: "M4 20h8M4 4h8M12 4v16M8 12h8",
		Paintbrush: "M12 2l-5 9h10zM9 11l-3 9 6-4 6 4-3-9",
		PaintBucket: "M19 11l-7-7-8 8 7 7zM7 12l7 7M5 5l14 14",
		PanelRight: "M3 3h18v18H3zM15 3v18",
		Percent: "M19 5L5 19M7 7a2 2 0 100-4 2 2 0 000 4zM17 21a2 2 0 100-4 2 2 0 000 4z",
		Phone:
			"M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z",
		PieChart: "M12 2a10 10 0 0110 10H12V2zM12 12h10a10 10 0 01-10 10V12z",
		Play: "M5 3l14 9-14 9V3z",
		RotateCcw: "M1 4v6h6M3.51 15a9 9 0 102.13-9.36L1 10",
		RotateCw: "M23 4v6h-6M20.49 15a9 9 0 11-2.12-9.36L23 10",
		ScatterChart: "M3 3v18h18M7 7h0M15 7h0M11 17h0M19 11h0",
		SendToBack: "M9 3h12v12H9zM3 9h10v10H3zM7 7h10m0 0v10",
		Shapes: "M12 2l9 16H3zM15 22H9M12 18v4",
		Sigma: "M4 4h16L12 12l8 8H4",
		Smile:
			"M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10zM8 14s1.5 2 4 2 4-2 4-2M9 9h0M15 9h0",
		Square: "M3 3h18v18H3z",
		SquarePlus: "M3 3h18v18H3zM12 8v8M8 12h8",
		StopCircle: "M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10zM9 9h6v6H9z",
		Sun: "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 6a6 6 0 100 12 6 6 0 000-12z",
		TextCursorInput: "M3 10h4l3 3-3 3H3M21 10h-4l-3 3 3 3h4M13 4L9 20",
		Timer: "M10 2h4M12 2v6M3 13a9 9 0 0118 0 9 9 0 01-18 0zM12 13l2-2",
		Trash2:
			"M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6",
		TrendingUp: "M23 6l-9.5 9.5-5-5L1 18",
		Type: "M4 7V4h16v3M9 20h6M12 4v16",
		Ungroup:
			"M9 3H5a2 2 0 00-2 2v4M21 9V5a2 2 0 00-2-2h-4M9 21H5a2 2 0 01-2-2v-4M15 21h4a2 2 0 002-2v-4",
		Video: "M22 8l-6 4 6 4V8zM2 6h14v12H2V6z",
		Volume2: "M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07",
		VolumeX: "M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6",
		Workflow: "M3 5h4v4H3zM17 15h4v4h-4zM7 7h8v2M7 17h8v-2M15 7l-6 10",
		WrapText: "M3 6h18M3 12h12M3 18h8M16 18l3-3 3 3M16 8l3 3 3-3",
		XCircle: "M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10zM15 9l-6 6M9 9l6 6",
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
