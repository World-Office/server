import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { presentationStore } from "../../stores/PresentationStore";
import type { RightMenuPanel } from "../../types/presentation";
import { AnimationPanel } from "./AnimationPanel";
import { RightMenuButton } from "./RightMenuButton";
import { ShapePanel } from "./ShapePanel";
import { SlidePanel } from "./SlidePanel";

const BUTTONS: Array<{ action: RightMenuPanel; title: string; icon: string }> =
	[
		{ action: "paragraph", title: "Paragraph", icon: "¶" },
		{ action: "table", title: "Table", icon: "⊞" },
		{ action: "image", title: "Image", icon: "🖼" },
		{ action: "slide", title: "Slide", icon: "📄" },
		{ action: "chart", title: "Chart", icon: "📊" },
		{ action: "shape", title: "Shape", icon: "⬡" },
		{ action: "textart", title: "TextArt", icon: "Aa" },
		{ action: "animation", title: "Animation Pane", icon: "▶" },
	];

const PANELS: Record<RightMenuPanel, JSX.Element> = {
	paragraph: <div />,
	table: <div />,
	image: <div />,
	slide: <SlidePanel />,
	chart: <div />,
	shape: <ShapePanel />,
	textart: <div />,
	animation: <AnimationPanel />,
};

function RightMenuInner(): JSX.Element {
	const { t } = useTranslation()
	const { activeRightPanel, toggleRightPanel } = presentationStore;

	return (
		<div
			className="prese-right-menu"
			role="menubar"
			aria-orientation="vertical"
			aria-label="Right menu"
		>
			<div className="prese-right-menu-btns">
				{BUTTONS.map(({ action, title, icon }) => (
					<RightMenuButton
						key={action}
						action={action}
						title={t(title)}
						icon={icon}
						active={activeRightPanel === action}
						onClick={() => toggleRightPanel(action)}
					/>
				))}
			</div>
			<div className="prese-right-panel-side">
				{activeRightPanel && PANELS[activeRightPanel]}
			</div>
		</div>
	);
}

export const RightMenu = observer(RightMenuInner);
