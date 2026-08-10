import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";
import type { LeftMenuAction } from "../../types/spreadsheet";
import { LeftMenuButton } from "./LeftMenuButton";

const BUTTONS: Array<{ action: LeftMenuAction; title: string; icon: string }> =
	[
		{ action: "search", title: "Search", icon: "Search" },
		{ action: "comments", title: "Comments", icon: "MessageSquare" },
		{ action: "chat", title: "Chat", icon: "MessageSquare" },
		{ action: "spellcheck", title: "Spell Check", icon: "Edit3" },
		{ action: "support", title: "Support", icon: "HelpCircle" },
		{ action: "about", title: "About", icon: "File" },
	];

function LeftMenuInner(): JSX.Element {
	const { t } = useTranslation();

	return (
		<div
			className="se-left-menu"
			role="menubar"
			aria-orientation="vertical"
			aria-label="Left menu"
		>
			<div className="se-left-menu-btns">
				{BUTTONS.map(({ action, title, icon }) => (
					<LeftMenuButton
						key={action}
						action={action}
						title={t(title)}
						icon={icon}
						active={spreadsheetStore.activeLeftPanel === action}
						onClick={() => spreadsheetStore.toggleLeftPanel(action)}
					/>
				))}
			</div>
			<div className="se-left-panel-side" />
		</div>
	);
}

export const LeftMenu = observer(LeftMenuInner);
