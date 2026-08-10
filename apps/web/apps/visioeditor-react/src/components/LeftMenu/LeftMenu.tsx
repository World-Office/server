import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { visioStore } from "../../stores/VisioStore";
import { ShapePalette } from "../ShapePalette/ShapePalette";
import { LeftMenuButton } from "./LeftMenuButton";

const BUTTONS = [
	{ action: "thumbs" as const, title: "Pages", icon: "Minus" },
	{ action: "shapes" as const, title: "Shapes", icon: "Shapes" },
	{ action: "chat" as const, title: "Chat", icon: "MessageSquare" },
	{ action: "support" as const, title: "Support", icon: "HelpCircle" },
	{ action: "about" as const, title: "About", icon: "File" },
];

function LeftMenuInner(): JSX.Element {
	const { t } = useTranslation();

	return (
		<div
			className="visio-left-menu"
			role="menubar"
			aria-orientation="vertical"
			aria-label="Left menu"
		>
			<div className="visio-left-menu-btns">
				{BUTTONS.map(({ action, title, icon }) => (
					<LeftMenuButton
						key={action}
						action={action}
						title={t(title)}
						icon={icon}
						active={visioStore.activeLeftPanel === action}
						onClick={() => visioStore.toggleLeftPanel(action)}
					/>
				))}
			</div>
			<div className="visio-left-panel-side">
				<div
					className="visio-left-panel-chat"
					style={{
						display: visioStore.activeLeftPanel === "chat" ? "block" : "none",
					}}
				/>
				<div
					className="visio-left-panel-shapes"
					style={{
						display: visioStore.activeLeftPanel === "shapes" ? "block" : "none",
					}}
				>
					<ShapePalette />
				</div>
			</div>
		</div>
	);
}

export const LeftMenu = observer(LeftMenuInner);
