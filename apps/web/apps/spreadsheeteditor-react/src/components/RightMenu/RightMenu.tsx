import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";
import type { RightMenuPanel } from "../../types/spreadsheet";
import { RightMenuButton } from "./RightMenuButton";

const BUTTONS: Array<{ action: RightMenuPanel; title: string; icon: string }> =
	[
		{ action: "cellsettings", title: "Cell Settings", icon: "Hash" },
		{ action: "shapesettings", title: "Shape Settings", icon: "Shapes" },
		{ action: "imagesettings", title: "Image Settings", icon: "Image" },
		{ action: "chartsettings", title: "Chart Settings", icon: "BarChart3" },
		{ action: "textartsettings", title: "TextArt Settings", icon: "Type" },
		{
			action: "pivottablesettings",
			title: "Pivot Table Settings",
			icon: "Grid3x3",
		},
		{ action: "slicersettings", title: "Slicer Settings", icon: "ChevronDown" },
		{ action: "signaturesettings", title: "Signature Settings", icon: "Lock" },
		{ action: "plugins", title: "Plugins", icon: "Settings" },
	];

function RightMenuInner(): JSX.Element {
	const { t } = useTranslation();

	return (
		<div
			className="se-right-menu"
			role="menubar"
			aria-orientation="vertical"
			aria-label="Right menu"
		>
			<div className="se-right-menu-btns">
				{BUTTONS.map(({ action, title, icon }) => (
					<RightMenuButton
						key={action}
						action={action}
						title={t(title)}
						icon={icon}
						active={spreadsheetStore.activeRightPanel === action}
						onClick={() => spreadsheetStore.toggleRightPanel(action)}
					/>
				))}
			</div>
			<div className="se-right-panel-side" />
		</div>
	);
}

export const RightMenu = observer(RightMenuInner);
