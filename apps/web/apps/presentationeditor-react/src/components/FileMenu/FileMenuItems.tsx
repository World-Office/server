import {
	Divider,
	MenuItem as FluentMenuItem,
	makeStyles,
	mergeClasses,
	tokens,
} from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { presentationStore } from "../../stores/PresentationStore";
import type { FileMenuAction } from "../../types/presentation";

interface FileMenuItemsProps {
	onMenuClick: (action: string, hasPanel: boolean) => void;
	onBack: () => void;
}

interface FileMenuItem {
	action: FileMenuAction | "close-editor";
	caption: string;
	hasPanel: boolean;
	/** panel the entry activates when it differs from the action id */
	panel?: string;
}

const MENU_ITEMS: FileMenuItem[] = [
	{ action: "saveas", caption: "Download as...", hasPanel: true },
	{ action: "export", caption: "Export Wizard...", hasPanel: true },
	{ action: "save-copy", caption: "Save Copy as...", hasPanel: true },
	// "Save as..." targets desktop storage in the desktop bridge builds; the
	// web build has no such target, so it opens the same download/export
	// surface as "Download as..." (the word editor's desktop-less fallback)
	{
		action: "save-desktop",
		caption: "Save as...",
		hasPanel: true,
		panel: "saveas",
	},
	// "Print" opens the print-preview pane (the word editor's behaviour) — it
	// used to just close the menu, leaving the shipped PrintPreviewPanel
	// unreachable from the UI
	{
		action: "print",
		caption: "Print",
		hasPanel: true,
		panel: "printpreview",
	},
	{ action: "printpreview", caption: "Print with Preview", hasPanel: true },
	{ action: "rename", caption: "Rename...", hasPanel: true },
	{ action: "info", caption: "Document Info...", hasPanel: true },
	{ action: "rights", caption: "Access Rights...", hasPanel: true },
	{ action: "history", caption: "Version History...", hasPanel: true },
	{ action: "opts", caption: "Advanced Settings...", hasPanel: true },
	{ action: "help", caption: "Help...", hasPanel: true },
	{ action: "exit", caption: "Go to Documents", hasPanel: false },
	{ action: "close-editor", caption: "Close Editor", hasPanel: false },
	{ action: "external-help", caption: "External Help", hasPanel: false },
	{ action: "suggest", caption: "Suggest Feature", hasPanel: true },
	{ action: "create-new", caption: "Create New", hasPanel: true },
	{ action: "open-recent", caption: "Open Recent", hasPanel: true, panel: "recent" },
];

const useStyles = makeStyles({
	menuContainer: {
		padding: "8px 0",
	},
	menuItem: {
		height: "36px",
		padding: "0 20px",
		fontSize: tokens.fontSizeBase300,
		color: tokens.colorNeutralForeground1,
		whiteSpace: "nowrap",
		":hover": {
			backgroundColor: tokens.colorSubtleBackgroundHover,
		},
	},
	active: {
		backgroundColor: tokens.colorBrandBackgroundSelected,
		color: tokens.colorNeutralForegroundOnBrand,
		":hover": {
			backgroundColor: tokens.colorBrandBackgroundHover,
			color: tokens.colorNeutralForegroundOnBrand,
		},
	},
	backItem: {
		display: "flex",
		alignItems: "center",
		height: "36px",
		padding: "0 20px",
		fontSize: tokens.fontSizeBase300,
		color: tokens.colorNeutralForeground1,
		whiteSpace: "nowrap",
		":hover": {
			backgroundColor: tokens.colorSubtleBackgroundHover,
		},
	},
	backIcon: {
		display: "inlineFlex",
		alignItems: "center",
		justifyContent: "center",
		width: "20px",
		marginRight: "10px",
		fontSize: "16px",
	},
	caption: {
		display: "inlineBlock",
		overflow: "hidden",
		textOverflow: "ellipsis",
	},
	divider: {
		height: "1px",
		margin: "4px 12px",
		backgroundColor: tokens.colorNeutralStroke1,
	},
});

export function FileMenuItems({ onMenuClick, onBack }: FileMenuItemsProps) {
	const { t } = useTranslation();
	const styles = useStyles();
	const activePanel = presentationStore.activeFileMenuPanel;

	function handleBack(): void {
		onBack();
	}

	function handleKeyDown(e: React.KeyboardEvent, action: () => void): void {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			action();
		}
	}

	return (
		<div className={styles.menuContainer} role="menubar" aria-label="File menu">
			<FluentMenuItem
				className={styles.backItem}
				onClick={handleBack}
				onKeyDown={(e) => handleKeyDown(e, handleBack)}
				role="menuitem"
				icon={<span className={styles.backIcon}>←</span>}
			>
				<span className={styles.caption}>{t("Back")}</span>
			</FluentMenuItem>
			<Divider className={styles.divider} />
			{MENU_ITEMS.map((item) => (
				<FluentMenuItem
					key={item.action}
					className={mergeClasses(
						styles.menuItem,
						activePanel === (item.panel ?? item.action)
							? styles.active
							: undefined,
					)}
					onClick={() =>
						onMenuClick(item.panel ?? item.action, item.hasPanel)
					}
					onKeyDown={(e) =>
						handleKeyDown(e, () =>
							onMenuClick(item.panel ?? item.action, item.hasPanel),
						)
					}
					role="menuitem"
				>
					<span className={styles.caption}>{t(item.caption)}</span>
				</FluentMenuItem>
			))}
		</div>
	);
}
