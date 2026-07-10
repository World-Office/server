import { Ribbon, visioRibbonSpec } from "@world-office/editor-common";
import type { RibbonCommandDispatch, RibbonContext } from "@world-office/editor-common";
import { detectWopiParams } from "@world-office/wopi-client";
import { flowchartStore } from "../../stores/FlowchartStore";
import { visioStore } from "../../stores/VisioStore";
import { exportFlowchartAsSvg } from "../FlowchartCanvas";
import { FileTab } from "./FileTab";
import type { MonacoCommand } from "./MonacoCommand";

interface ToolbarProps {
	isEdit: boolean;
	onMonacoCommand: (command: MonacoCommand) => void;
}

export function Toolbar({ isEdit, onMonacoCommand }: ToolbarProps) {
	const wopi = detectWopiParams();

	const context: RibbonContext = {
		isEditMode: isEdit,
		isModified: visioStore.isModified,
		isSaving: visioStore.isSaving,
		canEdit: isEdit,
		activeTab: "",
		isWopi: !!wopi,
		connectionStatus: "connected",
		userCount: 0,
		fileName: visioStore.document?.title ?? "",
	};

	const dispatch: RibbonCommandDispatch = {
		onMonacoCommand: (cmd: string) => onMonacoCommand(cmd as MonacoCommand),
		onRichTextCommand: () => {},
		onCommand: (cmd: string) => {
			switch (cmd) {
				case "toggleEditorMode":
					visioStore.toggleEditorMode();
					break;
				case "exportSvg":
					exportFlowchartAsSvg(flowchartStore.document);
					break;
				case "fitToPageVisio":
					visioStore.setFitToPage(!visioStore.fitToPage);
					break;
				case "fitToWidthVisio":
					visioStore.setFitToWidth(!visioStore.fitToWidth);
					break;
				default:
					window.dispatchEvent(
						new CustomEvent("wo-command", { detail: { command: cmd } }),
					);
			}
		},
	};

	return (
		<Ribbon
			spec={visioRibbonSpec}
			context={context}
			dispatch={dispatch}
			beforeTabs={<FileTab />}
		/>
	);
}
