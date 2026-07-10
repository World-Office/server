import { observer } from "mobx-react-lite";
import { Ribbon, spreadsheetRibbonSpec } from "@world-office/editor-common";
import type { RibbonCommandDispatch, RibbonContext } from "@world-office/editor-common";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";
import { FileTab } from "./FileTab";
import type { MonacoCommand } from "./MonacoCommand";

interface ToolbarProps {
	onMonacoCommand: (command: MonacoCommand) => void;
}

const ObservedToolbar = observer(function ObservedToolbar({
	onMonacoCommand,
}: ToolbarProps) {
	const context: RibbonContext = {
		isEditMode: spreadsheetStore.isEditMode,
		isModified: spreadsheetStore.isModified,
		isSaving: spreadsheetStore.isSaving,
		canEdit: spreadsheetStore.isEditMode,
		activeTab: "",
		isWopi: !!spreadsheetStore.wopiConnection,
		connectionStatus: spreadsheetStore.wopiConnection
			? "connected"
			: "disconnected",
		userCount: 0,
		fileName: spreadsheetStore.document?.title ?? "",
	};

	const dispatch: RibbonCommandDispatch = {
		onRichTextCommand: () => {
			/* no-op — spreadsheet uses Monaco, not TipTap */
		},
		onMonacoCommand: (command: string) => {
			onMonacoCommand(command as MonacoCommand);
		},
		onCommand: (command: string) => {
			/* Custom spreadsheet commands are dispatched as custom events */
			window.dispatchEvent(
				new CustomEvent("wo-command", {
					detail: { command },
				}),
			);
		},
		onSave: async () => {
			await spreadsheetStore.saveToWopi();
		},
	};

	return (
		<Ribbon
			spec={spreadsheetRibbonSpec}
			context={context}
			dispatch={dispatch}
			beforeTabs={<FileTab />}
		/>
	);
});

export { ObservedToolbar as Toolbar };
