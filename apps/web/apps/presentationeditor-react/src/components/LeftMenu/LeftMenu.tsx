import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { presentationStore } from "../../stores/PresentationStore";
import type { LeftMenuAction } from "../../types/presentation";
import { SlideThumbnails } from "../SlideThumbnails";
import { LeftMenuButton } from "./LeftMenuButton";

const BUTTONS: Array<{ action: LeftMenuAction; title: string; icon: string }> =
	[
		{ action: "search", title: "Search", icon: "🔍" },
		{ action: "slides", title: "Slides", icon: "📊" },
		{ action: "comments", title: "Comments", icon: "💬" },
		{ action: "chat", title: "Chat", icon: "💬" },
		{ action: "support", title: "Support", icon: "❓" },
		{ action: "about", title: "About", icon: "ℹ" },
	];

function LeftMenuInner(): JSX.Element {
	const { t } = useTranslation();

	return (
		<div
			className="prese-left-menu"
			role="menubar"
			aria-orientation="vertical"
			aria-label="Left menu"
		>
			<div className="prese-left-menu-btns">
				{BUTTONS.map(({ action, title, icon }) => (
					<LeftMenuButton
						key={action}
						action={action}
						title={t(title)}
						icon={icon}
						active={presentationStore.activeLeftPanel === action}
						onClick={() => presentationStore.toggleLeftPanel(action)}
					/>
				))}
			</div>
			<div className="prese-left-panel-side">
				{presentationStore.activeLeftPanel === "slides" && <SlideThumbnails />}
				<div
					className="prese-left-panel-chat"
					style={{
						display:
							presentationStore.activeLeftPanel === "chat" ? "block" : "none",
					}}
				/>
			</div>
		</div>
	);
}

export const LeftMenu = observer(LeftMenuInner);
