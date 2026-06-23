import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";
import type { LeftMenuAction } from "../../types/spreadsheet";
import { LeftMenuButton } from "./LeftMenuButton";

const BUTTONS: Array<{ action: LeftMenuAction; title: string; icon: string }> =
	[
		{ action: "search", title: "Search", icon: "🔍" },
		{ action: "comments", title: "Comments", icon: "💬" },
		{ action: "chat", title: "Chat", icon: "💬" },
		{ action: "spellcheck", title: "Spell Check", icon: "📝" },
		{ action: "support", title: "Support", icon: "❓" },
		{ action: "about", title: "About", icon: "ℹ" },
	];

function LeftMenuInner(): JSX.Element {
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
						title={title}
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
