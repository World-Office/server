import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";
import type { LeftMenuAction } from "../../types/spreadsheet";
import { ChatPanel } from "./ChatPanel";
import { CommentsPanel } from "./CommentsPanel";
import { LeftMenuButton } from "./LeftMenuButton";
import { SearchPanel } from "./SearchPanel";
import { SpellCheckPanel } from "./SpellCheckPanel";
import { SupportPanel } from "./SupportPanel";

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
	const activePanel = spreadsheetStore.activeLeftPanel;

	return (
		<div
			className="se-left-menu"
			role="menubar"
			aria-orientation="vertical"
			aria-label="Left menu"
			data-panel-open={activePanel !== null && activePanel !== "about"}
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
			{/* Side panels — every rail toggle maps to a real panel here. The
			    components stay mounted (display-toggled) so search results,
			    comments, chat history and the ignore list survive a collapse. */}
			<div className="se-left-panel-side">
				<SearchPanel active={activePanel === "search"} />
				<CommentsPanel active={activePanel === "comments"} />
				<ChatPanel active={activePanel === "chat"} />
				<SpellCheckPanel active={activePanel === "spellcheck"} />
				<SupportPanel active={activePanel === "support"} />
			</div>
		</div>
	);
}

export const LeftMenu = observer(LeftMenuInner);
