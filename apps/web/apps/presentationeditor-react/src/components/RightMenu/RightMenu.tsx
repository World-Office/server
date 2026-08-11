import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { presentationStore } from "../../stores/PresentationStore";
import type { RightMenuPanel } from "../../types/presentation";
import { AnimationPanel } from "./AnimationPanel";
import { ChartPanel } from "./ChartPanel";
import { ImagePanel } from "./ImagePanel";
import { ParagraphPanel } from "./ParagraphPanel";
import { RightMenuButton } from "./RightMenuButton";
import { ShapePanel } from "./ShapePanel";
import { SlidePanel } from "./SlidePanel";
import { TablePanel } from "./TablePanel";
import { TextArtPanel } from "./TextArtPanel";

const BUTTONS: Array<{ action: RightMenuPanel; title: string; icon: string }> =
	[
		{ action: "paragraph", title: "Paragraph", icon: "Type" },
		{ action: "table", title: "Table", icon: "Table2" },
		{ action: "image", title: "Image", icon: "Image" },
		{ action: "slide", title: "Slide", icon: "FileText" },
		{ action: "chart", title: "Chart", icon: "BarChart3" },
		{ action: "shape", title: "Shape", icon: "Shapes" },
		{ action: "textart", title: "TextArt", icon: "Type" },
		{ action: "animation", title: "Animation Pane", icon: "Play" },
	];

const PANELS: Record<RightMenuPanel, JSX.Element> = {
	paragraph: <ParagraphPanel visible={true} />,
	table: <TablePanel visible={true} />,
	image: <ImagePanel visible={true} />,
	slide: <SlidePanel />,
	chart: <ChartPanel visible={true} />,
	shape: <ShapePanel />,
	textart: <TextArtPanel visible={true} />,
	animation: <AnimationPanel />,
};

function RightMenuInner(): JSX.Element {
	const { t } = useTranslation();
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
