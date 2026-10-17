import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { presentationStore } from "../../stores/PresentationStore";
import type { LeftMenuAction } from "../../types/presentation";
import { ChatPanel } from "./ChatPanel";
import { CommentsPanel } from "./CommentsPanel";
import { LeftMenuButton } from "./LeftMenuButton";
import { SearchPanel } from "./SearchPanel";
import { SlideThumbnails } from "../SlideThumbnails";
import { SupportPanel } from "./SupportPanel";

const BUTTONS: Array<{ action: LeftMenuAction; title: string; icon: string }> =
	[
		{ action: "search", title: "Search", icon: "Search" },
		{ action: "slides", title: "Slides", icon: "BarChart3" },
		{ action: "comments", title: "Comments", icon: "MessageSquare" },
		{ action: "chat", title: "Chat", icon: "MessageSquare" },
		{ action: "support", title: "Support", icon: "HelpCircle" },
		{ action: "about", title: "About", icon: "File" },
	];

function LeftMenuInner(): JSX.Element {
	const { t } = useTranslation();
	const activePanel = presentationStore.activeLeftPanel;

	return (
		<div
			className="prese-left-menu"
			role="menubar"
			aria-orientation="vertical"
			aria-label="Left menu"
			data-panel-open={activePanel !== null && activePanel !== "about"}
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
			{/* Side panels — every rail toggle maps to a real panel here. The
			    components stay mounted (display-toggled) so search results,
			    comments, chat history and drafts survive a collapse. About is an
			    overlay over the editor (see Viewport), not a side panel. */}
			<div className="prese-left-panel-side">
				{activePanel === "slides" && <SlideThumbnails />}
				<SearchPanel active={activePanel === "search"} />
				<CommentsPanel active={activePanel === "comments"} />
				<ChatPanel active={activePanel === "chat"} />
				<SupportPanel active={activePanel === "support"} />
			</div>
		</div>
	);
}

export const LeftMenu = observer(LeftMenuInner);
