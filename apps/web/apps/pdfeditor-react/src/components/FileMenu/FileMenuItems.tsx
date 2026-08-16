import { Button, Divider, makeStyles, mergeClasses, tokens } from "@fluentui/react-components"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { pdfStore } from "../../stores/PdfStore"
import type { FileMenuAction } from "../../types/pdf"

interface FileMenuItemsProps {
	onMenuClick: (action: string, hasPanel: boolean) => void
	onBack: () => void
}

interface MenuItem {
	action: FileMenuAction | "close-editor" | "external-help" | "file:open" | "file:exit"
	caption: string
	hasPanel: boolean
}

const MENU_ITEMS: MenuItem[] = [
	{ action: "new", caption: "New...", hasPanel: true },
	{ action: "saveas", caption: "Download as...", hasPanel: true },
	{ action: "export", caption: "Export Wizard...", hasPanel: true },
	{ action: "save-copy", caption: "Save Copy as...", hasPanel: true },
	{ action: "printpreview", caption: "Print", hasPanel: true },
	{ action: "rename", caption: "Rename...", hasPanel: false },
	{ action: "info", caption: "Document Info...", hasPanel: true },
	{ action: "opts", caption: "Advanced Settings...", hasPanel: true },
	{ action: "help", caption: "Help...", hasPanel: true },
	{ action: "exit", caption: "Go to Documents", hasPanel: false },
]

const useStyles = makeStyles({
	list: {
		display: "block",
		listStyle: "none",
		margin: 0,
		padding: "8px 0",
	},
	item: {
		display: "flex",
		alignItems: "center",
		height: "36px",
		padding: "0 20px",
		cursor: "pointer",
		whiteSpace: "nowrap",
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground1,
		":hover": {
			backgroundColor: tokens.colorNeutralBackground1Hover,
		},
	},
	itemActive: {
		backgroundColor: tokens.colorBrandBackground,
		color: tokens.colorNeutralForegroundOnBrand,
		":hover": {
			backgroundColor: tokens.colorBrandBackgroundHover,
		},
	},
	backIcon: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: "20px",
		marginRight: "10px",
		fontSize: tokens.fontSizeBase300,
	},
	caption: {
		display: "inline-block",
		overflow: "hidden",
		textOverflow: "ellipsis",
	},
})

export function FileMenuItems({ onMenuClick, onBack }: FileMenuItemsProps): JSX.Element {
	const { t } = useTranslation()
	const styles = useStyles()
	const activePanel = pdfStore.activeFileMenuPanel

	return (
		<ul className={styles.list}>
			<Button
				appearance="subtle"
				size="large"
				icon={<span className={styles.backIcon}>←</span>}
				className={styles.item}
				onClick={handleBack}
				aria-label={t("Back")}
			>
				{t("Back")}
			</Button>
			<Divider />
			{MENU_ITEMS.map((item) => (
				<Button
					key={item.action}
					appearance="subtle"
					size="large"
					className={mergeClasses(styles.item, activePanel === item.action ? styles.itemActive : undefined)}
					onClick={() => onMenuClick(item.action, item.hasPanel)}
				>
					<span className={styles.caption}>{t(item.caption)}</span>
				</Button>
			))}
		</ul>
	)

	function handleBack(): void {
		onBack()
	}
}
