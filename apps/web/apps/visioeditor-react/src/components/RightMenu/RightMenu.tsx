import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { flowchartStore } from "../../stores/FlowchartStore";
import { visioStore } from "../../stores/VisioStore";
import type { RightMenuPanel } from "../../types/visio";
import { ConnectorFormatPanel } from "./ConnectorFormatPanel";
import { LayersPanel } from "./LayersPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { RightMenuButton } from "./RightMenuButton";
import { ShapeFormatPanel } from "./ShapeFormatPanel";

const BUTTONS: Array<{ action: RightMenuPanel; title: string; icon: string }> =
	[
		{ action: "shapeformat", title: "Shape Format", icon: "Shapes" },
		{ action: "connectorformat", title: "Connector", icon: "Connector" },
		{ action: "properties", title: "Properties", icon: "Info" },
		{ action: "layers", title: "Layers", icon: "Layers" },
	];

function RightMenuInner(): JSX.Element {
	return (
		<div
			className="vi-right-menu"
			role="menubar"
			aria-orientation="vertical"
			aria-label="Right menu"
		>
			<div className="vi-right-menu-btns">
				{BUTTONS.map(({ action, title, icon }) => (
					<RightMenuButton
						key={action}
						action={action}
						title={title}
						icon={icon}
						active={visioStore.activeRightPanel === action}
						onClick={() => visioStore.toggleRightPanel(action)}
					/>
				))}
			</div>
			<div className="vi-right-panel-side">
				<ShapeFormatPanel
					visible={visioStore.activeRightPanel === "shapeformat"}
				/>
				<ConnectorFormatPanel
					visible={
						visioStore.activeRightPanel === "connectorformat" ||
						flowchartStore.selectedEdgeIds.length > 0
					}
				/>
				<PropertiesPanel
					visible={visioStore.activeRightPanel === "properties"}
				/>
				<LayersPanel visible={visioStore.activeRightPanel === "layers"} />
			</div>
		</div>
	);
}

export const RightMenu = observer(RightMenuInner);
