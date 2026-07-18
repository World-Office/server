import { useTranslation } from "react-i18next";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";
import type { FileMenuAction } from "../../types/spreadsheet";

interface FileMenuItemsProps {
	onMenuClick: (action: string, hasPanel: boolean) => void;
	onBack: () => void;
}

interface MenuItem {
	action: FileMenuAction | "close-editor";
	caption: string;
	hasPanel: boolean;
}

const MENU_ITEMS: MenuItem[] = [
	{ action: "saveas", caption: "Download as...", hasPanel: true },
	{ action: "save-copy", caption: "Save Copy as...", hasPanel: true },
	{ action: "save-desktop", caption: "Save as...", hasPanel: false },
	{ action: "export-pdf", caption: "Export to PDF", hasPanel: false },
	{ action: "printpreview", caption: "Print with Preview", hasPanel: false },
	{ action: "rename", caption: "Rename...", hasPanel: false },
	{ action: "info", caption: "Document Info...", hasPanel: true },
	{ action: "rights", caption: "Access Rights...", hasPanel: true },
	{ action: "history", caption: "Version History...", hasPanel: true },
	{ action: "opts", caption: "Advanced Settings...", hasPanel: true },
	{ action: "help", caption: "Help...", hasPanel: true },
	{ action: "exit", caption: "Go to Documents", hasPanel: false },
	{ action: "close-editor", caption: "Close Editor", hasPanel: false },
	{ action: "external-help", caption: "External Help", hasPanel: false },
	{ action: "suggest", caption: "Suggest Feature", hasPanel: false },
	{ action: "create-new", caption: "Create New", hasPanel: false },
	{ action: "open-recent", caption: "Open Recent", hasPanel: false },
	{ action: "protect", caption: "Protect Document", hasPanel: true },
];

export function FileMenuItems({ onMenuClick, onBack }: FileMenuItemsProps) {
	const { t } = useTranslation();
	const activePanel = spreadsheetStore.activeFileMenuPanel;

	function handleBack(): void {
		onBack();
	}

	return (
		<ul className="se-file-menu-items">
			<div
				className="se-file-menu-item"
				role="menuitem"
				tabIndex={0}
				onClick={handleBack}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleBack();
					}
				}}
			>
				<span className="se-file-menu-item-icon">←</span>
				<span className="se-file-menu-item-caption">{t("Back")}</span>
			</div>
			<li className="se-file-menu-divider" />
			{MENU_ITEMS.map((item) => (
				<div
					key={item.action}
					className={`se-file-menu-item${activePanel === item.action ? " active" : ""}`}
					role="menuitem"
					tabIndex={0}
					onClick={() => onMenuClick(item.action, item.hasPanel)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							onMenuClick(item.action, item.hasPanel);
						}
					}}
				>
					<span className="se-file-menu-item-caption">{t(item.caption)}</span>
				</div>
			))}
		</ul>
	);
}
